// Local stand-in for Catalyst, so the React client can be driven in a real
// browser without a hosted session:
//
//   /server/procurement_api/*   the REAL Express app (index.js) with the
//                               Catalyst SDK replaced by an in-memory store
//   /__catalyst/sdk/init.js     a shim for window.catalyst.auth
//
// Run `node verification/devserver.mjs` and, in another shell,
// `CATALYST_TARGET=http://127.0.0.1:3100 npm run dev` in frontend/.
// Sign-in state is toggled by the shim: ?asuser=<email> on the page, or the
// "Sign in" button the shim renders inside the embedded container.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = REPO_ROOT + '/functions/procurement_api';
const require = createRequire(ROOT + '/index.js');
const PORT = Number(process.env.PORT || 3100);
const SETUP_DONE = process.env.FRESH !== '1';

let seq = 1000;
const nextId = () => String(++seq);
const stamp = () => {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}:${String(d.getMilliseconds()).padStart(3, '0')}`;
};
const db = {
  Organizations: SETUP_DONE ? [{ ROWID: '1', Name: 'Galle Face Hotel', Status: 'Active', Settings: JSON.stringify({ currency: 'LKR', multiProperty: true }) }] : [],
  Users: SETUP_DONE ? [
    { ROWID: '10', OrgID: '1', Email: 'admin@gallefacehotel.com', FullName: 'Amali Perera', RoleID: '30', ProfileID: '20', Status: 'Active', ApprovalLimit: 100000, CREATEDTIME: stamp() },
    { ROWID: '11', OrgID: '1', Email: 'buyer@gallefacehotel.com', FullName: 'Kasun Silva', RoleID: '31', ProfileID: '21', Status: 'Active', ApprovalLimit: 0, CREATEDTIME: stamp() }
  ] : [],
  Profiles: SETUP_DONE ? [
    { ROWID: '20', OrgID: '1', ProfileName: 'Administrator', Permissions: '{"*":true}', Description: 'Full access' },
    { ROWID: '21', OrgID: '1', ProfileName: 'Add / View / Edit', Permissions: '{"view":true,"create":true,"edit":true}', Description: 'No approvals' },
    { ROWID: '22', OrgID: '1', ProfileName: 'Add / View / Edit / Approve', Permissions: '{"view":true,"create":true,"edit":true,"approve":true}', Description: 'Approver' }
  ] : [],
  Roles: SETUP_DONE ? [{ ROWID: '30', OrgID: '1', RoleName: 'Administrator' }, { ROWID: '31', OrgID: '1', RoleName: 'Head of the department' }] : [],
  Items: SETUP_DONE ? [{ ROWID: '40', OrgID: '1', Name: 'Bath towel', SKU: 'TW-01', Category: 'Housekeeping', Unit: 'PCS', UnitPrice: 1200, Description: '', CREATEDTIME: stamp() }] : [],
  Suppliers: SETUP_DONE ? [{ ROWID: '50', OrgID: '1', Name: 'Damro', ContactEmail: 'sales@damro.lk', Phone: '011', Address: 'Colombo', Status: 'Active', CustomFieldsJson: '{"Payment Terms":"Net 30"}', Rating: 5, CREATEDTIME: stamp() }] : [],
  Properties: SETUP_DONE ? [{ ROWID: '60', OrgID: '1', Name: 'Galle Face Hotel Colombo', Location: 'Colombo', Cluster: 'GFH', Status: 'Active' }] : [],
  PropertyAssignments: [], AuditLog: [], V1Docs: [], V1Lines: [], Budgets: [], BudgetPeriods: [], CustomFields: [], ApprovalHistory: [], SignupRequests: []
};

function parseWhere(where) {
  const conds = [];
  const re = /(\w+)\s*(=|IN|>=|>|<=|<|IS NULL|IS NOT NULL)\s*(?:'((?:[^']|'')*)'|\(([^)]*)\)|(-?\d+(?:\.\d+)?))?/g;
  for (const m of where.matchAll(re)) {
    const [, col, op, str, list, num] = m;
    if (op === 'IN') conds.push({ col, op, vals: [...list.matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")) });
    else if (op === '=') conds.push({ col, op, val: str !== undefined ? str.replace(/''/g, "'") : num });
    else conds.push({ col, op, val: num !== undefined ? Number(num) : str });
  }
  return conds;
}
function runZCQL(q) {
  const table = (q.match(/FROM\s+(\w+)/i) || [])[1];
  if (!table) throw new Error(`Bad query: ${q}`);
  if (!db[table]) db[table] = [];
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
  if (!db[name]) db[name] = [];
  return {
    insertRow: async r => { const row = { ...r, ROWID: nextId(), CREATEDTIME: stamp(), MODIFIEDTIME: stamp() }; db[name].push(row); return { ...row }; },
    insertRows: async rs => Promise.all(rs.map(r => tableApi(name).insertRow(r))),
    updateRow: async r => { const row = db[name].find(x => String(x.ROWID) === String(r.ROWID)); if (!row) throw new Error('no row'); Object.assign(row, r, { MODIFIEDTIME: stamp() }); return { ...row }; },
    updateRows: async rs => Promise.all(rs.map(r => tableApi(name).updateRow(r))),
    deleteRow: async id => { const i = db[name].findIndex(x => String(x.ROWID) === String(id)); if (i >= 0) db[name].splice(i, 1); return {}; }
  };
}

// The shim tells us who is "signed in" through a cookie.
let sessions = new Map();
require.cache[require.resolve('zcatalyst-sdk-node')] = {
  id: 'zcatalyst-sdk-node', filename: 'zcatalyst-sdk-node', loaded: true, exports: {
    initialize: (req) => ({
      zcql: () => ({ executeZCQLQuery: async q => runZCQL(q) }),
      datastore: () => ({ table: tableApi }),
      userManagement: () => ({
        getCurrentUser: async () => {
          const email = (req && req.headers && req.headers.authorization) || '';
          if (!email || !sessions.has(email)) throw new Error('no session');
          const [first, last] = (sessions.get(email) || 'Test User').split(' ');
          return { email_id: email, first_name: first || 'Test', last_name: last || 'User', user_id: 'cu-' + email };
        },
        getAllUsers: async () => [], registerUser: async (c, u) => ({ user_id: 'cu-new', ...u }), deleteUser: async () => ({})
      }),
      filestore: () => ({}), stratus: () => ({})
    })
  }
};
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.PROCUREFLOW_AUTH_ZAID = 'zaid-dev';
process.env.SETUP_ALLOWED_EMAILS = '';
const app = require(ROOT + '/index.js');

const SHIM = `
(function () {
  var KEY = 'pf-dev-session';
  var current = localStorage.getItem(KEY) || '';
  var q = new URLSearchParams(location.search);
  if (q.get('asuser')) { current = q.get('asuser'); localStorage.setItem(KEY, current); }
  function token() { return current; }
  var auth = {
    isUserAuthenticated: function () {
      return current ? Promise.resolve({ content: { email_id: current, first_name: current.split('@')[0], last_name: '' } }) : Promise.reject(new Error('not signed in'));
    },
    generateAuthToken: function () { return Promise.resolve({ access_token: token() }); },
    signIn: function (id) {
      var el = document.getElementById(id);
      if (!el) return Promise.reject(new Error('no container'));
      el.innerHTML = '<div style="padding:24px;font:14px system-ui"><div style="font-weight:700;margin-bottom:8px">Dev sign-in (shim)</div>' +
        '<input id="pf-dev-email" placeholder="email" value="admin@gallefacehotel.com" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:8px">' +
        '<button id="pf-dev-go" style="padding:8px 14px;border-radius:8px;background:#2084FA;color:#fff;border:0">Sign in</button></div>';
      document.getElementById('pf-dev-go').onclick = function () {
        localStorage.setItem(KEY, document.getElementById('pf-dev-email').value.trim());
        location.href = location.origin + '/app/';
      };
      return Promise.resolve();
    },
    signOut: function (redirect) { localStorage.removeItem(KEY); location.href = redirect || '/'; }
  };
  // The real SDK may install window.catalyst after this script (or as a
  // non-writable property); keep re-asserting the shim briefly.
  function install() {
    try { Object.defineProperty(window, 'catalyst', { value: { auth: auth, __shim: true }, configurable: true, writable: true }); }
    catch (e) { window.catalyst = { auth: auth, __shim: true }; }
  }
  install();
  var n = 0; var t = setInterval(function () { if (!window.catalyst || !window.catalyst.__shim) install(); if (++n > 40) clearInterval(t); }, 50);
})();`;

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/__catalyst/sdk/init.js')) {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end(SHIM);
  }
  if (req.url.startsWith('/__catalyst/auth/login')) {
    res.writeHead(302, { Location: '/app/#/signin' });
    return res.end();
  }
  if (req.url.startsWith('/server/procurement_api')) {
    const email = String(req.headers.authorization || '').trim();
    if (email && email.includes('@') && !sessions.has(email)) sessions.set(email, email.split('@')[0]);
    req.url = req.url.replace('/server/procurement_api', '');
    req.headers.host = 'localhost:' + PORT;
    return app(req, res);
  }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT, () => console.log(`dev catalyst stand-in on http://127.0.0.1:${PORT}  (setup ${SETUP_DONE ? 'done' : 'REQUIRED'})`));
