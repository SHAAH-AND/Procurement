'use strict';

// Document store behind the /api/v1 surface.
//
// The React client was built against an ERPNext-style relational model
// (header + lines, camelCase fields, lower-case statuses). Rather than bend
// 36 legacy tables to that shape, every v1 document is a JSON header row in
// V1Docs with its sub-collections (lines, vendors, ...) as JSON rows in
// V1Lines. The indexed header columns (Kind, Status, OwnerID, RefID,
// DocNumber) carry exactly what the list endpoints filter on; everything else
// lives in the Data column.
//
// Catalyst limits: ZCQL refuses LIMIT > 300, and a text column holds 10 000
// characters. Both are respected here so no caller can trip them.

const ZCQL_MAX = 300;
const DATA_MAX = 10000;
// Keys that hold sub-collections or joined documents on a hydrated record.
// They are attached at read time and must never be written into Data.
const INCLUDE_KEYS = ['lines', 'vendors', 'bids', 'awards', 'receives', 'bills', 'payments', 'po', 'bill', 'rfq', 'total', 'balance'];

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

function nowIso() { return new Date().toISOString(); }

// Catalyst returns datetimes as "yyyy-MM-dd HH:mm:ss:SSS"; the client wants ISO.
function toIso(value) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (m) return new Date(`${m[1]}T${m[2]}Z`).toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.expose = true;
    this.status = status;
  }
}
const badRequest = m => new HttpError(400, m);
const notFound = m => new HttpError(404, m);
const forbidden = m => new HttpError(403, m);
const conflict = m => new HttpError(409, m);

class DocStore {
  constructor(catalystApp, orgId) {
    this.app = catalystApp;
    this.orgId = String(orgId);
  }

  // ---- low level --------------------------------------------------------
  zcql(q) { return this.app.zcql().executeZCQLQuery(q); }
  docs() { return this.app.datastore().table('V1Docs'); }
  lines() { return this.app.datastore().table('V1Lines'); }

  _serialize(obj) {
    const s = JSON.stringify(obj || {});
    if (s.length > DATA_MAX) {
      throw badRequest('This record is too large to store. Reduce the amount of free text and try again.');
    }
    return s;
  }

  _docFromRow(row) {
    const data = safeParse(row.Data, {});
    const doc = {
      id: String(row.ROWID),
      ...data,
      status: row.Status || data.status || null,
      createdAt: data.createdAt || toIso(row.CREATEDTIME),
      updatedAt: toIso(row.MODIFIEDTIME) || data.updatedAt || null
    };
    if (doc.tenantId === undefined) doc.tenantId = this.orgId;
    return doc;
  }

  _lineFromRow(row) {
    const data = safeParse(row.Data, {});
    return { id: String(row.ROWID), ...data, _sub: String(row.Kind || '').split('.').pop() };
  }

  _headerColumns(kind, doc) {
    // Which Data field is the document number / owner / ref, by kind.
    const NUMBER = {
      pr: 'prNumber', po: 'poNumber', receive: 'grnNumber', bill: 'billNumber',
      rfq: 'rfqNumber', batch: 'batchNumber', budget: 'name', setting: 'key',
      credit: 'vendorName', payment: 'vendorName', recurrence: 'profileName',
      bid: 'vendorName', award: 'rfqId'
    };
    const OWNER = {
      pr: 'requestorId', po: 'createdBy', receive: 'createdBy', bill: 'createdBy',
      payment: 'createdBy', rfq: 'createdBy', batch: 'createdBy', budget: 'createdBy',
      award: 'decidedBy'
    };
    const REF = {
      receive: 'poId', bill: 'poId', payment: 'billId', bid: 'rfqId', award: 'rfqId',
      recurrence: 'templateBillId', setting: 'key', credit: 'vendorName', po: 'sourcePrId',
      rfq: 'prId'
    };
    const pick = f => (f && doc[f] !== undefined && doc[f] !== null) ? String(doc[f]).slice(0, 100) : '';
    return {
      DocNumber: pick(NUMBER[kind]),
      Status: doc.status ? String(doc.status).slice(0, 40) : '',
      OwnerID: pick(OWNER[kind]),
      RefID: pick(REF[kind])
    };
  }

  // Run a query in pages so callers never hit the 300-row ceiling.
  async _all(baseSql, max = 1000) {
    const out = [];
    let offset = 0;
    while (out.length < max) {
      const page = await this.zcql(`${baseSql} LIMIT ${offset}, ${ZCQL_MAX}`);
      out.push(...page);
      if (page.length < ZCQL_MAX) break;
      offset += ZCQL_MAX;
    }
    return out;
  }

