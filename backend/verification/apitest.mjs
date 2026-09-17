// Actually EXECUTE the new backend handlers.
//
// Everything else in the gate is static: it proves the code parses and that
// strings appear in files. That is exactly what passed while `PUBLIC_ORIGIN`
// and `authUser.name` — two identifiers that do not exist — sat inside a live
// handler. A ReferenceError only shows up when the function body runs.
//
// So: load index.js with a stubbed Catalyst SDK, pull the real route handlers
// off the Express app, and invoke them.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = REPO_ROOT + '/functions/procurement_api';
// Resolve from the function's own folder so express and the Catalyst SDK come
// from its node_modules, exactly as they do when deployed.
const require = createRequire(ROOT + '/index.js');

let pass = 0, fail = 0;
const ok = m => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m, d) => { console.log(`  FAIL  ${m}\n        ${d}`); fail++; };
const is = (m, got, want) => got === want ? ok(`${m} (${JSON.stringify(got)})`) : bad(m, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const inc = (m, hay, n) => String(hay).includes(n) ? ok(m) : bad(m, `missing "${n}"`);

// ---- stub the Catalyst SDK before index.js requires it --------------------
const rows = {
  Organizations: [{ ROWID: 'org1', Name: 'Galle Face Group', Domain: 'gallefacegroup.com', Status: 'Active',
    Settings: JSON.stringify({ currency: 'LKR', multiProperty: true, paymentTerms: [{ name: 'Credit period' }] }) }],
  Users: [{ ROWID: 'u1', OrgID: 'org1', Email: 'proc@gallefacegroup.com', FullName: 'K. Premaratne',
            RoleID: 'r-hof', Status: 'Active', ProfileID: 'p1', ApprovalLimit: 100000 }],
  Roles: [{ ROWID: 'r-hof', OrgID: 'org1', RoleName: 'Head of Finance' },
          { ROWID: 'r-gm',  OrgID: 'org1', RoleName: 'General Manager' }],
  Profiles: [{ ROWID: 'p1', OrgID: 'org1', ProfileName: 'Administrator', Permissions: '{"*":true}' }],
  Properties: [{ ROWID: 'prop1', OrgID: 'org1', Name: 'Galle Face Hotel Colombo', Cluster: 'Galle Face Hotel', Status: 'Active' }],
  PRs: [{ ROWID: 'pr1', OrgID: 'org1', PRNumber: 'PR-1', PropertyID: 'prop1', Status: 'Pending_Approval',
          TotalAmount: 5000, ApprovalLevel: 2, CREATEDTIME: new Date().toISOString(),
          CustomFieldsJson: JSON.stringify({ budgetClass: 'budget_exceed', expenditureCategory: 'Capex' }),
          Justification: 'Ballroom lighting', DeliveryAddress: 'Colombo', ExpectedDate: '2026-09-01' }],
  PRItems: [{ ROWID: 'li1', OrgID: 'org1', PRID: 'pr1', ItemID: 'it1', Quantity: 12, EstimatedPrice: 400 }],
  Items: [{ ROWID: 'it1', OrgID: 'org1', Name: 'LED Par Can', Unit: 'Unit / Piece (Pcs)' }],
  Suppliers: [{ ROWID: 'v1', OrgID: 'org1', Name: 'Lanka Stage Lighting', ContactEmail: 'sales@lsl.lk' }],
  VendorContacts: [{ ROWID: 'vc1', OrgID: 'org1', VendorID: 'v1', Name: 'A. Perera', Email: 'a.perera@lsl.lk' }],
  RFQs: [{ ROWID: 'rfq1', OrgID: 'org1', RFQNumber: 'RFQ-1001', PRID: 'pr1', Status: 'Published', Deadline: '2026-08-20' }],
  Bids: [{ ROWID: 'b1', OrgID: 'org1', RFQID: 'rfq1', VendorID: 'v1', TotalBidAmount: 450000 }],
  Budgets: [{ ROWID: 'bg1', OrgID: 'org1', PropertyID: 'prop1', Amount: 600000, Spent: 0, Committed: 0, ExpenseType: 'CapEx' }],
  PropertyAssignments: [], POs: []
};

const registeredUsers = [];
const deletedCatalystUsers = [];
let catalystExistingUsers = [];

// A deliberately small ZCQL reader: enough to answer the queries these
// handlers make, and honest about anything it cannot parse.
function runZCQL(q) {
  const table = (q.match(/FROM\s+(\w+)/i) || [])[1];
  if (!table || !rows[table]) return [];
  let out = rows[table];
  for (const m of q.matchAll(/(\w+)\s*=\s*'([^']*)'/g)) {
    const [, col, val] = m;
    out = out.filter(r => String(r[col] ?? '') === val);
  }
  return out.map(r => ({ [table]: r }));
}

