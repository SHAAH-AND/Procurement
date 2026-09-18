// Walk a requisition along each of the three approval routes, stage by stage.
//
// The routing rules are the product. If a non-budgeted request can reach a
// purchase order without the Board, the customer's control model is broken and
// the software is worse than the spreadsheet it replaces.
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

const store = {};
let nextId = 2000;
const ins = (t, r) => { const x = { ROWID: String(++nextId), ...r }; (store[t] = store[t] || []).push(x); return x; };
function runZCQL(q) {
  const table = (q.match(/FROM\s+(\w+)/i) || [])[1];
  if (!table || !store[table]) return [];
  let out = store[table];
  for (const m of q.matchAll(/(\w+)\s*=\s*'([^']*)'/g)) out = out.filter(r => String(r[m[1]] ?? '') === m[2]);
  return out.map(r => ({ [table]: r }));
}
require.cache[require.resolve('zcatalyst-sdk-node')] = {
  id: 'zcatalyst-sdk-node', filename: 'zcatalyst-sdk-node', loaded: true, exports: {
    initialize: () => ({
      zcql: () => ({ executeZCQLQuery: async q => runZCQL(q) }),
      datastore: () => ({ table: (name) => ({
        insertRow: async r => ins(name, r), insertRows: async rs => rs.map(r => ins(name, r)),
        updateRow: async r => {
          const row = (store[name] || []).find(x => x.ROWID === String(r.ROWID));
          if (row) Object.assign(row, r);
          return row || r;
        },
        updateRows: async rs => rs, deleteRow: async () => ({})
      }) }),
      userManagement: () => ({ getCurrentUser: async () => ({ email_id: 'a@b.c', first_name: 'A', last_name: 'B', user_id: 'x' }) }),
      filestore: () => ({}), stratus: () => ({})
    })
  }
};
process.env.APP_ORIGIN = 'https://x';
const app = require(ROOT + '/index.js');
const stack = (app._router || app.router).stack;
const handlerFor = (m, p) => {
  for (const l of stack) if (l.route?.path === p && l.route.methods[m]) {
    const f = l.route.stack.map(s => s.handle); return f[f.length - 1];
  }
  return null;
};
async function call(method, path, { body = {}, params = {} } = {}) {
  const fn = handlerFor(method, path);
  if (!fn) throw new Error(`no handler ${method} ${path}`);
  const req = { method, path, body, params, query: {}, headers: {}, orgId: 'org1',
    workspace: store.Organizations[0],
    authUser: { email: 'a@b.c', firstName: 'A', lastName: 'B' },
    catalystApp: require('zcatalyst-sdk-node').initialize(), propertyScope: null };
  return await new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; },
      json(p) { resolve({ status: this.statusCode, body: p }); return this; },
      setHeader() { return this; }, end() { resolve({ status: this.statusCode, body: null }); } };
    Promise.resolve(fn(req, res)).catch(reject);
  });
}

// --- a workspace with every seat filled -----------------------------------
store.Organizations = [{ ROWID: 'org1', Name: 'Galle Face Group',
  Settings: JSON.stringify({ currency: 'LKR', multiProperty: true, approvalRules: { PR: 'Workflow' } }) }];
const ROLES = ['Head of the department', 'Head of Finance', 'General Manager', 'Purchasing Manager',
               'Central Procurement', 'Procurement Committee', 'VP operations / CEO', 'Board of Directors'];
store.Roles = ROLES.map((n, i) => ({ ROWID: `r${i}`, OrgID: 'org1', RoleName: n }));
store.Users = ROLES.map((n, i) => ({ ROWID: `u${i}`, OrgID: 'org1', RoleID: `r${i}`,
  Email: `${i}@gfg.lk`, FullName: n, Status: 'Active', ApprovalLimit: 0 }));
store.Properties = [{ ROWID: 'p1', OrgID: 'org1', Name: 'Galle Face Hotel Colombo', Cluster: 'Galle Face Hotel', Status: 'Active' }];
store.PropertyAssignments = [];