  async _subsFor(docIds) {
    const bySub = new Map();
    if (!docIds.length) return bySub;
    for (let i = 0; i < docIds.length; i += 40) {
      const chunk = docIds.slice(i, i + 40).map(id => `'${esc(id)}'`).join(', ');
      const rows = await this._all(
        `SELECT * FROM V1Lines WHERE OrgID = '${esc(this.orgId)}' AND DocID IN (${chunk}) ORDER BY ROWID ASC`,
        5000
      );
      for (const r of rows) {
        const row = r.V1Lines;
        const line = this._lineFromRow(row);
        const sub = line._sub; delete line._sub;
        const docId = String(row.DocID);
        if (!bySub.has(docId)) bySub.set(docId, {});
        const bucket = bySub.get(docId);
        (bucket[sub] = bucket[sub] || []).push(line);
      }
    }
    return bySub;
  }

  _attach(docs, subs, defaults = ['lines']) {
    for (const d of docs) {
      const bucket = subs.get(d.id) || {};
      for (const k of defaults) if (!bucket[k]) bucket[k] = [];
      Object.assign(d, bucket);
    }
    return docs;
  }

  // ---- reads ------------------------------------------------------------
  async list(kind, { status, ownerId, refId, refIds, limit = 100, order = 'DESC', subs = ['lines'] } = {}) {
    let sql = `SELECT * FROM V1Docs WHERE OrgID = '${esc(this.orgId)}' AND Kind = '${esc(kind)}'`;
    if (status) sql += Array.isArray(status)
      ? ` AND Status IN (${status.map(s => `'${esc(s)}'`).join(', ')})`
      : ` AND Status = '${esc(status)}'`;
    if (ownerId) sql += ` AND OwnerID = '${esc(ownerId)}'`;
    if (refId) sql += ` AND RefID = '${esc(refId)}'`;
    if (refIds && refIds.length) sql += ` AND RefID IN (${refIds.map(s => `'${esc(s)}'`).join(', ')})`;
    sql += ` ORDER BY ROWID ${order === 'ASC' ? 'ASC' : 'DESC'}`;
    const rows = await this._all(sql, Math.max(1, Math.min(limit, 1000)));
    const docs = rows.slice(0, limit).map(r => this._docFromRow(r.V1Docs));
    if (!subs) return docs;
    return this._attach(docs, await this._subsFor(docs.map(d => d.id)), subs);
  }

  async count(kind) {
    const rows = await this.zcql(
      `SELECT COUNT(ROWID) FROM V1Docs WHERE OrgID = '${esc(this.orgId)}' AND Kind = '${esc(kind)}'`
    );
    const rec = rows[0] && rows[0].V1Docs;
    const v = rec ? (rec['COUNT(ROWID)'] ?? Object.values(rec)[0]) : 0;
    return Number(v) || 0;
  }

  async get(kind, id, subs = ['lines']) {
    if (!/^\d{1,25}$/.test(String(id || ''))) return null;
    const rows = await this.zcql(
      `SELECT * FROM V1Docs WHERE ROWID = '${esc(id)}' AND OrgID = '${esc(this.orgId)}' AND Kind = '${esc(kind)}' LIMIT 1`
    );
    if (!rows.length) return null;
    const doc = this._docFromRow(rows[0].V1Docs);
    if (!subs) return doc;
    return this._attach([doc], await this._subsFor([doc.id]), subs)[0];
  }

  async mustGet(kind, id, label, subs) {
    const doc = await this.get(kind, id, subs);
    if (!doc) throw notFound(`${label || 'Record'} not found`);
    return doc;
  }

  async lineById(lineId) {
    if (!/^\d{1,25}$/.test(String(lineId || ''))) return null;
    const rows = await this.zcql(
      `SELECT * FROM V1Lines WHERE ROWID = '${esc(lineId)}' AND OrgID = '${esc(this.orgId)}' LIMIT 1`
    );
    if (!rows.length) return null;
    const line = this._lineFromRow(rows[0].V1Lines);
    line.docId = String(rows[0].V1Lines.DocID);
    return line;
  }

  // Tenant-agnostic lookup by LookupKey (invite tokens are globally unique).
  static async lineByKey(catalystApp, subKind, key) {
    const rows = await catalystApp.zcql().executeZCQLQuery(
      `SELECT * FROM V1Lines WHERE Kind = '${esc(subKind)}' AND LookupKey = '${esc(key)}' LIMIT 1`
    );
    if (!rows.length) return null;
    const row = rows[0].V1Lines;
    const data = safeParse(row.Data, {});
    return { id: String(row.ROWID), ...data, docId: String(row.DocID), orgId: String(row.OrgID) };
  }

