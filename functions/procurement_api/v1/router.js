'use strict';

// /api/v1 — the contract the React client (frontend/) is built against.
//
// Documents (requests, orders, receives, bills, payments, credits, RFQs, bids,
// awards, recurrences, batches, budgets, settings) live in the v1 document
// store (see store.js). Masters — items, vendors, users, roles, properties —
// are the installation's existing tables, translated to the client's shape so
// the catalogue and the people already configured keep working.
//
// Every handler is wrapped: a thrown HttpError becomes its status + message,
// anything else is a 500 with a support reference (never the raw stack).

const express = require('express');
const crypto = require('crypto');
const { DocStore, HttpError, badRequest, notFound, forbidden, conflict, esc, safeParse } = require('./store');
const { permissionsFromProfile, isAdmin, assertCan, assertNotSelfApprover, fullMatrix } = require('./access');

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const trimOrNull = v => (v === undefined || v === null) ? null : (String(v).trim() || null);
const isoOrNull = v => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

function wrap(fn) {
  return async (req, res) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out === undefined ? {} : out);
    } catch (err) {
      if (err && err.expose) {
        return res.status(err.status || 400).json({ error: err.message, message: err.message, code: err.code });
      }
      const ref = crypto.randomBytes(4).toString('hex');
      console.error(`[v1 err:${ref}]`, err && err.stack ? err.stack : err);
      res.status(500).json({
        error: `Something went wrong on our side. Quote reference ${ref} if you contact support.`,
        message: `Something went wrong on our side. Quote reference ${ref} if you contact support.`,
        code: 'INTERNAL_ERROR', reference: ref
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Users / profiles (existing tables)
// ---------------------------------------------------------------------------

const profileCache = new Map(); // ROWID -> { at, profile }
const PROFILE_TTL = 60 * 1000;

async function loadProfile(req, profileId) {
  if (!profileId) return null;
  const hit = profileCache.get(String(profileId));
  if (hit && Date.now() - hit.at < PROFILE_TTL) return hit.profile;
  const rows = await req.catalystApp.zcql().executeZCQLQuery(
    `SELECT * FROM Profiles WHERE ROWID = '${esc(profileId)}' AND OrgID = '${esc(req.orgId)}' LIMIT 1`
  );
  const profile = rows[0] ? rows[0].Profiles : null;
  profileCache.set(String(profileId), { at: Date.now(), profile });
  return profile;
}

function userStatus(row) {
  const s = String(row.Status || 'Active');
  if (s === 'Invited') return 'invited';
  if (s === 'Active') return 'active';
  return 'disabled';
}

async function v1UserFromRow(req, row) {
  const profile = await loadProfile(req, row.ProfileID);
  const roles = profile ? [String(profile.ProfileName)] : [];
  const permissions = profile ? permissionsFromProfile(profile) : [];
  return {
    id: String(row.ROWID),
    userId: String(row.ROWID),
    tenantId: String(req.orgId),
    email: String(row.Email || '').toLowerCase(),
    name: row.FullName || null,
    department: row.Department || null,
    status: userStatus(row),
    createdAt: row.CREATEDTIME ? new Date(String(row.CREATEDTIME).replace(/:(\d{3})$/, '.$1').replace(' ', 'T') + 'Z').toISOString() : null,
    approvalLimit: Number(row.ApprovalLimit || 0),
    roles,
    permissions
  };
}

async function listProfiles(req) {
  const rows = await req.catalystApp.zcql().executeZCQLQuery(
    `SELECT * FROM Profiles WHERE OrgID = '${esc(req.orgId)}' ORDER BY ROWID ASC`
  );
  // The same profile name can exist twice (setup ran twice on one install);
  // the client keys roles by name, so keep the first of each.
  const seen = new Map();
  for (const r of rows) {
    const p = r.Profiles;
    const name = String(p.ProfileName || '').trim();
    if (!name || seen.has(name)) continue;
    seen.set(name, { id: String(p.ROWID), name, description: p.Description || '', permissions: permissionsFromProfile(p) });
  }
  return [...seen.values()];
}

async function profileByName(req, name) {
  const all = await listProfiles(req);
  return all.find(p => p.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
}

async function userNameById(req, id) {
  if (!id) return null;
  const rows = await req.catalystApp.zcql().executeZCQLQuery(
    `SELECT FullName, Email FROM Users WHERE ROWID = '${esc(id)}' AND OrgID = '${esc(req.orgId)}' LIMIT 1`
  );
  const u = rows[0] && rows[0].Users;
  return u ? (u.FullName || u.Email) : null;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

function createV1Router(deps) {
  const {
    provisionInvitedUser, inviteWorkspaceUser, updateWorkspaceUser,
    safeTable, audit, buildVersion
  } = deps;
  const r = express.Router();

  // Public (no session): health + the vendor quote portal.
  r.get('/health', (req, res) => res.json({ ok: true, service: 'procurement_api', api: 'v1', version: buildVersion, time: new Date().toISOString() }));

  // ---- Vendor portal: magic-link token, tenant resolved from the token ----
  async function portalContext(req) {
    const v = await DocStore.lineByKey(req.catalystApp, 'rfq.vendors', req.params.token);
    if (!v) throw notFound('Invalid or expired invite link');
    const store = new DocStore(req.catalystApp, v.orgId);
    const rfq = await store.get('rfq', v.docId, ['lines', 'vendors']);
    if (!rfq) throw notFound('Invalid or expired invite link');
    return { v, rfq, store };
  }

  r.get('/portal/rfqs/:token', wrap(async (req) => {
    const { v, rfq } = await portalContext(req);
    if (!['submitted', 'awarded_partial'].includes(rfq.status)) throw badRequest(`This RFQ is ${rfq.status}`);
    return {
      vendorName: v.vendorName, rfqNumber: rfq.rfqNumber, dueDate: rfq.dueDate,
      message: rfq.message, terms: rfq.terms, quoteStatus: v.quoteStatus,
      lines: rfq.lines.map(l => ({ rfqLineId: l.id, itemName: l.itemName, quantity: l.quantity, unit: l.unit, needBy: l.needBy, openQty: l.openQty }))
    };
  }));

  r.post('/portal/rfqs/:token/quotes', wrap(async (req) => {
    const { v, rfq, store } = await portalContext(req);
    const dto = req.body || {};
    if (!['submitted', 'awarded_partial'].includes(rfq.status)) throw badRequest(`This RFQ is ${rfq.status}`);
    if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('Quote at least one line');
    let total = 0;
    const bidLines = [];
    for (const l of dto.lines) {
      const rl = rfq.lines.find(x => x.id === String(l.rfqLineId));
      if (!rl) throw badRequest('Unknown RFQ line');
      const qty = Number(l.quantity), price = Number(l.unitPrice);
      if (!(qty > 0) || qty > (Number(rl.openQty) || 0) + 1e-9) throw badRequest(`"${rl.itemName}": max open qty ${rl.openQty}`);
      if (!(price >= 0)) throw badRequest('Unit price must be >= 0');
      total += qty * price;
      bidLines.push({
        rfqLineId: rl.id, itemName: rl.itemName, quantity: qty, unitPrice: price,
        amount: round2(qty * price), leadDays: l.leadDays != null ? Number(l.leadDays) : null, note: trimOrNull(l.note)
      });
    }
    // Replace semantics: this vendor's earlier submitted bids are withdrawn.
    const earlier = await store.list('bid', { refId: rfq.id, status: 'submitted', subs: null });
    for (const b of earlier) {
      if (String(b.vendorName).toLowerCase() === String(v.vendorName).toLowerCase()) {
        await store.update('bid', b.id, { status: 'withdrawn' });
      }
    }
    const bid = await store.insert('bid', {
      rfqId: rfq.id, vendorId: v.vendorId || null, vendorName: v.vendorName,
      currency: dto.currency || rfq.currency || 'LKR', validTill: isoOrNull(dto.validTill),
      totalAmount: round2(total), status: 'submitted', submittedAt: new Date().toISOString()
    }, { lines: bidLines });
    await store.updateLine(v.id, { quoteStatus: 'received' });
    return bid;
  }));

  r.post('/portal/rfqs/:token/withdraw', wrap(async (req) => {
    const { v, rfq, store } = await portalContext(req);
    const bids = await store.list('bid', { refId: rfq.id, status: 'submitted', subs: null });
    for (const b of bids) {
      if (String(b.vendorName).toLowerCase() === String(v.vendorName).toLowerCase()) {
        await store.update('bid', b.id, { status: 'withdrawn' });
      }
    }
    return { ok: true };
  }));

  // ---- Session ----------------------------------------------------------
  // Everything below needs the signed-in Catalyst user (req.authUser) that
  // index.js resolved. /auth/me additionally answers before the workspace
  // exists or before this account has a Users row, because that is exactly
  // what the client needs to know to show setup / "not invited".

  r.get('/auth/me', wrap(async (req) => {
    if (!req.workspace) {
      return { setupRequired: true, email: req.authUser.email, name: `${req.authUser.firstName} ${req.authUser.lastName}`.trim() };
    }
    let row = req.currentUser;
    let notice = null;
    if (!row) {
      row = await provisionInvitedUser(req.catalystApp, req.orgId, req.authUser);
      if (row) notice = 'Your account has been created with view-only access. An administrator can give you a role and approval limit in Settings.';
    }
    if (!row) {
      throw Object.assign(new HttpError(403, 'Your account does not have access to this workspace. Ask an administrator to add you.'), { code: 'NOT_A_MEMBER' });
    }
    if (String(row.Status || 'Active') !== 'Active' && String(row.Status) !== 'Invited') {
      throw Object.assign(new HttpError(403, 'Your account has been deactivated.'), { code: 'USER_INACTIVE' });
    }
    const me = await v1UserFromRow(req, row);
    let settings = {};
    try { settings = safeParse(req.workspace.Settings, {}); } catch { settings = {}; }
    return {
      ...me,
      orgName: req.workspace.Name || '',
      orgSettings: { currency: settings.currency || 'LKR', timezone: settings.timezone || null, multiProperty: !!settings.multiProperty },
      version: buildVersion,
      notice
    };
  }));

  r.post('/auth/logout', (req, res) => res.json({ success: true }));

  // From here on a member row is required.
  r.use(async (req, res, next) => {
    try {
      if (!req.workspace) return res.status(403).json({ error: 'This workspace has not been set up yet.', message: 'This workspace has not been set up yet.', code: 'SETUP_REQUIRED' });
      if (!req.currentUser) return res.status(403).json({ error: 'Your account does not have access to this workspace.', message: 'Your account does not have access to this workspace.', code: 'NOT_A_MEMBER' });
      req.v1 = {
        store: new DocStore(req.catalystApp, req.orgId),
        user: await v1UserFromRow(req, req.currentUser)
      };
      next();
    } catch (err) {
      console.error('[v1 context]', err);
      res.status(500).json({ error: 'Failed to resolve your session.', message: 'Failed to resolve your session.' });
    }
  });

  const S = req => req.v1.store;
  const U = req => req.v1.user;

  // ---- Users & roles ----------------------------------------------------
  r.get('/users', wrap(async (req) => {
    const rows = await req.catalystApp.zcql().executeZCQLQuery(
      `SELECT * FROM Users WHERE OrgID = '${esc(req.orgId)}' ORDER BY ROWID ASC LIMIT 300`
    );
    const out = [];
    for (const row of rows) {
      const u = await v1UserFromRow(req, row.Users);
      delete u.permissions;
      out.push(u);
    }
    return out;
  }));

  r.post('/users', wrap(async (req) => {
    assertCan(U(req), 'users:manage');
    const dto = req.body || {};
    const email = String(dto.email || '').trim().toLowerCase();
    if (!isEmail(email)) throw badRequest('Valid email is required');
    const profile = dto.role ? await profileByName(req, dto.role) : null;
    if (dto.role && !profile) throw badRequest(`Unknown role "${dto.role}"`);
    const profiles = await listProfiles(req);
    const fallbackProfile = profiles.find(p => !p.permissions.includes('users:manage')) || profiles[0];
    const chosen = profile || fallbackProfile;
    if (!chosen) throw badRequest('No permission profiles exist yet. Run setup first.');
    // Hierarchy role: the entry-level position; administrators adjust it later.
    const roleRows = await req.catalystApp.zcql().executeZCQLQuery(
      `SELECT * FROM Roles WHERE OrgID = '${esc(req.orgId)}' ORDER BY ROWID ASC LIMIT 100`
    );
    const roles = roleRows.map(x => x.Roles);
    const wanted = ['Head of the department', 'Requester', 'Staff', 'User'];
    let role = null;
    for (const w of wanted) { role = roles.find(x => String(x.RoleName).toLowerCase() === w.toLowerCase()); if (role) break; }
    if (!role) role = roles.find(x => !/administrator|board|chief|ceo|director|committee/i.test(String(x.RoleName))) || roles[0];
    if (!role) throw badRequest('No roles exist yet. Run setup first.');

    const result = await inviteWorkspaceUser(req, {
      Email: email,
      FullName: String(dto.name || '').trim() || email.split('@')[0],
      RoleID: String(role.ROWID),
      ProfileID: String(chosen.id),
      ApprovalLimit: 0
    });
    const u = await v1UserFromRow(req, result.user);
    delete u.permissions;
    return { ...u, invitationSent: result.invitationSent, linkedExisting: result.linkedExisting };
  }));

  r.patch('/users/:id', wrap(async (req) => {
    assertCan(U(req), 'users:manage');
    const dto = req.body || {};
    const patch = {};
    if (dto.name !== undefined) patch.FullName = String(dto.name || '').trim() || undefined;
    if (dto.status !== undefined) {
      if (!['active', 'invited', 'disabled'].includes(dto.status)) throw badRequest('Invalid status');
      if (String(req.params.id) === U(req).userId && dto.status === 'disabled') throw badRequest('You cannot disable your own account');
      patch.Status = dto.status === 'active' ? 'Active' : dto.status === 'invited' ? 'Invited' : 'Inactive';
    }
    if (dto.role !== undefined) {
      if (dto.role) {
        const profile = await profileByName(req, dto.role);
        if (!profile) throw badRequest(`Unknown role "${dto.role}"`);
        patch.ProfileID = profile.id;
      }
    }
    if (dto.approvalLimit !== undefined) patch.ApprovalLimit = Number(dto.approvalLimit) || 0;
    const updated = await updateWorkspaceUser(req, req.params.id, patch);
    profileCache.clear();
    const u = await v1UserFromRow(req, updated);
    delete u.permissions;
    return u;
  }));

  r.get('/roles', wrap(async (req) => listProfiles(req)));

  // ---- Masters: items / vendors / properties ----------------------------
  const ITEM_UNITS = ['PCS', 'KG', 'L', 'BOX', 'SET', 'M', 'PCS/KG', 'Other'];

  function itemFromRow(req, it) {
    const cf = safeParse(it.CustomFieldsJson, {});
    return {
      id: String(it.ROWID), tenantId: String(req.orgId),
      name: it.Name || '', sku: it.SKU || null, category: it.Category || 'Other',
      unit: it.Unit || 'PCS', costPrice: Number(it.UnitPrice || 0),
      description: it.Description || null, status: 'active',
      expenseType: it.ExpenseType || null, itemType: it.ItemType || null,
      customFields: cf, createdAt: it.CREATEDTIME || null, updatedAt: it.MODIFIEDTIME || null
    };
  }

  r.get('/items', wrap(async (req) => {
    const rows = await S(req)._all(`SELECT * FROM Items WHERE OrgID = '${esc(req.orgId)}' ORDER BY ROWID DESC`, 1000);
    return rows.map(x => itemFromRow(req, x.Items));
  }));

  r.post('/items', wrap(async (req) => {
    assertCan(U(req), 'items:create');
    const dto = req.body || {};
    const name = String(dto.name || '').trim();
    if (!name) throw badRequest('Name is required');
    if (name.length > 120) throw badRequest('Name max 120 chars');
    const zcql = req.catalystApp.zcql();
    const dupName = await zcql.executeZCQLQuery(`SELECT ROWID FROM Items WHERE OrgID = '${esc(req.orgId)}' AND Name = '${esc(name)}' LIMIT 1`);
    const sku = trimOrNull(dto.sku);
    if (dupName.length && !sku) throw conflict('Item name already exists (provide SKU to allow duplicate)');
    if (sku) {
      const dupSku = await zcql.executeZCQLQuery(`SELECT ROWID FROM Items WHERE OrgID = '${esc(req.orgId)}' AND SKU = '${esc(sku)}' LIMIT 1`);
      if (dupSku.length) throw conflict('SKU already exists');
    }
    const costPrice = dto.costPrice == null ? 0 : Number(dto.costPrice);
    if (!(costPrice >= 0)) throw badRequest('Cost price must be >= 0');
    const row = await safeTable(req.catalystApp, 'Items').insertRow({
      OrgID: req.orgId, Name: name, SKU: sku || '', Category: String(dto.category || 'Other').trim(),
      Unit: ITEM_UNITS.includes(dto.unit) ? dto.unit : 'PCS', UnitPrice: costPrice,
      Description: trimOrNull(dto.description) || '', ItemType: 'Goods', ExpenseType: 'OpEx'
    });
    await audit(req, 'create', 'Item', row.ROWID, { name });
    return itemFromRow(req, row);
  }));

  function vendorFromRow(req, v) {
    const cf = safeParse(v.CustomFieldsJson, {});
    return {
      id: String(v.ROWID), tenantId: String(req.orgId),
      name: v.Name || '', contactPerson: cf.contactPerson || null,
      email: v.ContactEmail || null, phone: v.Phone || null,
      category: cf.category || 'General', paymentTerms: cf.paymentTerms || cf['Payment Terms'] || 'Net 15',
      status: String(v.Status || 'Active').toLowerCase() === 'active' ? 'active' : 'inactive',
      address: v.Address || null, notes: cf.notes || null, rating: v.Rating != null ? Number(v.Rating) : null,
      createdAt: v.CREATEDTIME || null, updatedAt: v.MODIFIEDTIME || null
    };
  }

  r.get('/vendors', wrap(async (req) => {
    const rows = await S(req)._all(`SELECT * FROM Suppliers WHERE OrgID = '${esc(req.orgId)}' ORDER BY ROWID DESC`, 1000);
    return rows.map(x => vendorFromRow(req, x.Suppliers)).filter(v => v.status === 'active');
  }));

  r.post('/vendors', wrap(async (req) => {
    assertCan(U(req), 'vendors:create', 'vendors:manage');
    const dto = req.body || {};
    const name = String(dto.name || '').trim();
    if (!name) throw badRequest('Name is required');
    if (name.length > 120) throw badRequest('Name max 120 chars');
    const dup = await req.catalystApp.zcql().executeZCQLQuery(`SELECT ROWID FROM Suppliers WHERE OrgID = '${esc(req.orgId)}' AND Name = '${esc(name)}' LIMIT 1`);
    if (dup.length) throw conflict('Vendor name already exists');
    const email = trimOrNull(dto.email);
    if (email && !isEmail(email)) throw badRequest('Invalid email format');
    const row = await safeTable(req.catalystApp, 'Suppliers').insertRow({
      OrgID: req.orgId, Name: name, ContactEmail: email || '', Phone: trimOrNull(dto.phone) || '',
      Address: trimOrNull(dto.address) || '', Status: 'Active', Scope: 'group', Rating: 5,
      CustomFieldsJson: JSON.stringify({
        contactPerson: trimOrNull(dto.contactPerson), category: trimOrNull(dto.category) || 'General',
        paymentTerms: trimOrNull(dto.paymentTerms) || 'Net 15', notes: trimOrNull(dto.notes)
      })
    });
    await audit(req, 'create', 'Vendor', row.ROWID, { name });
    return vendorFromRow(req, row);
  }));

  r.get('/properties', wrap(async (req) => {
    const rows = await S(req)._all(`SELECT * FROM Properties WHERE OrgID = '${esc(req.orgId)}' ORDER BY ROWID ASC`, 500);
    return rows.map(x => ({ id: String(x.Properties.ROWID), name: x.Properties.Name, location: x.Properties.Location || '', cluster: x.Properties.Cluster || '', status: x.Properties.Status || 'Active' }));
  }));

  r.get('/orders', wrap(async (req) => S(req).list('po', { limit: 100 })));
  r.get('/approvals', wrap(async (req) => S(req).list('pr', { status: 'awaiting', order: 'ASC' })));

  // ---- Settings ---------------------------------------------------------
  r.get('/settings', wrap(async (req) => S(req).allSettings()));
  r.patch('/settings', wrap(async (req) => {
    assertCan(U(req), 'settings:manage');
    const dto = req.body || {};
    const entries = { ...(dto.settings || {}) };
    if (dto.key) entries[dto.key] = dto.value;
    if (!Object.keys(entries).length) throw badRequest('Nothing to save');
    for (const [key, value] of Object.entries(entries)) {
      if (!String(key).trim()) continue;
      await S(req).putSetting(String(key).trim(), value === undefined ? null : value);
    }
    return S(req).allSettings();
  }));

  // ---- Purchase requests ------------------------------------------------
  const PR_EDITABLE = ['draft', 'rejected'];

  function validatePrLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) throw badRequest('At least one line item is required');
    if (lines.length > 50) throw badRequest('Max 50 lines per request');
    for (const l of lines) {
      if (!String(l.itemName || '').trim()) throw badRequest('Each line needs an item name');
      if (l.quantity != null && Number(l.quantity) <= 0) throw badRequest('Quantity must be > 0');
      if (l.estimatedRate != null && Number(l.estimatedRate) < 0) throw badRequest('Rate must be >= 0');
      if (l.discount != null && (Number(l.discount) < 0 || Number(l.discount) > 100)) throw badRequest('Discount must be 0–100');
    }
  }
  const prLine = l => ({
    itemId: l.itemId || null, itemName: String(l.itemName).trim(), category: trimOrNull(l.category) || 'Other',
    description: trimOrNull(l.description), preferredVendor: trimOrNull(l.preferredVendor),
    quantity: l.quantity != null ? Number(l.quantity) : 1, estimatedRate: l.estimatedRate != null ? Number(l.estimatedRate) : 0,
    discount: l.discount != null ? Number(l.discount) : 0
  });
  const onePr = (req, id) => S(req).mustGet('pr', id, 'Purchase request');
  function mustOwnPr(pr, user, action) {
    if (pr.requestorId && String(pr.requestorId) !== String(user.userId)) throw badRequest(`Only the requestor can ${action} this request`);
  }

  r.get('/prs/mine', wrap(async (req) => S(req).list('pr', { ownerId: U(req).userId })));
  r.get('/prs/pending', wrap(async (req) => S(req).list('pr', { status: 'awaiting', order: 'ASC' })));
  r.get('/prs', wrap(async (req) => S(req).list('pr', { limit: 100 })));
  r.get('/prs/:id', wrap(async (req) => onePr(req, req.params.id)));

  r.post('/prs', wrap(async (req) => {
    assertCan(U(req), 'pr:create');
    const dto = req.body || {};
    validatePrLines(dto.lines);
    const pr = await S(req).insert('pr', {
      prNumber: await S(req).nextNumber('pr', 'PR', 'numbering.prs'),
      requestorId: U(req).userId, requesterName: U(req).name || U(req).email,
      expectedDate: isoOrNull(dto.expectedDate), deliveryAddress: trimOrNull(dto.deliveryAddress),
      reason: trimOrNull(dto.reason), notes: trimOrNull(dto.notes), reference: trimOrNull(dto.reference),
      status: 'draft', approverId: null, approverName: null, rejectReason: null
    }, { lines: dto.lines.map(prLine) });
    await audit(req, 'create', 'PR', pr.id, { number: pr.prNumber });
    return pr;
  }));

  r.patch('/prs/:id', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    mustOwnPr(pr, U(req), 'edit');
    if (!PR_EDITABLE.includes(pr.status)) throw badRequest(`Cannot edit a ${pr.status} request`);
    const dto = req.body || {};
    if (dto.lines) {
      validatePrLines(dto.lines);
      await S(req).replaceSub('pr', pr.id, 'lines', dto.lines.map(prLine));
    }
    const patch = {};
    if (dto.expectedDate !== undefined) patch.expectedDate = isoOrNull(dto.expectedDate);
    if (dto.deliveryAddress !== undefined) patch.deliveryAddress = trimOrNull(dto.deliveryAddress);
    if (dto.reason !== undefined) patch.reason = trimOrNull(dto.reason);
    if (dto.notes !== undefined) patch.notes = trimOrNull(dto.notes);
    if (dto.reference !== undefined) patch.reference = trimOrNull(dto.reference);
    if (pr.status === 'rejected') patch.rejectReason = null;
    await S(req).update('pr', pr.id, patch);
    return onePr(req, pr.id);
  }));

  r.post('/prs/:id/submit', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    mustOwnPr(pr, U(req), 'submit');
    if (!['draft', 'rejected'].includes(pr.status)) throw badRequest(`Cannot submit a ${pr.status} request`);
    if (!pr.lines.length) throw badRequest('Cannot submit without line items');
    const approverId = (req.body && req.body.approverId) || null;
    await S(req).update('pr', pr.id, { status: 'awaiting', approverId, approverName: approverId ? await userNameById(req, approverId) : null, rejectReason: null });
    await audit(req, 'submit', 'PR', pr.id, { number: pr.prNumber });
    return onePr(req, pr.id);
  }));

  r.post('/prs/:id/approve', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    assertCan(U(req), 'pr:approve');
    assertNotSelfApprover(U(req), pr.requestorId, 'purchase request');
    if (!['awaiting', 'rejected'].includes(pr.status)) throw badRequest(`Cannot approve a ${pr.status} request`);
    await S(req).update('pr', pr.id, { status: 'approved', approverId: U(req).userId, approverName: U(req).name || U(req).email, rejectReason: null, approvedAt: new Date().toISOString() });
    await audit(req, 'approve', 'PR', pr.id, { number: pr.prNumber });
    return onePr(req, pr.id);
  }));

  r.post('/prs/:id/reject', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    assertCan(U(req), 'pr:approve');
    assertNotSelfApprover(U(req), pr.requestorId, 'purchase request');
    if (pr.status !== 'awaiting') throw badRequest(`Cannot reject a ${pr.status} request`);
    const reason = trimOrNull(req.body && req.body.reason);
    if (!reason) throw badRequest('Rejection reason is required');
    await S(req).update('pr', pr.id, { status: 'rejected', rejectReason: reason, approverId: U(req).userId, approverName: U(req).name || U(req).email });
    await audit(req, 'reject', 'PR', pr.id, { number: pr.prNumber, reason });
    return onePr(req, pr.id);
  }));

  r.post('/prs/:id/recall', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    mustOwnPr(pr, U(req), 'recall');
    if (pr.status !== 'awaiting') throw badRequest(`Cannot recall a ${pr.status} request`);
    await S(req).update('pr', pr.id, { status: 'draft', approverId: null, approverName: null });
    return onePr(req, pr.id);
  }));

  r.post('/prs/:id/cancel', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    mustOwnPr(pr, U(req), 'cancel');
    if (!['draft', 'awaiting', 'rejected'].includes(pr.status)) throw badRequest(`Cannot cancel a ${pr.status} request`);
    await S(req).update('pr', pr.id, { status: 'cancelled' });
    return onePr(req, pr.id);
  }));

  r.post('/prs/:id/process', wrap(async (req) => {
    const pr = await onePr(req, req.params.id);
    if (pr.status !== 'approved') throw badRequest('Only approved requests can be marked processed');
    await S(req).update('pr', pr.id, { status: 'processed' });
    return onePr(req, pr.id);
  }));

  // ---- Purchase orders --------------------------------------------------
  const docLine = l => ({
    poLineId: l.poLineId || null, prLineId: l.prLineId || null, itemId: l.itemId || null,
    itemName: String(l.itemName || '').trim(), category: trimOrNull(l.category) || 'Other',
    description: trimOrNull(l.description), tax: trimOrNull(l.tax), account: trimOrNull(l.account), customer: trimOrNull(l.customer),
    quantity: l.quantity != null ? Number(l.quantity) : 1, rate: l.rate != null ? Number(l.rate) : 0,
    receivedQty: 0, billedQty: 0
  });

  async function onePo(req, id) {
    const po = await S(req).mustGet('po', id, 'Purchase order');
    po.receives = await S(req).list('receive', { refId: po.id, limit: 100 });
    po.bills = await S(req).list('bill', { refId: po.id, limit: 100 });
    return po;
  }

  async function recomputePo(req, id) {
    const po = await S(req).get('po', id);
    if (!po) return null;
    if (['draft', 'pending', 'cancelled', 'closed'].includes(po.status)) return po;
    const lines = po.lines;
    const allBilled = lines.length > 0 && lines.every(l => (l.billedQty || 0) >= (l.quantity || 0) - 1e-9);
    const anyBilled = lines.some(l => (l.billedQty || 0) > 1e-9);
    const allReceived = lines.length > 0 && lines.every(l => (l.receivedQty || 0) >= (l.quantity || 0) - 1e-9);
    const anyReceived = lines.some(l => (l.receivedQty || 0) > 1e-9);
    let status = po.status;
    if (allBilled) status = 'billed';
    else if (anyBilled) status = 'partially_billed';
    else if (allReceived) status = 'received';
    else if (anyReceived) status = 'partially_received';
    if (status !== po.status) await S(req).update('po', id, { status });
    return po;
  }

  r.get('/pos', wrap(async (req) => S(req).list('po', { limit: 100 })));
  r.get('/pos/:id', wrap(async (req) => onePo(req, req.params.id)));

  r.post('/pos', wrap(async (req) => {
    assertCan(U(req), 'po:create');
    const dto = req.body || {};
    if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('At least one line is required');
    for (const l of dto.lines) if (!String(l.itemName || '').trim()) throw badRequest('Each line needs an item name');
    const po = await S(req).insert('po', {
      poNumber: await S(req).nextNumber('po', 'PO', 'numbering.pos'),
      vendorId: dto.vendorId || null, vendorName: trimOrNull(dto.vendorName) || '',
      sourcePrId: dto.sourcePrId || null,
      expectedDate: isoOrNull(dto.expectedDate), notes: trimOrNull(dto.notes), reference: trimOrNull(dto.reference),
      deliveryDate: isoOrNull(dto.deliveryDate), paymentTerms: trimOrNull(dto.paymentTerms),
      shipmentPreference: trimOrNull(dto.shipmentPreference), taxMode: trimOrNull(dto.taxMode), taxLevel: trimOrNull(dto.taxLevel),
      discountPercent: dto.discountPercent != null ? Number(dto.discountPercent) : null,
      adjustment: dto.adjustment != null ? Number(dto.adjustment) : null, adjustmentLabel: trimOrNull(dto.adjustmentLabel),
      terms: trimOrNull(dto.terms), documents: dto.documents || null,
      deliveryAddress: trimOrNull(dto.deliveryAddress), addressType: trimOrNull(dto.addressType),
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
    }, { lines: dto.lines.map(docLine) });
    await audit(req, 'create', 'PO', po.id, { number: po.poNumber });
    return onePo(req, po.id);
  }));

  r.post('/pos/from-pr', wrap(async (req) => {
    assertCan(U(req), 'po:create');
    const dto = req.body || {};
    const pr = await S(req).mustGet('pr', dto.prId, 'Purchase request');
    if (pr.status !== 'approved') throw badRequest('Only approved requests can be converted');
    const lines = pr.lines.filter(l => !Array.isArray(dto.lineIds) || !dto.lineIds.length || dto.lineIds.includes(l.id));
    if (!lines.length) throw badRequest('Select at least one line to convert');
    const po = await S(req).insert('po', {
      poNumber: await S(req).nextNumber('po', 'PO', 'numbering.pos'),
      vendorId: dto.vendorId || null, vendorName: trimOrNull(dto.vendorName) || '',
      sourcePrId: pr.id, sourcePrNumber: pr.prNumber, expectedDate: pr.expectedDate || null, notes: pr.reason || null,
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
    }, {
      lines: lines.map(l => ({
        prLineId: l.id, itemId: l.itemId || null, itemName: l.itemName, category: l.category || 'Other',
        description: l.description || null, quantity: Number(l.quantity) || 1, rate: Number(l.estimatedRate) || 0,
        receivedQty: 0, billedQty: 0
      }))
    });
    await S(req).update('pr', pr.id, { status: 'processed' });
    await audit(req, 'create', 'PO', po.id, { number: po.poNumber, fromPr: pr.prNumber });
    return onePo(req, po.id);
  }));

  r.post('/pos/:id/submit', wrap(async (req) => {
    const po = await onePo(req, req.params.id);
    if (po.status !== 'draft') throw badRequest(`Cannot submit a ${po.status} order`);
    await S(req).update('po', po.id, { status: 'pending' });
    return onePo(req, po.id);
  }));

  r.post('/pos/:id/approve', wrap(async (req) => {
    const po = await onePo(req, req.params.id);
    assertCan(U(req), 'po:approve');
    assertNotSelfApprover(U(req), po.createdBy, 'purchase order');
    if (po.status !== 'pending') throw badRequest(`Cannot approve a ${po.status} order`);
    await S(req).update('po', po.id, { status: 'approved', approvedBy: U(req).userId, approvedByName: U(req).name || U(req).email });
    await audit(req, 'approve', 'PO', po.id, { number: po.poNumber });
    return onePo(req, po.id);
  }));

  r.post('/pos/:id/issue', wrap(async (req) => {
    const po = await onePo(req, req.params.id);
    if (!['approved', 'draft'].includes(po.status)) throw badRequest(`Cannot issue a ${po.status} order`);
    if (!po.vendorName) throw badRequest('Set a vendor before issuing');
    await S(req).update('po', po.id, { status: 'issued', issuedAt: new Date().toISOString() });
    await audit(req, 'issue', 'PO', po.id, { number: po.poNumber });
    return onePo(req, po.id);
  }));

  r.post('/pos/:id/close', wrap(async (req) => {
    const po = await onePo(req, req.params.id);
    if (po.status === 'cancelled') throw badRequest('Order is cancelled');
    await S(req).update('po', po.id, { status: 'closed' });
    return onePo(req, po.id);
  }));

  r.post('/pos/:id/cancel', wrap(async (req) => {
    const po = await onePo(req, req.params.id);
    if (['billed', 'closed', 'cancelled'].includes(po.status)) throw badRequest(`Cannot cancel a ${po.status} order`);
    await S(req).update('po', po.id, { status: 'cancelled' });
    return onePo(req, po.id);
  }));

  r.delete('/pos/:id', wrap(async (req) => {
    assertCan(U(req), 'po:delete');
    const po = await onePo(req, req.params.id);
    if (!['draft', 'cancelled'].includes(po.status)) throw badRequest(`Cannot delete a ${po.status} order`);
    if (po.receives.length) throw badRequest('Order has receives and cannot be deleted');
    if (po.bills.length) throw badRequest('Order has bills and cannot be deleted');
    await S(req).remove('po', po.id);
    return { deleted: true };
  }));

  // ---- Purchase receives ------------------------------------------------
  async function oneReceive(req, id) {
    const grn = await S(req).mustGet('receive', id, 'Receive');
    grn.po = await S(req).get('po', grn.poId);
    return grn;
  }

  r.get('/receives', wrap(async (req) => {
    const list = await S(req).list('receive', { limit: 100 });
    const poIds = [...new Set(list.map(g => g.poId).filter(Boolean))];
    const pos = new Map();
    for (const id of poIds) pos.set(id, await S(req).get('po', id, null));
    for (const g of list) g.po = pos.get(g.poId) || null;
    return list;
  }));
  r.get('/receives/:id', wrap(async (req) => oneReceive(req, req.params.id)));

  r.post('/receives/from-po', wrap(async (req) => {
    assertCan(U(req), 'receives:create');
    const dto = req.body || {};
    const po = await S(req).mustGet('po', dto.poId, 'Purchase order');
    if (!['issued', 'approved', 'partially_received', 'received', 'partially_billed'].includes(po.status)) {
      throw badRequest(`Cannot receive against a ${po.status} order`);
    }
    if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('Add at least one line');
    const lines = [];
    for (const l of dto.lines) {
      const pl = po.lines.find(p => p.id === String(l.poLineId));
      if (!pl) throw badRequest('Unknown PO line');
      const remaining = (Number(pl.quantity) || 0) - (Number(pl.receivedQty) || 0);
      const qty = Number(l.quantity);
      if (!(qty > 0) || qty > remaining + 1e-9) throw badRequest(`"${pl.itemName}": only ${remaining} still open`);
      lines.push({ poLineId: pl.id, itemName: pl.itemName, quantity: qty });
    }
    const grn = await S(req).insert('receive', {
      grnNumber: await S(req).nextNumber('receive', 'GRN'),
      poId: po.id, poNumber: po.poNumber, vendorName: po.vendorName || '',
      notes: trimOrNull(dto.notes), tracking: trimOrNull(dto.tracking), trackingUrl: trimOrNull(dto.trackingUrl),
      receivedAt: isoOrNull(dto.receivedAt), documents: dto.documents || null,
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft', billed: false
    }, { lines });
    await audit(req, 'create', 'GRN', grn.id, { number: grn.grnNumber });
    return oneReceive(req, grn.id);
  }));

  r.post('/receives/:id/complete', wrap(async (req) => {
    const grn = await oneReceive(req, req.params.id);
    if (grn.status !== 'draft') throw badRequest(`Cannot complete a ${grn.status} receive`);
    for (const l of grn.lines) {
      const pl = await S(req).lineById(l.poLineId);
      if (!pl) continue;
      await S(req).updateLine(pl.id, { receivedQty: (Number(pl.receivedQty) || 0) + Number(l.quantity) });
    }
    await S(req).update('receive', grn.id, { status: 'completed', receivedAt: new Date().toISOString() });
    await recomputePo(req, grn.poId);
    await audit(req, 'complete', 'GRN', grn.id, { number: grn.grnNumber });
    return oneReceive(req, grn.id);
  }));

  r.post('/receives/:id/cancel', wrap(async (req) => {
    const grn = await oneReceive(req, req.params.id);
    if (grn.status !== 'draft') throw badRequest('Only draft receives can be cancelled');
    await S(req).update('receive', grn.id, { status: 'cancelled' });
    return oneReceive(req, grn.id);
  }));

  // ---- Bills ------------------------------------------------------------
  const billTotal = b => (b.lines || []).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  // A bill is overdue the day AFTER its due date, not at midnight UTC of the
  // due date itself — otherwise a bill due today is born overdue.
  const pastDue = (dueDate, now = new Date()) => {
    if (!dueDate) return false;
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) return false;
    const dueDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return dueDay < today;
  };

  async function oneBill(req, id) {
    const b = await S(req).mustGet('bill', id, 'Bill');
    b.payments = await S(req).list('payment', { refId: b.id, limit: 100, subs: null });
    b.po = b.poId ? await S(req).get('po', b.poId) : null;
    const total = billTotal(b);
    b.total = round2(total);
    b.balance = round2(total - (Number(b.amountPaid) || 0));
    if (b.status === 'open' && pastDue(b.dueDate) && b.balance > 0.005) b.status = 'overdue';
    return b;
  }

  r.get('/bills', wrap(async (req) => {
    const bills = await S(req).list('bill', { limit: 100 });
    const now = new Date();
    return bills.map(b => {
      const total = billTotal(b);
      const balance = total - (Number(b.amountPaid) || 0);
      const status = b.status === 'open' && pastDue(b.dueDate, now) && balance > 0.005 ? 'overdue' : b.status;
      return { ...b, total: round2(total), balance: round2(balance), status };
    });
  }));
  r.get('/bills/:id', wrap(async (req) => oneBill(req, req.params.id)));

  r.post('/bills', wrap(async (req) => {
    assertCan(U(req), 'bills:create');
    const dto = req.body || {};
    let lines = [];
    let vendorName = trimOrNull(dto.vendorName) || '';
    let vendorId = dto.vendorId || null;
    let poId = dto.poId || null;
    let receiveId = dto.receiveId || null;
    let poNumber = null;

    if (dto.receiveId) {
      const grn = await S(req).mustGet('receive', dto.receiveId, 'Receive');
      if (grn.status !== 'completed') throw badRequest('Only completed receives can be billed');
      if (grn.billed) throw badRequest('This receive has already been billed');
      const po = await S(req).get('po', grn.poId);
      const poLines = (po && po.lines) || [];
      lines = grn.lines.map(rl => {
        const pl = poLines.find(p => p.id === rl.poLineId);
        return { poLineId: rl.poLineId, itemName: rl.itemName, quantity: Number(rl.quantity), rate: pl ? Number(pl.rate) || 0 : 0 };
      });
      poId = grn.poId;
      poNumber = po ? po.poNumber : null;
      vendorName = vendorName || (po && po.vendorName) || '';
      vendorId = vendorId || (po && po.vendorId) || null;
    } else if (dto.poId) {
      const po = await S(req).mustGet('po', dto.poId, 'Purchase order');
      lines = po.lines
        .map(pl => ({ poLineId: pl.id, itemName: pl.itemName, quantity: Math.max(0, (Number(pl.quantity) || 0) - (Number(pl.billedQty) || 0)), rate: Number(pl.rate) || 0 }))
        .filter(l => l.quantity > 0);
      if (!lines.length) throw badRequest('All PO lines are already billed');
      poNumber = po.poNumber;
      vendorName = vendorName || po.vendorName || '';
      vendorId = vendorId || po.vendorId || null;
    } else {
      if (!vendorName) throw badRequest('Vendor is required');
      if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('At least one line is required');
      lines = dto.lines.map(l => {
        if (!String(l.itemName || '').trim()) throw badRequest('Each line needs an item name');
        return { itemName: String(l.itemName).trim(), quantity: l.quantity != null ? Number(l.quantity) : 1, rate: l.rate != null ? Number(l.rate) : 0, account: trimOrNull(l.account), tax: trimOrNull(l.tax), customer: trimOrNull(l.customer) };
      });
    }

    const bill = await S(req).insert('bill', {
      billNumber: await S(req).nextNumber('bill', 'BILL', 'numbering.bills'),
      vendorBillNo: trimOrNull(dto.vendorBillNo), vendorId, vendorName, poId, poNumber, receiveId,
      issueDate: isoOrNull(dto.issueDate) || new Date().toISOString(), dueDate: isoOrNull(dto.dueDate),
      notes: trimOrNull(dto.notes), subject: trimOrNull(dto.subject), orderNumber: trimOrNull(dto.orderNumber),
      paymentTerms: trimOrNull(dto.paymentTerms), discountPercent: dto.discountPercent != null ? Number(dto.discountPercent) : null,
      adjustment: dto.adjustment != null ? Number(dto.adjustment) : null, adjustmentLabel: trimOrNull(dto.adjustmentLabel),
      documents: dto.documents || null, amountPaid: 0,
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
    }, { lines: lines.map(l => ({ poLineId: l.poLineId || null, itemName: l.itemName, quantity: l.quantity, rate: l.rate, account: l.account || null, tax: l.tax || null, customer: l.customer || null })) });
    if (receiveId) await S(req).update('receive', receiveId, { billed: true });
    await audit(req, 'create', 'Bill', bill.id, { number: bill.billNumber });
    return oneBill(req, bill.id);
  }));

  async function reverseAccrual(req, bill) {
    if (!bill.poId) return;
    for (const l of bill.lines || []) {
      if (!l.poLineId) continue;
      const pl = await S(req).lineById(l.poLineId);
      if (pl) await S(req).updateLine(pl.id, { billedQty: Math.max(0, (Number(pl.billedQty) || 0) - Number(l.quantity)) });
    }
    await recomputePo(req, bill.poId);
  }

  r.post('/bills/:id/submit', wrap(async (req) => {
    const b = await oneBill(req, req.params.id);
    if (b.status !== 'draft') throw badRequest(`Cannot submit a ${b.status} bill`);
    await S(req).update('bill', b.id, { status: 'pending' });
    return oneBill(req, b.id);
  }));

  r.post('/bills/:id/approve', wrap(async (req) => {
    const b = await oneBill(req, req.params.id);
    assertCan(U(req), 'bills:approve');
    assertNotSelfApprover(U(req), b.createdBy, 'bill');
    if (b.status !== 'pending') throw badRequest(`Cannot approve a ${b.status} bill`);
    await S(req).update('bill', b.id, { status: 'open', approvedBy: U(req).userId, approvedByName: U(req).name || U(req).email });
    if (b.poId) {
      for (const l of b.lines) {
        if (!l.poLineId) continue;
        const pl = await S(req).lineById(l.poLineId);
        if (pl) await S(req).updateLine(pl.id, { billedQty: (Number(pl.billedQty) || 0) + Number(l.quantity) });
      }
      await recomputePo(req, b.poId);
    }
    await audit(req, 'approve', 'Bill', b.id, { number: b.billNumber });
    return oneBill(req, b.id);
  }));

  r.post('/bills/:id/void', wrap(async (req) => {
    const b = await oneBill(req, req.params.id);
    if (!['draft', 'open'].includes(b.status)) throw badRequest(`Cannot void a ${b.status} bill`);
    if ((Number(b.amountPaid) || 0) > 0) throw badRequest('Cannot void a bill with payments recorded');
    if (b.status === 'open') await reverseAccrual(req, b);
    if (b.receiveId) await S(req).update('receive', b.receiveId, { billed: false });
    await S(req).update('bill', b.id, { status: 'void' });
    return oneBill(req, b.id);
  }));

  r.patch('/bills/:id', wrap(async (req) => {
    const b = await oneBill(req, req.params.id);
    const dto = req.body || {};
    const header = {};
    if (dto.vendorBillNo !== undefined) header.vendorBillNo = trimOrNull(dto.vendorBillNo);
    if (dto.orderNumber !== undefined) header.orderNumber = trimOrNull(dto.orderNumber);
    if (dto.subject !== undefined) header.subject = trimOrNull(dto.subject);
    if (dto.notes !== undefined) header.notes = trimOrNull(dto.notes);
    if (dto.paymentTerms !== undefined) header.paymentTerms = trimOrNull(dto.paymentTerms);
    if (dto.issueDate !== undefined) header.issueDate = isoOrNull(dto.issueDate);
    if (dto.dueDate !== undefined) header.dueDate = isoOrNull(dto.dueDate);
    if (dto.documents !== undefined) header.documents = dto.documents || null;
    if (b.status === 'draft') {
      if (dto.vendorName !== undefined) {
        if (!String(dto.vendorName || '').trim()) throw badRequest('Vendor is required');
        header.vendorName = String(dto.vendorName).trim();
        header.vendorId = dto.vendorId || null;
      }
      if (dto.discountPercent !== undefined) header.discountPercent = dto.discountPercent;
      if (dto.adjustment !== undefined) header.adjustment = dto.adjustment;
      if (dto.adjustmentLabel !== undefined) header.adjustmentLabel = trimOrNull(dto.adjustmentLabel);
      await S(req).update('bill', b.id, header);
      if (dto.lines !== undefined) {
        if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('At least one line is required');
        const lines = dto.lines.map(l => {
          if (!String(l.itemName || '').trim()) throw badRequest('Each line needs an item name');
          return { poLineId: l.poLineId || null, itemName: String(l.itemName).trim(), quantity: l.quantity != null ? Number(l.quantity) : 1, rate: l.rate != null ? Number(l.rate) : 0, account: trimOrNull(l.account), tax: trimOrNull(l.tax), customer: trimOrNull(l.customer) };
        });
        await S(req).replaceSub('bill', b.id, 'lines', lines);
      }
    } else {
      await S(req).update('bill', b.id, header);
    }
    return oneBill(req, b.id);
  }));

  r.delete('/bills/:id', wrap(async (req) => {
    assertCan(U(req), 'bills:delete');
    const b = await oneBill(req, req.params.id);
    if (['open', 'overdue', 'partially_paid', 'paid'].includes(b.status)) await reverseAccrual(req, b);
    if (b.receiveId) await S(req).update('receive', b.receiveId, { billed: false });
    // Payments stay as history with the bill link cleared.
    for (const p of b.payments) await S(req).update('payment', p.id, { billId: null, billNumber: b.billNumber });
    await S(req).remove('bill', b.id);
    return { deleted: true, billNumber: b.billNumber };
  }));

  r.get('/bills/:id/match', wrap(async (req) => {
    const b = await oneBill(req, req.params.id);
    const TOL = 0.02;
    const lines = [];
    for (const l of b.lines) {
      if (!l.poLineId) { lines.push({ ...l, matched: null, reason: 'No PO line linked' }); continue; }
      const pl = await S(req).lineById(l.poLineId);
      if (!pl) { lines.push({ ...l, matched: false, reason: 'PO line missing' }); continue; }
      const qtyOk = Number(l.quantity) <= (Number(pl.quantity) || 0) + 1e-9;
      const receivedOk = Number(l.quantity) <= (Number(pl.receivedQty) || 0) + 1e-9;
      const base = Number(pl.rate) || 0;
      const priceOk = base === 0 ? Number(l.rate) === 0 : Math.abs(Number(l.rate) - base) / base <= TOL;
      const matched = b.receiveId ? qtyOk && priceOk && receivedOk : qtyOk && priceOk;
      lines.push({
        ...l, matched, poQty: pl.quantity, poRate: pl.rate, poReceived: pl.receivedQty,
        checks: { qtyOk, receivedOk, priceOk },
        reason: matched ? (receivedOk ? 'Matched' : 'Matched (not yet received)') : !qtyOk ? 'Qty exceeds PO' : 'Price differs > 2%'
      });
    }
    const linkable = lines.filter(l => l.matched !== null);
    const pct = linkable.length ? Math.round((linkable.filter(l => l.matched).length / linkable.length) * 100) : 100;
    return { billId: b.id, billNumber: b.billNumber, matchPct: pct, lines };
  }));

  async function payBill(req, billId, { amount, method, reference, paidAt }) {
    const b = await oneBill(req, billId);
    if (!['open', 'overdue', 'partially_paid'].includes(b.status)) throw badRequest(`Cannot pay a ${b.status} bill`);
    const amt = Number(amount);
    if (!(amt > 0)) throw badRequest('Amount must be > 0');
    const total = billTotal(b);
    const balance = Math.max(0, total - (Number(b.amountPaid) || 0));
    const applied = Math.min(amt, balance);
    const excess = round2(amt - applied);
    await S(req).insert('payment', {
      billId: b.id, billNumber: b.billNumber, vendorName: b.vendorName, amount: amt, method: trimOrNull(method),
      paidAt: isoOrNull(paidAt) || new Date().toISOString(),
      reference: excess > 0 ? [`Applied LKR ${applied.toFixed(2)}`, trimOrNull(reference)].filter(Boolean).join(' · ') : trimOrNull(reference),
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email
    });
    const newPaid = round2((Number(b.amountPaid) || 0) + applied);
    const status = total - newPaid <= 0.005 ? 'paid' : 'partially_paid';
    await S(req).update('bill', b.id, { amountPaid: newPaid, status });
    let credit = null;
    if (excess > 0) {
      credit = await S(req).insert('credit', {
        vendorName: b.vendorName, amount: excess, remaining: excess, source: 'excess', billId: b.id,
        notes: `Excess on ${b.billNumber}`, status: 'open'
      });
    }
    await audit(req, 'pay', 'Bill', b.id, { number: b.billNumber, amount: amt });
    return { bill: await oneBill(req, b.id), applied, excess, credit };
  }

  r.post('/bills/:id/pay', wrap(async (req) => {
    assertCan(U(req), 'payments:create', 'payments:make');
    return payBill(req, req.params.id, req.body || {});
  }));

  // ---- Vendor credits ---------------------------------------------------
  r.get('/credits', wrap(async (req) => S(req).list('credit', { limit: 100, subs: null })));

  r.post('/credits', wrap(async (req) => {
    assertCan(U(req), 'credits:create', 'payments:create');
    const dto = req.body || {};
    if (!String(dto.vendorName || '').trim()) throw badRequest('Vendor is required');
    if (!(Number(dto.amount) > 0)) throw badRequest('Amount must be > 0');
    return S(req).insert('credit', {
      vendorName: String(dto.vendorName).trim(), amount: Number(dto.amount), remaining: Number(dto.amount),
      source: dto.source || 'return', notes: trimOrNull(dto.notes), status: 'open',
      createdBy: U(req).userId
    });
  }));

  r.post('/credits/:id/apply', wrap(async (req) => {
    assertCan(U(req), 'credits:edit', 'payments:create');
    const dto = req.body || {};
    const credit = await S(req).mustGet('credit', req.params.id, 'Credit', null);
    if (credit.status !== 'open' || Number(credit.remaining) <= 0) throw badRequest('Credit is fully consumed');
    const b = await oneBill(req, dto.billId);
    if (String(credit.vendorName).toLowerCase() !== String(b.vendorName || '').toLowerCase()) throw badRequest('Credit belongs to a different vendor');
    if (!['open', 'overdue', 'partially_paid'].includes(b.status)) throw badRequest(`Cannot apply to a ${b.status} bill`);
    const total = billTotal(b);
    const balance = Math.max(0, total - (Number(b.amountPaid) || 0));
    const use = Math.min(Number(dto.amount), Number(credit.remaining), balance);
    if (!(use > 0)) throw badRequest('Nothing to apply');
    await S(req).insert('payment', {
      billId: b.id, billNumber: b.billNumber, vendorName: b.vendorName, amount: use, method: 'Vendor Credit',
      reference: `Credit ${credit.id.slice(-8)}`, creditId: credit.id, paidAt: new Date().toISOString(),
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email
    });
    const newPaid = round2((Number(b.amountPaid) || 0) + use);
    const status = total - newPaid <= 0.005 ? 'paid' : 'partially_paid';
    await S(req).update('bill', b.id, { amountPaid: newPaid, status });
    const remaining = round2(Number(credit.remaining) - use);
    await S(req).update('credit', credit.id, { remaining, status: remaining <= 0.005 ? 'consumed' : 'open' });
    return { bill: await oneBill(req, b.id), applied: use };
  }));

  // ---- Payments ---------------------------------------------------------
  r.get('/payments', wrap(async (req) => {
    const list = await S(req).list('payment', { limit: 100, subs: null });
    const billIds = [...new Set(list.map(p => p.billId).filter(Boolean))];
    const bills = new Map();
    for (const id of billIds) bills.set(id, await S(req).get('bill', id));
    return list.map(p => ({ ...p, bill: bills.get(p.billId) || null }));
  }));

  r.post('/payments/multi', wrap(async (req) => {
    assertCan(U(req), 'payments:create', 'payments:make');
    const dto = req.body || {};
    if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('Add at least one bill allocation');
    const results = [];
    for (const l of dto.lines) {
      if (!(Number(l.amount) > 0)) throw badRequest('Each allocation must be > 0');
      const target = await oneBill(req, l.billId);
      if (dto.vendorName && String(target.vendorName || '').toLowerCase() !== String(dto.vendorName).toLowerCase()) {
        throw badRequest(`Bill ${target.billNumber} belongs to ${target.vendorName}`);
      }
      const res = await payBill(req, l.billId, { amount: l.amount, method: dto.method || 'Manual', reference: dto.reference, paidAt: dto.paidAt });
      results.push({ billId: l.billId, applied: res.applied, excess: res.excess });
    }
    return { results };
  }));

  r.patch('/payments/:id', wrap(async (req) => {
    assertCan(U(req), 'payments:edit', 'payments:create');
    const dto = req.body || {};
    const p = await S(req).mustGet('payment', req.params.id, 'Payment', null);
    const patch = {};
    if (dto.method !== undefined) patch.method = trimOrNull(dto.method);
    if (dto.reference !== undefined) patch.reference = trimOrNull(dto.reference);
    if (dto.paidAt !== undefined) patch.paidAt = isoOrNull(dto.paidAt) || new Date().toISOString();
    await S(req).update('payment', p.id, patch);
    const fresh = await S(req).get('payment', p.id, null);
    fresh.bill = fresh.billId ? await S(req).get('bill', fresh.billId) : null;
    return fresh;
  }));

  r.delete('/payments/:id', wrap(async (req) => {
    assertCan(U(req), 'payments:delete');
    const p = await S(req).mustGet('payment', req.params.id, 'Payment', null);
    if (p.billId) {
      const b = await S(req).get('bill', p.billId);
      if (b && ['open', 'partially_paid', 'paid', 'overdue'].includes(b.status)) {
        const total = billTotal(b);
        const newPaid = Math.max(0, round2((Number(b.amountPaid) || 0) - Number(p.amount)));
        const status = total - newPaid <= 0.005 ? 'paid' : newPaid > 0.005 ? 'partially_paid' : 'open';
        await S(req).update('bill', b.id, { amountPaid: newPaid, status });
      }
      if (String(p.method || '').toLowerCase().includes('vendor credit') && p.creditId) {
        const credit = await S(req).get('credit', p.creditId, null);
        if (credit) {
          const remaining = Math.min(Number(credit.amount), round2(Number(credit.remaining) + Number(p.amount)));
          await S(req).update('credit', credit.id, { remaining, status: remaining > 0.005 ? 'open' : 'consumed' });
        }
      }
    }
    await S(req).remove('payment', p.id);
    return { deleted: true };
  }));

  // ---- Budgets ----------------------------------------------------------
  const PERIODS = ['monthly', 'quarterly', 'yearly'];
  const periodSize = p => p === 'quarterly' ? 4 : p === 'yearly' ? 1 : 12;
  const budgetTotal = b => (b.lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  function validateBudgetLines(lines, period) {
    const size = periodSize(period);
    for (const l of lines) {
      if (!String(l.category || '').trim()) throw badRequest('Each line needs a category');
      if (l.monthIndex == null || l.monthIndex < 0 || l.monthIndex >= size) throw badRequest(`Month index must be 0..${size - 1} for ${period} budgets`);
      if ((Number(l.amount) || 0) < 0) throw badRequest('Amounts cannot be negative');
    }
    return lines.map(l => ({ category: String(l.category).trim(), monthIndex: Number(l.monthIndex) || 0, amount: Number(l.amount) || 0 }));
  }
  async function oneBudget(req, id) {
    const b = await S(req).mustGet('budget', id, 'Budget');
    return { ...b, total: round2(budgetTotal(b)) };
  }

  r.get('/budgets', wrap(async (req) => (await S(req).list('budget', { limit: 100 })).map(b => ({ ...b, total: round2(budgetTotal(b)) }))));
  r.get('/budgets/:id', wrap(async (req) => oneBudget(req, req.params.id)));

  r.post('/budgets', wrap(async (req) => {
    assertCan(U(req), 'budgets:create');
    const dto = req.body || {};
    if (!String(dto.name || '').trim()) throw badRequest('Budget name is required');
    if (!dto.fiscalStart) throw badRequest('Fiscal year start is required');
    const start = new Date(dto.fiscalStart);
    if (isNaN(start.getTime())) throw badRequest('Invalid fiscal year start');
    const period = String(dto.period || 'monthly').toLowerCase();
    if (!PERIODS.includes(period)) throw badRequest('Invalid budget period');
    const lines = validateBudgetLines(dto.lines || [], period);
    const b = await S(req).insert('budget', {
      name: String(dto.name).trim(), fiscalYear: trimOrNull(dto.fiscalYear) || String(start.getFullYear()),
      fiscalStart: new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1)).toISOString(), period,
      budgetType: trimOrNull(dto.budgetType) || 'Amount', tag: trimOrNull(dto.tag),
      createdBy: U(req).userId, status: 'active'
    }, { lines });
    return oneBudget(req, b.id);
  }));

  r.patch('/budgets/:id', wrap(async (req) => {
    assertCan(U(req), 'budgets:edit');
    const b = await oneBudget(req, req.params.id);
    const dto = req.body || {};
    const header = {};
    if (dto.name !== undefined) { if (!String(dto.name || '').trim()) throw badRequest('Budget name is required'); header.name = String(dto.name).trim(); }
    if (dto.fiscalYear !== undefined) header.fiscalYear = trimOrNull(dto.fiscalYear);
    if (dto.budgetType !== undefined) header.budgetType = trimOrNull(dto.budgetType) || 'Amount';
    if (dto.tag !== undefined) header.tag = trimOrNull(dto.tag);
    if (dto.status !== undefined) { if (!['active', 'archived'].includes(dto.status)) throw badRequest('Invalid status'); header.status = dto.status; }
    let period = b.period;
    if (dto.period !== undefined) { const p = String(dto.period).toLowerCase(); if (!PERIODS.includes(p)) throw badRequest('Invalid budget period'); header.period = p; period = p; }
    if (dto.fiscalStart !== undefined) {
      if (!dto.fiscalStart) throw badRequest('Fiscal year start is required');
      const start = new Date(dto.fiscalStart);
      if (isNaN(start.getTime())) throw badRequest('Invalid fiscal year start');
      header.fiscalStart = new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1)).toISOString();
    }
    await S(req).update('budget', b.id, header);
    if (dto.lines !== undefined) await S(req).replaceSub('budget', b.id, 'lines', validateBudgetLines(dto.lines, period));
    return oneBudget(req, b.id);
  }));

  r.delete('/budgets/:id', wrap(async (req) => {
    assertCan(U(req), 'budgets:delete');
    const b = await oneBudget(req, req.params.id);
    await S(req).remove('budget', b.id);
    return { deleted: true, name: b.name };
  }));

  // ---- RFQs / bids / awards --------------------------------------------
  async function oneRfq(req, id) {
    const rfq = await S(req).mustGet('rfq', id, 'RFQ', ['lines', 'vendors']);
    rfq.bids = await S(req).list('bid', { refId: rfq.id, limit: 100 });
    rfq.awards = await S(req).list('award', { refId: rfq.id, limit: 100 });
    return rfq;
  }

  r.get('/rfqs', wrap(async (req) => {
    const list = await S(req).list('rfq', { limit: 100, subs: ['lines', 'vendors'] });
    const ids = list.map(x => x.id);
    const bids = ids.length ? await S(req).list('bid', { refIds: ids, limit: 500 }) : [];
    for (const rfq of list) rfq.bids = bids.filter(b => String(b.rfqId) === rfq.id);
    return list;
  }));
  r.get('/rfqs/:id', wrap(async (req) => oneRfq(req, req.params.id)));

  r.post('/rfqs', wrap(async (req) => {
    assertCan(U(req), 'rfq:create');
    const dto = req.body || {};
    if (!Array.isArray(dto.items) || !dto.items.length) throw badRequest('Add at least one item');
    if (!Array.isArray(dto.vendors) || !dto.vendors.length) throw badRequest('Invite at least one vendor');
    const lines = dto.items.map(it => {
      if (!String(it.itemName || '').trim()) throw badRequest('Each item needs a name');
      const qty = it.quantity != null ? Number(it.quantity) : 1;
      return { itemId: it.itemId || null, itemName: String(it.itemName).trim(), quantity: qty, unit: it.unit || 'PCS', needBy: isoOrNull(it.needBy), openQty: qty };
    });
    const vendors = dto.vendors.map(v => {
      if (!String(v.vendorName || '').trim()) throw badRequest('Each vendor needs a name');
      return { vendorId: v.vendorId || null, vendorName: String(v.vendorName).trim(), contactEmail: trimOrNull(v.contactEmail), inviteToken: null, emailSent: false, quoteStatus: 'pending' };
    });
    const due = dto.bidEnd || dto.dueDate;
    const rfq = await S(req).insert('rfq', {
      rfqNumber: await S(req).nextNumber('rfq', 'RFQ'), prId: dto.prId || null,
      title: trimOrNull(dto.title), reference: trimOrNull(dto.reference), currency: trimOrNull(dto.currency),
      bidStart: isoOrNull(dto.bidStart), bidEnd: isoOrNull(dto.bidEnd), awardDate: isoOrNull(dto.awardDate),
      documents: dto.documents || null, team: dto.team || null, dueDate: isoOrNull(due),
      message: trimOrNull(dto.message), terms: trimOrNull(dto.terms),
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
    }, { lines, vendors });
    await audit(req, 'create', 'RFQ', rfq.id, { number: rfq.rfqNumber });
    return oneRfq(req, rfq.id);
  }));

  r.post('/rfqs/:id/submit', wrap(async (req) => {
    const rfq = await oneRfq(req, req.params.id);
    if (rfq.status !== 'draft') throw badRequest(`Cannot submit a ${rfq.status} RFQ`);
    for (const v of rfq.vendors) {
      await S(req).updateLine(v.id, { inviteToken: v.inviteToken || crypto.randomUUID().replace(/-/g, ''), emailSent: true });
    }
    await S(req).update('rfq', rfq.id, { status: 'submitted', submittedAt: new Date().toISOString() });
    await audit(req, 'submit', 'RFQ', rfq.id, { number: rfq.rfqNumber });
    return oneRfq(req, rfq.id);
  }));

  r.post('/rfqs/:id/cancel', wrap(async (req) => {
    const rfq = await oneRfq(req, req.params.id);
    if (['awarded', 'cancelled'].includes(rfq.status)) throw badRequest(`Cannot cancel a ${rfq.status} RFQ`);
    await S(req).update('rfq', rfq.id, { status: 'cancelled' });
    return oneRfq(req, rfq.id);
  }));

  r.get('/rfqs/:id/compare', wrap(async (req) => {
    const rfq = await oneRfq(req, req.params.id);
    const bids = rfq.bids.filter(b => b.status === 'submitted');
    const matrix = rfq.lines.map(rl => {
      const quotes = bids.map(b => ({ bid: b, line: (b.lines || []).find(bl => String(bl.rfqLineId) === rl.id) })).filter(q => q.line);
      const min = quotes.length ? Math.min(...quotes.map(q => Number(q.line.unitPrice))) : null;
      return {
        rfqLineId: rl.id, itemName: rl.itemName, quantity: rl.quantity, openQty: rl.openQty,
        quotes: quotes.map(q => ({
          bidId: q.bid.id, bidLineId: q.line.id, vendorName: q.bid.vendorName,
          quantity: q.line.quantity, unitPrice: q.line.unitPrice, amount: q.line.amount,
          leadDays: q.line.leadDays, note: q.line.note, isBest: min !== null && Number(q.line.unitPrice) === min,
          validTill: q.bid.validTill
        }))
      };
    });
    return { rfqId: rfq.id, rfqNumber: rfq.rfqNumber, status: rfq.status, matrix };
  }));

  r.post('/awards/from-bid', wrap(async (req) => {
    assertCan(U(req), 'rfq:edit', 'rfq:create');
    const dto = req.body || {};
    const bid = await S(req).mustGet('bid', dto.bidId, 'Bid');
    if (bid.status !== 'submitted') throw badRequest('Bid is not active');
    const rfq = await S(req).get('rfq', bid.rfqId, ['lines', 'vendors']);
    if (!rfq || !['submitted', 'awarded_partial'].includes(rfq.status)) throw badRequest('RFQ is not open for award');
    if (!Array.isArray(dto.lines) || !dto.lines.length) throw badRequest('Select at least one bid line');
    const awardLines = [];
    for (const l of dto.lines) {
      const bl = bid.lines.find(b => b.id === String(l.bidLineId));
      if (!bl) throw badRequest('Unknown bid line');
      const rl = rfq.lines.find(x => x.id === String(bl.rfqLineId));
      const qty = Number(l.quantity);
      if (!rl || !(qty > 0) || qty > (Number(rl.openQty) || 0) + 1e-9) throw badRequest(`"${bl.itemName}": max open qty ${rl ? rl.openQty : 0}`);
      awardLines.push({ rfqLineId: rl.id, bidLineId: bl.id, itemName: bl.itemName, vendorName: bid.vendorName, vendorId: bid.vendorId || null, quantity: qty, price: Number(bl.unitPrice) });
    }
    const award = await S(req).insert('award', {
      rfqId: rfq.id, rfqNumber: rfq.rfqNumber, bidId: bid.id, vendorName: bid.vendorName, status: 'active',
      reason: trimOrNull(dto.reason), decidedBy: U(req).userId, decidedByName: U(req).name || U(req).email
    }, { lines: awardLines });
    for (const al of awardLines) {
      const rl = await S(req).lineById(al.rfqLineId);
      if (rl) await S(req).updateLine(rl.id, { openQty: Math.max(0, (Number(rl.openQty) || 0) - al.quantity) });
    }
    const fresh = await S(req).get('rfq', rfq.id);
    const anyOpen = fresh.lines.some(x => (Number(x.openQty) || 0) > 1e-9);
    await S(req).update('rfq', rfq.id, { status: anyOpen ? 'awarded_partial' : 'awarded' });
    await audit(req, 'award', 'RFQ', rfq.id, { number: rfq.rfqNumber, vendor: bid.vendorName });
    return award;
  }));

  r.post('/awards/:id/cancel', wrap(async (req) => {
    const award = await S(req).mustGet('award', req.params.id, 'Award');
    if (award.status !== 'active') throw badRequest('Only active awards can be cancelled');
    const reason = trimOrNull(req.body && req.body.reason);
    if (!reason) throw badRequest('Cancellation reason is required');
    for (const l of award.lines) {
      const rl = await S(req).lineById(l.rfqLineId);
      if (rl) await S(req).updateLine(rl.id, { openQty: (Number(rl.openQty) || 0) + Number(l.quantity) });
    }
    await S(req).update('award', award.id, { status: 'cancelled', reason });
    await S(req).update('rfq', award.rfqId, { status: 'submitted' });
    return S(req).get('award', award.id);
  }));

  r.post('/awards/:id/purchase-order', wrap(async (req) => {
    assertCan(U(req), 'po:create');
    const award = await S(req).mustGet('award', req.params.id, 'Award');
    if (award.status !== 'active') throw badRequest('Only active awards convert to PO');
    const byVendor = {};
    for (const l of award.lines) {
      const key = l.vendorName || award.vendorName || 'Vendor';
      (byVendor[key] = byVendor[key] || { vendorId: l.vendorId || null, lines: [] }).lines.push(l);
    }
    const pos = [];
    for (const [vendorName, group] of Object.entries(byVendor)) {
      const po = await S(req).insert('po', {
        poNumber: await S(req).nextNumber('po', 'PO', 'numbering.pos'),
        vendorId: group.vendorId, vendorName, sourceRfqId: award.rfqId, sourceAwardId: award.id,
        notes: `From award ${award.id.slice(-8)} (${award.rfqNumber || ''})`.trim(),
        createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
      }, { lines: group.lines.map(l => ({ itemName: l.itemName || 'Item', quantity: Number(l.quantity), rate: Number(l.price), category: 'Other', receivedQty: 0, billedQty: 0 })) });
      pos.push(po);
    }
    await S(req).update('award', award.id, { poIds: pos.map(p => p.id) });
    return pos;
  }));

  // ---- Recurring bills --------------------------------------------------
  const FREQ = ['weekly', 'monthly', 'quarterly', 'yearly'];
  function advance(date, freq) {
    const d = new Date(date);
    if (freq === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (freq === 'quarterly') d.setUTCMonth(d.getUTCMonth() + 3);
    else if (freq === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }

  r.get('/recurrence', wrap(async (req) => S(req).list('recurrence', { limit: 100, subs: null })));
  r.get('/recurrence/:id', wrap(async (req) => S(req).mustGet('recurrence', req.params.id, 'Recurrence', null)));

  r.post('/recurrence', wrap(async (req) => {
    assertCan(U(req), 'recurring:create', 'bills:create');
    const dto = req.body || {};
    if (!String(dto.profileName || '').trim()) throw badRequest('Profile name is required');
    const tpl = await S(req).mustGet('bill', dto.templateBillId, 'Template bill');
    const freq = FREQ.includes(dto.frequency) ? dto.frequency : 'monthly';
    const start = isoOrNull(dto.startDate) || new Date().toISOString();
    return S(req).insert('recurrence', {
      templateBillId: tpl.id, templateBillNumber: tpl.billNumber, vendorName: tpl.vendorName || '',
      profileName: String(dto.profileName).trim(), frequency: freq, startDate: start, endDate: isoOrNull(dto.endDate),
      nextRunDate: start, disabled: false, status: 'active', createdBy: U(req).userId
    });
  }));

  r.post('/recurrence/:id/run', wrap(async (req) => {
    assertCan(U(req), 'recurring:create', 'bills:create');
    const rec = await S(req).mustGet('recurrence', req.params.id, 'Recurrence', null);
    if (rec.disabled || rec.status !== 'active') throw badRequest('Recurrence is not active');
    if (new Date(rec.nextRunDate) > new Date()) throw badRequest('Not due yet');
    if (rec.endDate && new Date(rec.nextRunDate) > new Date(rec.endDate)) {
      await S(req).update('recurrence', rec.id, { status: 'completed' });
      throw badRequest('Schedule has ended');
    }
    const tpl = await S(req).mustGet('bill', rec.templateBillId, 'Template bill');
    const child = await S(req).insert('bill', {
      billNumber: await S(req).nextNumber('bill', 'BILL', 'numbering.bills'),
      vendorId: tpl.vendorId || null, vendorName: tpl.vendorName || '',
      issueDate: new Date().toISOString(), dueDate: tpl.dueDate || null,
      notes: `Recurring "${rec.profileName}"`, recurrenceId: rec.id, amountPaid: 0,
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
    }, { lines: tpl.lines.map(l => ({ itemName: l.itemName, quantity: Number(l.quantity), rate: Number(l.rate), account: l.account || null, tax: l.tax || null })) });
    const next = advance(new Date(rec.nextRunDate), rec.frequency);
    const done = rec.endDate && next > new Date(rec.endDate);
    await S(req).update('recurrence', rec.id, { nextRunDate: next.toISOString(), lastRunDate: new Date().toISOString(), status: done ? 'completed' : 'active' });
    return oneBill(req, child.id);
  }));

  r.post('/recurrence/:id/disable', wrap(async (req) => {
    const rec = await S(req).mustGet('recurrence', req.params.id, 'Recurrence', null);
    await S(req).update('recurrence', rec.id, { disabled: true, status: 'disabled' });
    return S(req).get('recurrence', rec.id, null);
  }));

  r.patch('/recurrence/:id', wrap(async (req) => {
    const rec = await S(req).mustGet('recurrence', req.params.id, 'Recurrence', null);
    const dto = req.body || {};
    const data = {};
    if (dto.profileName !== undefined) { if (!String(dto.profileName || '').trim()) throw badRequest('Profile name is required'); data.profileName = String(dto.profileName).trim(); }
    if (dto.frequency !== undefined) { const f = String(dto.frequency).toLowerCase(); if (!FREQ.includes(f)) throw badRequest('Invalid frequency'); data.frequency = f; }
    if (dto.startDate !== undefined) data.startDate = isoOrNull(dto.startDate) || new Date().toISOString();
    if (dto.endDate !== undefined) data.endDate = isoOrNull(dto.endDate);
    const start = data.startDate || rec.startDate;
    const end = data.endDate !== undefined ? data.endDate : rec.endDate;
    if (start && end && new Date(end) < new Date(start)) throw badRequest('End date cannot be before the start date');
    await S(req).update('recurrence', rec.id, data);
    return S(req).get('recurrence', rec.id, null);
  }));

  r.delete('/recurrence/:id', wrap(async (req) => {
    const rec = await S(req).mustGet('recurrence', req.params.id, 'Recurrence', null);
    await S(req).remove('recurrence', rec.id);
    return { deleted: true, profileName: rec.profileName };
  }));

  // ---- Payment batches --------------------------------------------------
  async function oneBatch(req, id) { return S(req).mustGet('batch', id, 'Batch'); }
  async function validateBatchLines(req, lines) {
    if (!Array.isArray(lines) || !lines.length) throw badRequest('Add at least one bill');
    const out = [];
    for (const l of lines) {
      if (!(Number(l.amount) > 0)) throw badRequest('Each line amount must be > 0');
      const b = await S(req).get('bill', l.billId, null);
      if (!b) throw badRequest('Unknown bill in batch');
      out.push({ billId: b.id, billNumber: b.billNumber, vendorName: b.vendorName, amount: Number(l.amount), status: 'pending' });
    }
    return out;
  }

  r.get('/batches', wrap(async (req) => S(req).list('batch', { limit: 100 })));
  r.get('/batches/:id', wrap(async (req) => oneBatch(req, req.params.id)));

  r.post('/batches', wrap(async (req) => {
    assertCan(U(req), 'batch:create', 'payments:create');
    const dto = req.body || {};
    const lines = await validateBatchLines(req, dto.lines);
    return S(req).insert('batch', {
      batchNumber: await S(req).nextNumber('batch', 'BATCH'), batchName: trimOrNull(dto.batchName),
      paidThrough: trimOrNull(dto.paidThrough), paymentDate: isoOrNull(dto.paymentDate), reference: trimOrNull(dto.reference),
      createdBy: U(req).userId, createdByName: U(req).name || U(req).email, status: 'draft'
    }, { lines });
  }));

  r.post('/batches/:id/process', wrap(async (req) => {
    assertCan(U(req), 'batch:approve', 'payments:create');
    const batch = await oneBatch(req, req.params.id);
    if (!['draft', 'partially_processed', 'failed'].includes(batch.status)) throw badRequest(`Batch is ${batch.status}`);
    let failed = 0, paidNow = 0;
    for (const l of batch.lines.filter(x => x.status !== 'paid')) {
      try {
        await payBill(req, l.billId, { amount: l.amount, method: batch.paidThrough || 'Batch', reference: batch.batchNumber, paidAt: batch.paymentDate });
        paidNow++;
        await S(req).updateLine(l.id, { status: 'paid' });
      } catch (err) {
        failed++;
        await S(req).updateLine(l.id, { status: 'failed', error: err && err.expose ? err.message : 'Payment failed' });
      }
    }
    const previouslyPaid = batch.lines.filter(x => x.status === 'paid').length;
    const status = failed === 0 ? 'processed' : (previouslyPaid + paidNow === 0 ? 'failed' : 'partially_processed');
    await S(req).update('batch', batch.id, { status, processedAt: new Date().toISOString() });
    return oneBatch(req, batch.id);
  }));

  r.post('/batches/:id/cancel', wrap(async (req) => {
    const batch = await oneBatch(req, req.params.id);
    if (batch.status !== 'draft') throw badRequest('Only draft batches can be cancelled');
    await S(req).update('batch', batch.id, { status: 'cancelled' });
    return oneBatch(req, batch.id);
  }));

  r.patch('/batches/:id', wrap(async (req) => {
    const batch = await oneBatch(req, req.params.id);
    const dto = req.body || {};
    const header = {};
    if (dto.batchName !== undefined) { if (!String(dto.batchName || '').trim()) throw badRequest('Batch name is required'); header.batchName = String(dto.batchName).trim(); }
    if (dto.paidThrough !== undefined) header.paidThrough = trimOrNull(dto.paidThrough);
    if (dto.paymentDate !== undefined) header.paymentDate = isoOrNull(dto.paymentDate);
    if (dto.reference !== undefined) header.reference = trimOrNull(dto.reference);
    await S(req).update('batch', batch.id, header);
    if (dto.lines !== undefined) {
      if (batch.status !== 'draft') throw badRequest(`Cannot change bills on a ${batch.status} batch`);
      const lines = await validateBatchLines(req, dto.lines);
      await S(req).replaceSub('batch', batch.id, 'lines', lines);
    }
    return oneBatch(req, batch.id);
  }));

  r.delete('/batches/:id', wrap(async (req) => {
    const batch = await oneBatch(req, req.params.id);
    await S(req).remove('batch', batch.id);
    return { deleted: true, batchNumber: batch.batchNumber };
  }));

  // ---- Dashboard --------------------------------------------------------
  const SPEND_OK = s => !['draft', 'pending', 'void', 'cancelled'].includes(s);
  const OPEN_BILL = s => ['open', 'partially_paid', 'overdue', 'pending'].includes(s);
  function channelOf(method) {
    const s = String(method || '').toLowerCase();
    if (/cash/.test(s)) return 'Cash';
    if (/card|visa|master|amex/.test(s)) return 'Corporate Card';
    if (/bank|transfer|neft|rtgs|wire|cheque|check|online|tt\b/.test(s)) return 'Bank Transfer';
    return 'Others';
  }

  r.get('/dashboard/summary', wrap(async (req) => {
    const period = String(req.query.period || 'year');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    let since = null, until = null;
    if (period === 'month') since = monthStart;
    else if (period === '30days') since = new Date(now.getTime() - 30 * 86400000);
    else if (period === 'quarter') since = quarterStart;
    else if (period === 'lastmonth') { since = new Date(now.getFullYear(), now.getMonth() - 1, 1); until = monthStart; }
    const inRange = (d) => { const t = new Date(d || 0); return (!since || t >= since) && (!until || t < until); };

    const store = S(req);
    const [posAll, billsAll, paymentsAll, prs, rfqs, receives, budgets] = await Promise.all([
      store.list('po', { limit: 500 }), store.list('bill', { limit: 500 }), store.list('payment', { limit: 500, subs: null }),
      store.list('pr', { limit: 500 }), store.list('rfq', { limit: 300, subs: ['vendors'] }), store.list('receive', { limit: 500, subs: null }),
      store.list('budget', { status: 'active', limit: 50 })
    ]);
    const itemRows = await store._all(`SELECT ROWID, Category, CREATEDTIME FROM Items WHERE OrgID = '${esc(req.orgId)}'`, 1000);
    const vendorRows = await store._all(`SELECT ROWID, Status, CREATEDTIME FROM Suppliers WHERE OrgID = '${esc(req.orgId)}'`, 1000);
    const catTime = t => t ? new Date(String(t).replace(/:(\d{3})$/, '.$1').replace(' ', 'T') + 'Z') : new Date(0);
    const items = itemRows.map(x => x.Items).filter(i => inRange(catTime(i.CREATEDTIME)));
    const vendors = vendorRows.map(x => x.Suppliers).filter(v => inRange(catTime(v.CREATEDTIME)));

    const pos = posAll.filter(p => inRange(p.createdAt));
    const bills = billsAll.filter(b => inRange(b.createdAt));
    const payments = paymentsAll.filter(p => inRange(p.paidAt || p.createdAt));

    const totals = new Map(bills.map(b => [b.id, billTotal(b)]));
    const bal = b => totals.get(b.id) - (Number(b.amountPaid) || 0);
    const isOverdue = b => ['open', 'partially_paid', 'overdue'].includes(b.status) && pastDue(b.dueDate, now) && bal(b) > 0;

    const spendBills = bills.filter(b => SPEND_OK(b.status));
    const sum = list => list.reduce((s, b) => s + totals.get(b.id), 0);
    const poSpend = sum(spendBills.filter(b => b.poId));
    const nonPoSpend = sum(spendBills.filter(b => !b.poId));
    const monthly = Array(12).fill(0);
    for (const b of spendBills) {
      const d = new Date(b.issueDate || b.createdAt);
      if (d.getFullYear() === now.getFullYear()) monthly[d.getMonth()] += totals.get(b.id);
    }

    const poLinesByPo = new Map(posAll.map(po => [po.id, po.lines || []]));
    const lineMatch = (poId, bl) => {
      const pls = poLinesByPo.get(poId) || [];
      const pl = pls.find(p => p.id === bl.poLineId) || pls.find(p => String(p.itemName || '').toLowerCase() === String(bl.itemName || '').toLowerCase());
      if (!pl) return false;
      if (Number(bl.quantity) > Number(pl.quantity)) return false;
      if (Number(pl.rate) === 0) return Number(bl.rate) === 0;
      return Math.abs(Number(bl.rate) - Number(pl.rate)) / Math.abs(Number(pl.rate)) <= 0.02;
    };
    let matched = 0, linked = 0;
    const unmatchedBills = [];
    for (const b of bills.filter(x => x.poId)) {
      let allOk = (b.lines || []).length > 0;
      for (const l of b.lines || []) { linked++; if (lineMatch(b.poId, l)) matched++; else allOk = false; }
      if (!allOk && !['paid', 'void', 'cancelled'].includes(b.status)) unmatchedBills.push(b);
    }
    const matchPct = linked ? Math.round((matched / linked) * 1000) / 10 : 0;

    const attn = [];
    const awaiting = prs.filter(p => p.status === 'awaiting').length;
    const overdue = bills.filter(isOverdue);
    const thinRfqs = rfqs.filter(x => !['cancelled', 'awarded', 'awarded_partial', 'expired'].includes(x.status) && (x.vendors || []).length < 3);
    if (awaiting) attn.push({ kind: 'pr_approval', title: `${awaiting} purchase request(s) awaiting approval`, detail: 'Review and approve pending requests', link: '/workspace/approvals' });
    if (overdue.length) attn.push({ kind: 'overdue_bill', title: `${overdue.length} overdue bill(s)`, detail: `LKR ${Math.round(overdue.reduce((s, b) => s + bal(b), 0)).toLocaleString()} past due`, link: '/workspace/bills' });
    if (unmatchedBills.length) attn.push({ kind: 'unmatched_bill', title: `${unmatchedBills.length} PO-linked bill(s) awaiting match`, detail: 'Bill lines differ from PO qty/rate tolerance', link: '/workspace/bills' });
    for (const x of thinRfqs) { if (attn.length >= 5) break; attn.push({ kind: 'rfq_thin', title: `RFQ ${x.rfqNumber} has fewer than 3 vendors`, detail: `${(x.vendors || []).length} vendor(s) invited`, link: '/workspace/rfq' }); }

    const payable = bills.filter(b => OPEN_BILL(b.status) && bal(b) > 0);
    const buckets = { current: 0, d1_15: 0, d16_30: 0, d31_45: 0, d45plus: 0 };
    for (const b of payable) {
      const v = bal(b);
      const days = b.dueDate ? Math.floor((now.getTime() - new Date(b.dueDate).getTime()) / 86400000) : -1;
      if (days <= 0) buckets.current += v; else if (days <= 15) buckets.d1_15 += v; else if (days <= 30) buckets.d16_30 += v; else if (days <= 45) buckets.d31_45 += v; else buckets.d45plus += v;
    }

    const itemCounts = new Map();
    for (const p of prs) for (const l of p.lines || []) itemCounts.set(l.itemName, (itemCounts.get(l.itemName) || 0) + (Number(l.quantity) || 1));
    const vendorSpend = new Map();
    for (const b of spendBills) vendorSpend.set(b.vendorName || 'Unknown', (vendorSpend.get(b.vendorName || 'Unknown') || 0) + totals.get(b.id));
    const acctTotals = new Map();
    for (const p of payments) acctTotals.set(p.method || 'Unspecified', (acctTotals.get(p.method || 'Unspecified') || 0) + (Number(p.amount) || 0));
    const top = (m, k, v, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, val]) => ({ [k]: name, [v]: round2(val) }));

    const order = ['Bank Transfer', 'Cash', 'Corporate Card', 'Others'];
    const chCounts = new Map(order.map(c => [c, 0]));
    for (const p of payments) chCounts.set(channelOf(p.method), (chCounts.get(channelOf(p.method)) || 0) + 1);
    const channels = order.map(name => ({ name, count: chCounts.get(name) || 0, pct: payments.length ? Math.round(((chCounts.get(name) || 0) / payments.length) * 1000) / 10 : 0 }));

    const poById = new Map(posAll.map(p => [p.id, p]));
    const hrs = [];
    for (const g of receives) { const po = poById.get(g.poId); if (po) hrs.push((new Date(g.createdAt).getTime() - new Date(po.createdAt).getTime()) / 3600000); }

    // Real budgets: used = approved spend in the budget's fiscal year for that category (or all).
    const budgetCards = budgets.slice(0, 5).map(b => {
      const cap = budgetTotal(b);
      const cats = new Set((b.lines || []).map(l => String(l.category || 'All')));
      const fy = b.fiscalStart ? new Date(b.fiscalStart) : null;
      const fyEnd = fy ? new Date(Date.UTC(fy.getUTCFullYear() + 1, fy.getUTCMonth(), 1)) : null;
      let used = 0;
      for (const bill of billsAll.filter(x => SPEND_OK(x.status))) {
        const d = new Date(bill.issueDate || bill.createdAt);
        if (fy && (d < fy || d >= fyEnd)) continue;
        for (const l of bill.lines || []) {
          if (cats.has('All') || cats.has(String(l.account || '')) || cats.has(String(l.category || ''))) used += (Number(l.quantity) || 0) * (Number(l.rate) || 0);
        }
      }
      return { id: b.id, name: b.name, usedPct: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0, cap: round2(cap), used: round2(used) };
    });

    return {
      kpis: {
        ordersIssued: pos.filter(p => !['draft', 'pending', 'cancelled'].includes(p.status)).length,
        ordersPending: pos.filter(p => ['draft', 'pending'].includes(p.status)).length,
        billsProcessed: bills.filter(b => ['paid', 'partially_paid'].includes(b.status)).length,
        billsAwaitingMatch: unmatchedBills.length,
        newItems: items.length,
        itemCategories: new Set(items.map(i => i.Category || 'Other')).size,
        newVendors: vendors.length,
        vendorsOnboarding: vendors.filter(v => String(v.Status || 'Active') !== 'Active').length,
        requestsAwaiting: awaiting
      },
      spend: { total: round2(poSpend + nonPoSpend), poSpend: round2(poSpend), nonPoSpend: round2(nonPoSpend), monthly: monthly.map(round2) },
      attention: { items: attn.slice(0, 5) },
      payables: {
        totalDue: round2(payable.reduce((s, b) => s + bal(b), 0)), overdueCount: overdue.length,
        buckets: { current: round2(buckets.current), d1_15: round2(buckets.d1_15), d16_30: round2(buckets.d16_30), d31_45: round2(buckets.d31_45), d45plus: round2(buckets.d45plus) }
      },
      budgets: budgetCards,
      intelligence: { items: top(itemCounts, 'name', 'count'), vendors: top(vendorSpend, 'name', 'spend'), accounts: top(acctTotals, 'name', 'total') },
      paymentModes: { total: payments.length, channels },
      compliance: {
        rfqThin: thinRfqs.length,
        avgOrderToReceiveHrs: hrs.length ? Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 10) / 10 : 0,
        autoscannedPct: 0, matchPct
      }
    };
  }));

  r.use((req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} /api/v1${req.path}`, message: 'Not found' }));

  return r;
}

module.exports = { createV1Router, fullMatrix };