require.cache[require.resolve('zcatalyst-sdk-node')] = {
  id: 'zcatalyst-sdk-node', filename: 'zcatalyst-sdk-node', loaded: true, exports: {
    initialize: () => ({
      zcql: () => ({ executeZCQLQuery: async q => runZCQL(q) }),
      datastore: () => ({ table: () => ({
        insertRow: async r => ({ ROWID: 'new1', ...r }), insertRows: async r => r,
        updateRow: async r => r, updateRows: async r => r, deleteRow: async () => ({})
      }) }),
      userManagement: () => ({
        getCurrentUser: async () => ({ email_id: 'proc@gallefacegroup.com', first_name: 'K.', last_name: 'Premaratne', user_id: 'cu1' }),
        getAllUsers: async () => catalystExistingUsers,
        registerUser: async (signupConfig, userConfig) => {
          registeredUsers.push({ signupConfig, userConfig });
          return { user_id: 'cu-new', ...userConfig };
        },
        deleteUser: async userId => { deletedCatalystUsers.push(userId); return {}; }
      }),
      filestore: () => ({}), stratus: () => ({})
    })
  }
};

process.env.APP_ORIGIN = 'https://procurement.cloudhub.lk';
process.env.PROCUREFLOW_AUTH_ZAID = 'zaid-test-123';
const app = require(ROOT + '/index.js');

// ---- pull the real handlers out of the Express router ---------------------
const stack = (app._router || app.router).stack;
function handlerFor(method, path) {
  for (const layer of stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      const fns = layer.route.stack.map(s => s.handle);
      return fns[fns.length - 1];
    }
  }
  return null;
}

async function call(method, path, { body = {}, params = {} } = {}) {
  const fn = handlerFor(method, path);
  if (!fn) throw new Error(`no handler for ${method.toUpperCase()} ${path}`);
  const req = {
    method: method.toUpperCase(), path, body, params, query: {}, headers: {},
    orgId: 'org1', workspace: rows.Organizations[0],
    authUser: { email: 'proc@gallefacegroup.com', firstName: 'K.', lastName: 'Premaratne' },
    catalystApp: require('zcatalyst-sdk-node').initialize(),
    propertyScope: null
  };
  return await new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      setHeader() { return this; }, end() { resolve({ status: this.statusCode, body: null }); }
    };
    Promise.resolve(fn(req, res)).catch(reject);
  });
}

console.log('-- GET /api/health --');
{
  const r = await call('get', '/api/health');
  is('status', r.status, 200);
  is('health response keeps public configuration private', Object.keys(r.body).sort().join(','), 'ok,service,time,version');
}

console.log('-- GET /api/users/invitation-status --');
{
  const r = await call('get', '/api/users/invitation-status');
  is('status', r.status, 200);
  is('invite readiness is available to the admin UI', r.body.configured, true);
}

console.log('-- GET /api/reference --');
{
  const r = await call('get', '/api/reference');
  is('status', r.status, 200);
  is('departments', r.body.departments.length, 10);
  is('categories', r.body.categories.length, 27);
  is('workflow routes', Object.keys(r.body.workflows).length, 3);
  inc('tax treatments carried', JSON.stringify(r.body.taxTreatments), 'SSCL Applicable');
}

console.log('-- POST /api/users sends a Catalyst invitation --');
{
  const r = await call('post', '/api/users', {
    body: {
      Email: 'amara.silva@gallefacegroup.com',
      FullName: 'Amara Silva',
      RoleID: 'r-hof',
      ProfileID: 'p1',
      ApprovalLimit: 5000
    }
  });
  is('invite status', r.status, 201);
  is('Catalyst registerUser called once', registeredUsers.length, 1);
  is('environment ZAID passed to Catalyst', registeredUsers[0]?.signupConfig?.zaid, 'zaid-test-123');
  is('web signup platform selected', registeredUsers[0]?.signupConfig?.platform_type, 'web');
  is('invite email passed to Catalyst', registeredUsers[0]?.userConfig?.email_id, 'amara.silva@gallefacegroup.com');
  is('workspace row starts in invited state', r.body?.user?.Status, 'Invited');
  is('response confirms invitation delivery', r.body?.invitationSent, true);
  is('new Catalyst identity was not rolled back', deletedCatalystUsers.length, 0);
}
{
  const previousZaid = process.env.PROCUREFLOW_AUTH_ZAID;
  delete process.env.PROCUREFLOW_AUTH_ZAID;
  const r = await call('post', '/api/users', {
    body: { Email: 'not-configured@example.com', FullName: 'No Config', RoleID: 'r-hof', ProfileID: 'p1' }
  });
  is('missing ZAID is a clear service configuration error', r.status, 503);
  is('missing ZAID has a stable error code', r.body?.code, 'USER_INVITES_NOT_CONFIGURED');
  process.env.PROCUREFLOW_AUTH_ZAID = previousZaid;
}
{
  catalystExistingUsers = [{ user_id: 'cu-existing', email_id: 'existing@example.com' }];
  const before = registeredUsers.length;
  const r = await call('post', '/api/users', {
    body: { Email: 'existing@example.com', FullName: 'Existing User', RoleID: 'r-hof', ProfileID: 'p1' }
  });
  is('existing Catalyst account is linked', r.status, 201);
  is('existing Catalyst account receives no duplicate invitation', registeredUsers.length, before);
  is('link response is explicit', r.body?.linkedExisting, true);
  is('linked account starts active', r.body?.user?.Status, 'Active');
  catalystExistingUsers = [];
}
{
  const r = await call('post', '/api/users', {
    body: { Email: 'proc@gallefacegroup.com', FullName: 'Duplicate User', RoleID: 'r-hof', ProfileID: 'p1' }
  });
  is('duplicate workspace membership is refused', r.status, 409);
  is('duplicate membership has a stable error code', r.body?.code, 'USER_EXISTS');
}

