// Drive the /api/v1 surface end to end through the REAL Express app —
// security headers, auth middleware, workspace middleware and the v1 router —
// against an in-memory Catalyst stub that understands the ZCQL this code
// actually issues. Every list/detail shape the React client reads is
// asserted here, so a renamed field fails the gate rather than rendering "—".
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = REPO_ROOT + '/functions/procurement_api';
const require = createRequire(ROOT + '/index.js');

let pass = 0, fail = 0;
const ok = m => { pass++; };
const bad = (m, d) => { console.log(`  FAIL  ${m}\n        ${d}`); fail++; };
const is = (m, got, want) => got === want ? ok(m) : bad(m, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const truthy = (m, v) => v ? ok(m) : bad(m, `falsy: ${JSON.stringify(v)}`);

// ---------------------------------------------------------------------------
// In-memory Catalyst
// ---------------------------------------------------------------------------
let seq = 1000;
const nextId = () => String(++seq);
const stamp = () => {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const db = {
  Organizations: [{ ROWID: '1', Name: 'Galle Face Hotel', Status: 'Active', Settings: JSON.stringify({ currency: 'LKR', multiProperty: true }) }],
  Users: [
    { ROWID: '10', OrgID: '1', Email: 'admin@gallefacehotel.com', FullName: 'Amali Perera', RoleID: '30', ProfileID: '20', Status: 'Active', ApprovalLimit: 100000, CREATEDTIME: stamp() },
    { ROWID: '11', OrgID: '1', Email: 'buyer@gallefacehotel.com', FullName: 'Kasun Silva', RoleID: '31', ProfileID: '21', Status: 'Active', ApprovalLimit: 0, CREATEDTIME: stamp() }
  ],
  Profiles: [
    { ROWID: '20', OrgID: '1', ProfileName: 'Administrator', Permissions: '{"*":true}', Description: 'Full access' },
    { ROWID: '21', OrgID: '1', ProfileName: 'Add / View / Edit', Permissions: '{"view":true,"create":true,"edit":true}', Description: 'No approvals' },
    { ROWID: '22', OrgID: '1', ProfileName: 'Add / View / Edit / Approve', Permissions: '{"view":true,"create":true,"edit":true,"approve":true}', Description: 'Approver' }
  ],
  Roles: [
    { ROWID: '30', OrgID: '1', RoleName: 'Administrator' },
    { ROWID: '31', OrgID: '1', RoleName: 'Head of the department' }
  ],
  Items: [{ ROWID: '40', OrgID: '1', Name: 'Bath towel', SKU: 'TW-01', Category: 'Housekeeping', Unit: 'PCS', UnitPrice: 1200, Description: '', CREATEDTIME: stamp() }],
  Suppliers: [{ ROWID: '50', OrgID: '1', Name: 'Damro', ContactEmail: 'sales@damro.lk', Phone: '011', Address: 'Colombo', Status: 'Active', CustomFieldsJson: '{"Payment Terms":"Net 30"}', Rating: 5, CREATEDTIME: stamp() }],
  Properties: [{ ROWID: '60', OrgID: '1', Name: 'Galle Face Hotel Colombo', Location: 'Colombo', Cluster: 'GFH', Status: 'Active' }],
  PropertyAssignments: [], AuditLog: [], V1Docs: [], V1Lines: []
};

function parseWhere(where) {
  const conds = [];
  const re = /(\w+)\s*(=|IN|>=|>|<=|<|IS NULL|IS NOT NULL)\s*(?:'((?:[^']|'')*)'|\(([^)]*)\)|(-?\d+(?:\.\d+)?))?/g;
  for (const m of where.matchAll(re)) {
    const [, col, op, str, list, num] = m;
    if (op === 'IN') conds.push({ col, op, vals: [...list.matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")) });
    else if (op === '=' ) conds.push({ col, op, val: str !== undefined ? str.replace(/''/g, "'") : num });
    else conds.push({ col, op, val: num !== undefined ? Number(num) : str });
  }
  return conds;
}
function runZCQL(q) {
  const table = (q.match(/FROM\s+(\w+)/i) || [])[1];
  if (!table || !db[table]) throw new Error(`Unknown table ${table} in: ${q}`);
  let rows = [...db[table]];
  const whereM = q.match(/WHERE\s+(.*?)(?:\s+ORDER BY|\s+LIMIT|$)/is);
  if (whereM) {
    for (const c of parseWhere(whereM[1])) {
      rows = rows.filter(r => {
        const v = r[c.col];
        if (c.op === 'IN') return c.vals.includes(String(v ?? ''));
        if (c.op === '=') return String(v ?? '') === String(c.val);
        if (c.op === '>=') return Number(v) >= c.val;
        if (c.op === '>') return Number(v) > c.val;
        if (c.op === 'IS NULL') return v == null || v === '';
        return true;
      });
    }
  }
  const orderM = q.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i);
  if (orderM) {
    const col = orderM[1], dir = (orderM[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
    rows.sort((a, b) => (Number(a[col]) - Number(b[col])) * dir);
  }
  const limitM = q.match(/LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/i);
  if (limitM) {
    const [off, cnt] = limitM[2] ? [Number(limitM[1]), Number(limitM[2])] : [0, Number(limitM[1])];
    if (cnt > 300) throw new Error('ZCQL CANNOT HAVE MORE THAN 300 ROWS in LIMIT');
    rows = rows.slice(off, off + cnt);
  }
  if (/COUNT\(ROWID\)/i.test(q)) return [{ [table]: { 'COUNT(ROWID)': rows.length } }];
  return rows.map(r => ({ [table]: { ...r } }));
}
function tableApi(name) {
  return {
    insertRow: async r => { const row = { ...r, ROWID: nextId(), CREATEDTIME: stamp(), MODIFIEDTIME: stamp() }; if (String(row.Data || '').length > 10000) throw new Error('text too long'); db[name].push(row); return { ...row }; },
    insertRows: async rs => Promise.all(rs.map(r => tableApi(name).insertRow(r))),
    updateRow: async r => { const row = db[name].find(x => String(x.ROWID) === String(r.ROWID)); if (!row) throw new Error('no row'); Object.assign(row, r, { MODIFIEDTIME: stamp() }); return { ...row }; },
    updateRows: async rs => Promise.all(rs.map(r => tableApi(name).updateRow(r))),
    deleteRow: async id => { const i = db[name].findIndex(x => String(x.ROWID) === String(id)); if (i >= 0) db[name].splice(i, 1); return {}; }
  };
}
let currentEmail = 'admin@gallefacehotel.com';
require.cache[require.resolve('zcatalyst-sdk-node')] = {
  id: 'zcatalyst-sdk-node', filename: 'zcatalyst-sdk-node', loaded: true, exports: {
    initialize: () => ({
      zcql: () => ({ executeZCQLQuery: async q => runZCQL(q) }),
      datastore: () => ({ table: tableApi }),
      userManagement: () => ({
        getCurrentUser: async () => { if (!currentEmail) throw new Error('no session'); return { email_id: currentEmail, first_name: 'Test', last_name: 'User', user_id: 'cu1' }; },
        getAllUsers: async () => [], registerUser: async (c, u) => ({ user_id: 'cu-new', ...u }), deleteUser: async () => ({})
      }),
      filestore: () => ({}), stratus: () => ({})
    })
  }
};
process.env.APP_ORIGIN = 'https://procurement.cloudhub.lk';
process.env.PROCUREFLOW_AUTH_ZAID = 'zaid-test';
const app = require(ROOT + '/index.js');
const server = http.createServer(app);
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, body) {
  const res = await fetch(base + '/api/v1' + path, {
    method, headers: { 'Content-Type': 'application/json', Host: 'procurement.cloudhub.lk' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const GET = p => call('GET', p), POST = (p, b = {}) => call('POST', p, b), PATCH = (p, b) => call('PATCH', p, b), DEL = p => call('DELETE', p);

// ---------------------------------------------------------------------------
console.log('v1 API end-to-end');

// Health is public.
currentEmail = null;
let r = await GET('/health');
is('health without session', r.status, 200);
is('health reports build', typeof r.body.version, 'string');
r = await GET('/prs');
is('prs without session -> 401', r.status, 401);
currentEmail = 'admin@gallefacehotel.com';

// Session.
r = await GET('/auth/me');
is('auth/me 200', r.status, 200);
is('me.id is the Users ROWID', r.body.id, '10');
is('me.orgName', r.body.orgName, 'Galle Face Hotel');
is('me.roles from profile', r.body.roles[0], 'Administrator');
truthy('admin has users:manage', r.body.permissions.includes('users:manage'));
is('me.orgSettings.currency', r.body.orgSettings.currency, 'LKR');

// Not a member.
currentEmail = 'stranger@example.com';
r = await GET('/auth/me');
// provisionInvitedUser creates a least-privilege row when roles/profiles exist
is('stranger auto-provisioned (invitation is the authorisation)', r.status, 200);
is('provisioned user gets the non-admin profile', r.body.roles[0] === 'Administrator', false);
truthy('provisioned notice explains view-only', /view-only/.test(r.body.notice || ''));
currentEmail = 'admin@gallefacehotel.com';

// Users & roles.
r = await GET('/users');
is('users list', r.status, 200);
truthy('users have roles array', Array.isArray(r.body[0].roles));
is('user status lower-case', r.body[0].status, 'active');
r = await GET('/roles');
is('roles are profiles (deduped by name)', r.body.length, 3);
truthy('approver profile grants pr:approve', r.body.find(x => x.name === 'Add / View / Edit / Approve').permissions.includes('pr:approve'));
truthy('editor profile lacks pr:approve', !r.body.find(x => x.name === 'Add / View / Edit').permissions.includes('pr:approve'));
r = await POST('/users', { email: 'new@gallefacehotel.com', name: 'New Person', role: 'Add / View / Edit' });
is('invite user', r.status, 200);
is('invited status', r.body.status, 'invited');
is('invited role', r.body.roles[0], 'Add / View / Edit');
r = await PATCH(`/users/${r.body.id}`, { role: 'Add / View / Edit / Approve', name: 'Renamed' });
is('patch user role', r.body.roles[0], 'Add / View / Edit / Approve');
is('patch user name', r.body.name, 'Renamed');

// Masters.
r = await GET('/items');
is('items map Name->name', r.body[0].name, 'Bath towel');
is('items map UnitPrice->costPrice', r.body[0].costPrice, 1200);
r = await POST('/items', { name: 'Hand soap', sku: 'HS-1', category: 'Housekeeping', unit: 'PCS', costPrice: 250 });
is('create item', r.status, 200);
is('created item shape', r.body.sku, 'HS-1');
r = await POST('/items', { name: 'Hand soap' });
is('duplicate item name -> 409', r.status, 409);
r = await GET('/vendors');
is('vendors map Suppliers', r.body[0].name, 'Damro');
is('vendor payment terms from custom fields', r.body[0].paymentTerms, 'Net 30');
r = await POST('/vendors', { name: 'Araliya', email: 'x@araliya.lk', paymentTerms: 'Net 15' });
is('create vendor', r.status, 200);
r = await POST('/vendors', { name: 'Araliya' });
is('duplicate vendor -> 409', r.status, 409);
r = await GET('/properties');
is('properties', r.body[0].name, 'Galle Face Hotel Colombo');

// Settings.
r = await PATCH('/settings', { settings: { 'org.profile': { name: 'GFH' }, 'access.customRoles': [{ id: 'r1', name: 'Auditor', grants: ['bills:view'] }] } });
is('settings save returns map', r.body['org.profile'].name, 'GFH');
truthy('settings keep arrays', Array.isArray(r.body['access.customRoles']));
r = await GET('/settings');
is('settings persist', r.body['access.customRoles'][0].name, 'Auditor');

// Purchase requests: buyer raises, admin approves.
currentEmail = 'buyer@gallefacehotel.com';
r = await POST('/prs', { reason: 'Linen refresh', lines: [{ itemName: 'Bath towel', quantity: 10, estimatedRate: 1200 }, { itemName: 'Hand soap', quantity: 4, estimatedRate: 250, discount: 10 }] });
is('create PR', r.status, 200);
const pr = r.body;
is('PR draft', pr.status, 'draft');
is('PR number', pr.prNumber, 'PR-0001');
is('PR lines', pr.lines.length, 2);
is('PR requesterName', pr.requesterName, 'Kasun Silva');
r = await GET('/prs/mine');
is('prs/mine for buyer', r.body.length, 1);
r = await PATCH(`/prs/${pr.id}`, { notes: 'Urgent', lines: [{ itemName: 'Bath towel', quantity: 12, estimatedRate: 1200 }] });
is('PR edit replaces lines', r.body.lines.length, 1);
is('PR edit notes', r.body.notes, 'Urgent');
r = await POST(`/prs/${pr.id}/approve`);
is('buyer cannot approve (no pr:approve)', r.status, 403);
r = await POST(`/prs/${pr.id}/submit`);
is('submit PR', r.body.status, 'awaiting');
r = await GET('/prs/pending');
is('pending lists it', r.body.length, 1);
currentEmail = 'admin@gallefacehotel.com';
r = await POST(`/prs/${pr.id}/reject`, {});
is('reject needs a reason', r.status, 400);
r = await POST(`/prs/${pr.id}/approve`);
is('admin approves', r.body.status, 'approved');
is('approverName recorded', r.body.approverName, 'Amali Perera');

// PO from PR.
r = await POST('/pos/from-pr', { prId: pr.id, vendorName: 'Damro', vendorId: '50' });
is('PO from PR', r.status, 200);
const po = r.body;
is('PO number', po.poNumber, 'PO-0001');
is('PO line rate from PR', po.lines[0].rate, 1200);
is('PO line quantity', po.lines[0].quantity, 12);
r = await GET(`/prs/${pr.id}`);
is('PR processed', r.body.status, 'processed');
r = await POST(`/pos/${po.id}/issue`);
is('PO issued', r.body.status, 'issued');

// Receive.
r = await POST('/receives/from-po', { poId: po.id, lines: [{ poLineId: po.lines[0].id, quantity: 20 }] });
is('over-receive refused', r.status, 400);
r = await POST('/receives/from-po', { poId: po.id, lines: [{ poLineId: po.lines[0].id, quantity: 5 }], notes: 'first drop' });
is('receive created', r.status, 200);
const grn = r.body;
is('GRN number', grn.grnNumber, 'GRN-0001');
truthy('receive carries po', grn.po && grn.po.poNumber === 'PO-0001');
r = await POST(`/receives/${grn.id}/complete`);
is('receive completed', r.body.status, 'completed');
r = await GET(`/pos/${po.id}`);
is('PO partially received', r.body.status, 'partially_received');
is('PO line receivedQty', r.body.lines[0].receivedQty, 5);
is('PO includes receives', r.body.receives.length, 1);
r = await GET('/receives');
truthy('receives list includes po', r.body[0].po && r.body[0].po.id === po.id);

// Bill from receive.
r = await POST('/bills', { receiveId: grn.id, dueDate: '2020-01-01' });
is('bill from receive', r.status, 200);
const bill = r.body;
is('bill number', bill.billNumber, 'BILL-0001');
is('bill vendor from PO', bill.vendorName, 'Damro');
is('bill total', bill.total, 6000);
is('bill balance', bill.balance, 6000);
r = await POST('/bills', { receiveId: grn.id });
is('receive billed twice refused', r.status, 400);
r = await POST(`/bills/${bill.id}/submit`);
is('bill pending', r.body.status, 'pending');
r = await POST(`/bills/${bill.id}/approve`);
is('bill open->overdue (past due)', r.body.status, 'overdue');
r = await GET(`/pos/${po.id}`);
is('PO billedQty accrued', r.body.lines[0].billedQty, 5);
r = await GET(`/bills/${bill.id}/match`);
is('3-way match 100%', r.body.matchPct, 100);
r = await POST(`/bills/${bill.id}/pay`, { amount: 7000, method: 'Bank transfer', reference: 'TT-1' });
is('pay with excess -> paid', r.body.bill.status, 'paid');
is('applied', r.body.applied, 6000);
is('excess', r.body.excess, 1000);
truthy('excess credit created', r.body.credit && r.body.credit.remaining === 1000);
r = await GET('/payments');
is('payments list', r.body.length, 1);
truthy('payment includes bill', r.body[0].bill && r.body[0].bill.billNumber === 'BILL-0001');
r = await GET('/credits');
is('credits list', r.body.length, 1);

// Direct bill + credit apply + multi pay.
r = await POST('/bills', { vendorName: 'Damro', lines: [{ itemName: 'Service', quantity: 1, rate: 3000 }] });
const bill2 = r.body;
await POST(`/bills/${bill2.id}/submit`);
await POST(`/bills/${bill2.id}/approve`);
r = await GET('/credits');
r = await POST(`/credits/${r.body[0].id}/apply`, { billId: bill2.id, amount: 1000 });
is('credit applied', r.body.applied, 1000);
is('bill partially paid', r.body.bill.status, 'partially_paid');
r = await POST('/payments/multi', { vendorName: 'Damro', method: 'Cash', lines: [{ billId: bill2.id, amount: 2000 }] });
is('multi pay result', r.body.results[0].applied, 2000);
r = await GET(`/bills/${bill2.id}`);
is('bill paid after multi', r.body.status, 'paid');
r = await GET('/payments');
const creditPayment = r.body.find(p => p.method === 'Vendor Credit');
r = await DEL(`/payments/${creditPayment.id}`);
is('delete payment', r.body.deleted, true);
r = await GET('/credits');
is('credit restored on payment delete', r.body[0].remaining, 1000);
r = await GET(`/bills/${bill2.id}`);
is('bill back to partially paid', r.body.status, 'partially_paid');

// Budgets.
r = await POST('/budgets', { name: 'Housekeeping FY26', fiscalStart: '2026-04-01', period: 'quarterly', lines: [{ category: 'All', monthIndex: 0, amount: 1000 }, { category: 'All', monthIndex: 3, amount: 500 }] });
is('budget created', r.status, 200);
is('budget total', r.body.total, 1500);
r = await POST('/budgets', { name: 'Bad', fiscalStart: '2026-04-01', period: 'yearly', lines: [{ category: 'All', monthIndex: 3, amount: 1 }] });
is('budget month index validated', r.status, 400);
const budgetId = (await GET('/budgets')).body[0].id;
r = await PATCH(`/budgets/${budgetId}`, { status: 'archived' });
is('budget archived', r.body.status, 'archived');

// RFQ -> portal quote -> compare -> award -> PO.
r = await POST('/rfqs', { title: 'Towels', items: [{ itemName: 'Bath towel', quantity: 100 }], vendors: [{ vendorName: 'Damro', contactEmail: 'sales@damro.lk' }, { vendorName: 'Araliya' }], dueDate: '2030-01-01' });
is('rfq created', r.status, 200);
const rfq = r.body;
is('rfq vendors', rfq.vendors.length, 2);
is('rfq number', rfq.rfqNumber, 'RFQ-0001');
r = await POST(`/rfqs/${rfq.id}/submit`);
is('rfq submitted', r.body.status, 'submitted');
const token = r.body.vendors[0].inviteToken;
truthy('invite token minted', token && token.length >= 20);
currentEmail = null; // portal is public
r = await GET(`/portal/rfqs/${token}`);
is('portal view without session', r.status, 200);
is('portal vendor', r.body.vendorName, 'Damro');
r = await POST(`/portal/rfqs/${token}/quotes`, { lines: [{ rfqLineId: r.body.lines[0].rfqLineId, quantity: 100, unitPrice: 1100, leadDays: 7 }] });
is('portal quote', r.status, 200);
is('bid total', r.body.totalAmount, 110000);
r = await GET('/portal/rfqs/nope');
is('bad token -> 404', r.status, 404);
currentEmail = 'admin@gallefacehotel.com';
r = await GET(`/rfqs/${rfq.id}/compare`);
is('compare has quote', r.body.matrix[0].quotes.length, 1);
truthy('best quote flagged', r.body.matrix[0].quotes[0].isBest);
const q = r.body.matrix[0].quotes[0];
r = await POST('/awards/from-bid', { bidId: q.bidId, lines: [{ bidLineId: q.bidLineId, quantity: 100 }], reason: 'Best price' });
is('award created', r.status, 200);
const award = r.body;
r = await GET(`/rfqs/${rfq.id}`);
is('rfq fully awarded', r.body.status, 'awarded');
is('rfq includes bids', r.body.bids.length, 1);
r = await POST(`/awards/${award.id}/purchase-order`);
is('award -> PO list', r.body.length, 1);
is('award PO rate', r.body[0].lines[0].rate, 1100);
r = await GET('/rfqs');
is('rfq list has bids attached', r.body[0].bids.length, 1);

// Recurrence.
r = await POST('/recurrence', { templateBillId: bill2.id, profileName: 'Monthly service', frequency: 'monthly', startDate: '2020-01-01' });
is('recurrence created', r.status, 200);
const rec = r.body;
r = await POST(`/recurrence/${rec.id}/run`);
is('recurrence run makes a bill', r.body.status, 'draft');
is('generated bill copies lines', r.body.lines[0].rate, 3000);
r = await GET(`/recurrence/${rec.id}`);
truthy('nextRunDate advanced', new Date(r.body.nextRunDate) > new Date('2020-01-01'));
r = await PATCH(`/recurrence/${rec.id}`, { endDate: '2019-01-01' });
is('end before start refused', r.status, 400);

// Batch.
r = await POST('/bills', { vendorName: 'Damro', lines: [{ itemName: 'Batch item', quantity: 1, rate: 500 }] });
const bill3 = r.body; await POST(`/bills/${bill3.id}/submit`); await POST(`/bills/${bill3.id}/approve`);
r = await POST('/batches', { batchName: 'Week 38', paidThrough: 'Bank', lines: [{ billId: bill3.id, amount: 500 }, { billId: bill2.id, amount: 100 }] });
is('batch created', r.status, 200);
is('batch number', r.body.batchNumber, 'BATCH-0001');
r = await POST(`/batches/${r.body.id}/process`);
is('batch processed', r.body.status, 'processed');
is('batch lines paid', r.body.lines.every(l => l.status === 'paid'), true);
r = await GET(`/bills/${bill3.id}`);
is('batch paid the bill', r.body.status, 'paid');

// Dashboard.
r = await GET('/dashboard/summary?period=year');
is('dashboard 200', r.status, 200);
truthy('dashboard kpis', r.body.kpis && typeof r.body.kpis.ordersIssued === 'number');
truthy('dashboard spend', r.body.spend.total > 0);
truthy('dashboard budgets real', Array.isArray(r.body.budgets));
truthy('dashboard payment modes', r.body.paymentModes.channels.length === 4);

// Deletes with guards.
r = await DEL(`/pos/${po.id}`);
is('PO with receives cannot be deleted', r.status, 400);
r = await POST('/pos', { vendorName: 'Damro', lines: [{ itemName: 'Chair', quantity: 2, rate: 100 }] });
r = await DEL(`/pos/${r.body.id}`);
is('draft PO deleted', r.body.deleted, true);

// Unknown route inside v1.
r = await GET('/nope');
is('unknown v1 route -> 404 json', r.status, 404);

server.close();
console.log(`\n  passed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