  // ---- writes -----------------------------------------------------------
  async insert(kind, data, subs = {}) {
    const doc = { ...data, createdAt: data.createdAt || nowIso(), updatedAt: nowIso() };
    const cols = this._headerColumns(kind, doc);
    const inserted = await this.docs().insertRow({
      OrgID: this.orgId, Kind: kind, ...cols, Data: this._serialize(doc)
    });
    const id = String(inserted.ROWID);
    for (const [sub, items] of Object.entries(subs)) {
      await this.insertSub(kind, id, sub, items);
    }
    return this.get(kind, id, Object.keys(subs).length ? Object.keys(subs) : ['lines']);
  }

  async update(kind, id, patch) {
    const current = await this.get(kind, id, null);
    if (!current) throw notFound('Record not found');
    const { id: _id, createdAt, updatedAt, ...rest } = current;
    const merged = { ...rest, ...patch, createdAt, updatedAt: nowIso() };
    // Sub-collections and joined records are never stored in the header.
    for (const k of INCLUDE_KEYS) delete merged[k];
    const cols = this._headerColumns(kind, merged);
    await this.docs().updateRow({ ROWID: id, ...cols, Data: this._serialize(merged) });
    return merged;
  }

  async insertSub(kind, docId, sub, items) {
    if (!items || !items.length) return [];
    const rows = items.map((item, i) => {
      const { id, docId: _d, ...data } = item;
      return {
        OrgID: this.orgId, Kind: `${kind}.${sub}`, DocID: String(docId), Seq: i,
        LookupKey: data.inviteToken ? String(data.inviteToken).slice(0, 100)
          : data.poLineId ? String(data.poLineId).slice(0, 100)
          : data.rfqLineId ? String(data.rfqLineId).slice(0, 100)
          : data.billId ? String(data.billId).slice(0, 100)
          : '',
        Data: this._serialize(data)
      };
    });
    const out = [];
    for (let i = 0; i < rows.length; i += 100) {
      const res = await this.lines().insertRows(rows.slice(i, i + 100));
      out.push(...(res || []));
    }
    return out;
  }

  async deleteSub(docId, sub, kind) {
    const rows = await this._all(
      `SELECT ROWID FROM V1Lines WHERE OrgID = '${esc(this.orgId)}' AND DocID = '${esc(docId)}'` +
      (sub ? ` AND Kind = '${esc(`${kind}.${sub}`)}'` : ''),
      5000
    );
    for (const r of rows) await this.lines().deleteRow(r.V1Lines.ROWID);
    return rows.length;
  }

  async replaceSub(kind, docId, sub, items) {
    await this.deleteSub(docId, sub, kind);
    return this.insertSub(kind, docId, sub, items);
  }

  async updateLine(lineId, patch) {
    const line = await this.lineById(lineId);
    if (!line) throw notFound('Line not found');
    const { id, docId, ...data } = line;
    const merged = { ...data, ...patch };
    const row = { ROWID: lineId, Data: this._serialize(merged) };
    if (merged.inviteToken) row.LookupKey = String(merged.inviteToken).slice(0, 100);
    await this.lines().updateRow(row);
    return { id, docId, ...merged };
  }

  async remove(kind, id) {
    await this.deleteSub(id, null, kind);
    await this.docs().deleteRow(id);
    return true;
  }

  // Document numbering: "PREFIX-0001", optionally driven by a numbering
  // setting saved from Settings -> Transaction Number Series.
  async nextNumber(kind, prefix, seriesKey) {
    if (seriesKey) {
      try {
        const setting = await this.getSetting(seriesKey);
        if (setting && typeof setting === 'object') {
          const pfx = String(setting.prefix || prefix).trim() || prefix;
          const next = Number(setting.next) || (await this.count(kind)) + 1;
          await this.putSetting(seriesKey, { ...setting, prefix: pfx, next: next + 1 });
          return `${pfx}-${String(next).padStart(4, '0')}`;
        }
      } catch { /* fall through to count-based numbering */ }
    }
    const count = await this.count(kind);
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  // ---- settings (key/value) ---------------------------------------------
  async allSettings() {
    const rows = await this.list('setting', { limit: 500, subs: null });
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async getSetting(key) {
    const rows = await this.list('setting', { refId: key, limit: 1, subs: null });
    return rows.length ? rows[0].value : undefined;
  }

  async putSetting(key, value) {
    const rows = await this.list('setting', { refId: key, limit: 1, subs: null });
    if (rows.length) {
      await this.update('setting', rows[0].id, { key, value });
    } else {
      await this.insert('setting', { key, value });
    }
  }
}

module.exports = { DocStore, HttpError, badRequest, notFound, forbidden, conflict, esc, safeParse, nowIso, toIso };