console.log('-- GET /api/prs/:id/workflow --');
{
  const r = await call('get', '/api/prs/:id/workflow', { params: { id: 'pr1' } });
  is('status', r.status, 200);
  is('route chosen from budget class', r.body.workflow, 'budget_exceed');
  is('stage count', r.body.stages.length, 7);
  const cur = r.body.stages.find(s => s.state === 'current');
  is('current stage is the one on the record', cur?.seq, 2);
  is('current stage role resolved', cur?.role, 'Head of Finance');
  // The seat is filled by a real user, so the ladder must name them.
  is('holder named from Users', cur?.holder, 'K. Premaratne');
  const done = r.body.stages.filter(s => s.state === 'done').length;
  is('earlier stages marked done', done, 1);
}

console.log('-- PUT /api/users/:id protects the final administrator --');
{
  const r = await call('put', '/api/users/:id', {
    params: { id: 'u1' },
    body: { Status: 'Inactive' }
  });
  is('last active administrator cannot be deactivated', r.status, 409);
  is('admin lockout has a stable error code', r.body?.code, 'LAST_ADMIN_REQUIRED');
}

console.log('-- GET /api/analytics/group-matrix --');
{
  const r = await call('get', '/api/analytics/group-matrix');
  is('status', r.status, 200);
  // One property x four expenditure categories.
  is('rows = properties x expenditure categories', r.body.rows.length, 4);
  const capex = r.body.rows.find(x => x.expenditureCategory === 'Capex');
  is('PR counted under its expenditure category', capex.totalPRsYTD, 1);
  is('CapEx budget attached to the Capex row', capex.budget, 600000);
  // Pending at "Head of Finance" must land in the finance bucket.
  is('pending routed to the finance bucket', capex.pendingFinance, 1);
  is('cluster carried through', capex.cluster, 'Galle Face Hotel');
  // A pending requisition is not spend.
  is('pending PR is not counted as actual', capex.actual, 0);
  is('group totals present', r.body.totals.totalPRsYTD, 1);
}

console.log('-- correspondence --');
{
  const r = await call('get', '/api/correspondence/templates');
  is('template count', r.body.length, 6);
}
{
  const r = await call('post', '/api/correspondence/draft', {
    body: { template: 'rfq', rfqId: 'rfq1', vendorId: 'v1' }
  });
  is('status', r.status, 200);
  inc('subject merged with the RFQ number', r.body.subject, 'RFQ-1001');
  inc('supplier contact resolved', r.body.body, 'A. Perera');
  inc('company name resolved', r.body.body, 'Galle Face Group');
  inc('line items rendered from the PR', r.body.body, 'LED Par Can');
  inc('portal URL built from APP_ORIGIN', r.body.body, 'https://procurement.cloudhub.lk');
  is('recipient taken from the vendor contact', r.body.recipient, 'a.perera@lsl.lk');
}
{
  const r = await call('post', '/api/correspondence/draft', {
    body: { template: 'award_goods', rfqId: 'rfq1', bidId: 'b1', vendorId: 'v1' }
  });
  inc('award value taken from the winning bid', r.body.body, '450000.00');
  Array.isArray(r.body.missing) ? ok(`unresolved fields reported (${r.body.missing.length})`) : bad('missing[] absent', '');
}
{
  const r = await call('post', '/api/correspondence/draft', { body: {} });
  is('draft without a template is refused', r.status, 400);
}

console.log(`\npassed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
