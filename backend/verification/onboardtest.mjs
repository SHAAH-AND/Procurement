// Drive the real /api/setup handler and inspect every row it writes.
//
// This is the path the customer sees first and the one nobody has run: the
// datastore is empty, so the next person to sign in gets this screen. If it
// seeds the wrong hierarchy the whole approval model is wrong from row one.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = REPO_ROOT + '/functions/procurement_api';
const require = createRequire(ROOT + '/index.js');

let pass = 0, fail = 0;
const ok = m => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m, d) => { console.log(`  FAIL  ${m}\n        ${d}`); fail++; };
const is = (m, got, want) => got === want ? ok(`${m} (${JSON.stringify(got)})`) : bad(m, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

// An empty datastore that records everything written to it.
const written = {};
let nextId = 1000;
const store = {};
function insert(table, row) {
  const r = { ROWID: String(++nextId), ...row };
  (store[table] = store[table] || []).push(r);
  (written[table] = written[table] || []).push(r);
  return r;
}
function runZCQL(q) {
  const table = (q.match(/FROM\s+(\w+)/i) || [])[1];
  if (!table || !store[table]) return [];
  let out = store[table];
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
      datastore: () => ({ table: (name) => ({
        insertRow: async r => insert(name, r),
        insertRows: async rs => rs.map(r => insert(name, r)),
        updateRow: async r => r, updateRows: async r => r, deleteRow: async () => ({})
      }) }),
      userManagement: () => ({ getCurrentUser: async () => ({ email_id: 'kanchana.premaratne@gallefacegroup.com', first_name: 'Kanchana', last_name: 'Premaratne', user_id: 'cu1' }) }),
      filestore: () => ({}), stratus: () => ({})
    })
  }
};

process.env.APP_ORIGIN = 'https://procurement.cloudhub.lk';
const app = require(ROOT + '/index.js');
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
async function call(method, path, body = {}) {
  const fn = handlerFor(method, path);
  if (!fn) throw new Error(`no handler for ${method} ${path}`);
  const req = {
    method: method.toUpperCase(), path, body, params: {}, query: {}, headers: {},
    authUser: { email: 'kanchana.premaratne@gallefacegroup.com', firstName: 'Kanchana', lastName: 'Premaratne' },
    catalystApp: require('zcatalyst-sdk-node').initialize(), propertyScope: null
  };
  return await new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, status(c) { this.statusCode = c; return this; },
      json(p) { resolve({ status: this.statusCode, body: p }); return this; },
      setHeader() { return this; }, end() { resolve({ status: this.statusCode, body: null }); }
    };
    Promise.resolve(fn(req, res)).catch(reject);
  });
}

console.log('-- first-run setup on an empty datastore --');
const r = await call('post', '/api/setup', {
  orgName: 'Galle Face Group', domain: 'gallefacegroup.com',
  adminName: 'Kanchana Premaratne', currency: 'LKR', country: 'Sri Lanka',
  fiscalYearStart: 'April', timezone: 'Asia/Colombo'
});
is('status', r.status, 201);
is('workspace named', written.Organizations?.[0]?.Name, 'Galle Face Group');

console.log('-- the approval hierarchy is seeded --');
const roles = written.Roles || [];
is('roles created', roles.length, 9);
for (const name of ['Board of Directors', 'VP operations / CEO', 'Procurement Committee',
                    'Central Procurement', 'General Manager', 'Head of Finance',
                    'Purchasing Manager', 'Head of the department', 'Administrator']) {
  roles.some(x => x.RoleName === name) ? ok(`role: ${name}`) : bad(`role missing: ${name}`, '');
}
// Administrator is an access level, not a rung — it must not be wired into the
// escalation chain, or "who is next?" walks into it.
const admin = roles.find(x => x.RoleName === 'Administrator');
const childOfAdmin = roles.filter(x => x.ReportsToRoleID === admin?.ROWID);
is('nothing reports to Administrator', childOfAdmin.length, 0);
// Every other role except the topmost should have a parent.
const ladder = roles.filter(x => x.RoleName !== 'Administrator');
const parentless = ladder.filter(x => !x.ReportsToRoleID);
is('exactly one role tops the ladder', parentless.length, 1);
is('the top of the ladder is the Board', parentless[0]?.RoleName, 'Board of Directors');

console.log('-- profiles --');
const profiles = written.Profiles || [];
is('profiles created', profiles.length, 3);
['Add / View / Edit', 'Add / View / Edit / Approve', 'Administrator']
  .forEach(n => profiles.some(p => p.ProfileName === n) ? ok(`profile: ${n}`) : bad(`profile missing: ${n}`, ''));

console.log('-- the 15 properties across 5 clusters --');
const props = written.Properties || [];
is('properties seeded', props.length, 15);
is('clusters represented', new Set(props.map(p => p.Cluster)).size, 5);
props.every(p => p.Cluster) ? ok('every property carries its cluster') : bad('a property has no cluster', '');
['Galle Face Hotel Colombo', 'Queens Hotel Kandy', 'EKHO Surf', 'Ambepussa', 'Sigiriya']
  .forEach(n => props.some(p => p.Name === n) ? ok(`property: ${n}`) : bad(`property missing: ${n}`, ''));

console.log('-- the admin user --');
const users = written.Users || [];
is('one user created', users.length, 1);
is('user is the authenticated caller', users[0]?.Email, 'kanchana.premaratne@gallefacegroup.com');
is('user gets the Administrator role', users[0]?.RoleID, admin?.ROWID);
is('user is active', users[0]?.Status, 'Active');

console.log('-- workspace settings carry the model --');
const settings = JSON.parse(written.Organizations[0].Settings);
is('currency', settings.currency, 'LKR');
is('multi-property on', settings.multiProperty, true);
is('approval rule is the role workflow', settings.approvalRules?.PR, 'Workflow');
is('classification stored', settings.classification?.length, 10);
is('expenditure categories', settings.expenditureCategories?.length, 4);
is('payment terms', settings.paymentTerms?.length, 8);
is('three approval routes', Object.keys(settings.workflows || {}).length, 3);

console.log('-- item custom fields --');
is('custom fields seeded', (written.CustomFields || []).length, 15);
(written.CustomFields || []).some(f => f.FieldName === 'Supplier Approval Status')
  ? ok('item approval status field present') : bad('missing field', '');

console.log('-- no invented catalogue --');
is('no sample items shipped', (written.Items || []).length, 0);

console.log('-- setup cannot run twice --');
{
  const again = await call('post', '/api/setup', { orgName: 'Someone Else' });
  is('second run refused', again.status, 409);
  is('with a named reason', again.body?.code, 'ALREADY_SET_UP');
}

console.log(`\npassed: ${pass}  failed: ${fail}`);
process.exitCode = fail ? 1 : 0;