const roleOf = id => store.Roles.find(r => r.ROWID === store.Users.find(u => u.ROWID === id)?.RoleID)?.RoleName;

/** Raise a requisition and approve it repeatedly, recording who it lands on. */
async function walk(budgetClass) {
  const pr = ins('PRs', { OrgID: 'org1', PRNumber: 'PR-' + budgetClass, PropertyID: 'p1',
    Status: 'Pending_Approval', TotalAmount: 1000, ApprovalLevel: 2,
    CustomFieldsJson: JSON.stringify({ budgetClass }) });
  const seen = [];
  // Whoever holds stage 2 is the first approver.
  const wf = await call('get', '/api/prs/:id/workflow', { params: { id: pr.ROWID } });
  seen.push(wf.body.stages.find(s => s.state === 'current')?.role);
  for (let i = 0; i < 10; i++) {
    const r = await call('post', '/api/prs/:id/approve', { params: { id: pr.ROWID } });
    if (r.status !== 200) return { error: r.body, seen };
    const row = store.PRs.find(x => x.ROWID === pr.ROWID);
    if (row.Status === 'Approved') break;
    seen.push(roleOf(row.CurrentApproverID));
  }
  return { seen, final: store.PRs.find(x => x.ROWID === pr.ROWID).Status };
}

console.log('-- budgeted route --');
{
  const { seen, final } = await walk('budgeted');
  is('approval chain', seen.join(' > '),
     'Head of Finance > General Manager > Procurement Committee');
  is('ends approved', final, 'Approved');
}

console.log('-- non-budgeted route (must reach the Board) --');
{
  const { seen, final } = await walk('non_budgeted');
  is('approval chain', seen.join(' > '),
     'Head of Finance > General Manager > VP operations / CEO > Board of Directors');
  seen.includes('Board of Directors') ? ok('Board sign-off is mandatory') : bad('Board bypassed', seen.join(' > '));
  is('ends approved', final, 'Approved');
}

console.log('-- budget-exceed route (Committee then Board) --');
{
  const { seen, final } = await walk('budget_exceed');
  is('approval chain', seen.join(' > '),
     'Head of Finance > General Manager > Procurement Committee > Board of Directors');
  is('Board is last', seen[seen.length - 1], 'Board of Directors');
  is('ends approved', final, 'Approved');
}

console.log('-- a vacant seat parks the requisition, it does NOT auto-approve --');
{
  // Remove the Board; a non-budgeted request can then never complete.
  const saved = store.Users.slice();
  store.Users = store.Users.filter(u => roleOf(u.ROWID) !== 'Board of Directors');
  const pr = ins('PRs', { OrgID: 'org1', PRNumber: 'PR-vacant', PropertyID: 'p1',
    Status: 'Pending_Approval', TotalAmount: 1000, ApprovalLevel: 4,
    CustomFieldsJson: JSON.stringify({ budgetClass: 'non_budgeted' }) });
  const r = await call('post', '/api/prs/:id/approve', { params: { id: pr.ROWID } });
  const row = store.PRs.find(x => x.ROWID === pr.ROWID);
  is('stays pending', row.Status, 'Pending_Approval');
  is('no approver assigned', row.CurrentApproverID, null);
  is('caller is told the seat is empty', r.body.unassigned, true);
  is('and which role it is', r.body.nextRole, 'Board of Directors');
  store.Users = saved;
}

console.log('-- an already-approved requisition cannot be approved again --');
{
  const pr = ins('PRs', { OrgID: 'org1', PRNumber: 'PR-done', PropertyID: 'p1',
    Status: 'Approved', TotalAmount: 1000, CustomFieldsJson: '{}' });
  const r = await call('post', '/api/prs/:id/approve', { params: { id: pr.ROWID } });
  is('refused', r.status, 400);
}

console.log(`\npassed: ${pass}  failed: ${fail}`);
process.exitCode = fail ? 1 : 0;
