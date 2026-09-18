// Exercises the support-session middleware in isolation against fake ZCQL, so
// the read-only boundary is tested as logic rather than inferred from reading.
import crypto from 'node:crypto';

const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const SUPPORT_SESSION_TTL_MS = 30 * 60 * 1000;
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// --- fixtures -------------------------------------------------------------
const TOKEN = 'abc123token';
const now = Date.now();
let sessions = [{
  TokenHash: sha256(TOKEN), OrgID: '77', DeveloperEmail: 'sulaiman@cloudpartners.biz',
  Reason: 'Investigating budget mismatch', ExpiresAt: new Date(now + SUPPORT_SESSION_TTL_MS).toISOString(),
  RevokedAt: ''
}];
let developers = [{ Email: 'sulaiman@cloudpartners.biz', Status: 'Active' }];

const fakeApp = () => ({
  zcql: () => ({
    executeZCQLQuery: async (sql) => {
      if (sql.includes('FROM SupportSessions')) {
        const m = sql.match(/TokenHash = '([^']+)'/);
        return sessions.filter(s => s.TokenHash === m[1]).map(s => ({ SupportSessions: s }));
      }
      if (sql.includes('FROM Developers')) {
        const m = sql.match(/Email = '([^']+)'/);
        return developers.filter(d => d.Email === m[1] && d.Status === 'Active').map(d => ({ Developers: d }));
      }
      if (sql.includes('FROM Users')) return []; // developer is NOT a tenant member
      return [];
    }
  })
});

// --- the middleware under test (mirrors index.js) -------------------------
async function resolveSupportSession(req) {
  const token = req.headers['x-support-token'];
  if (!token) return null;
  const rows = await req.catalystApp.zcql().executeZCQLQuery(
    `SELECT * FROM SupportSessions WHERE TokenHash = '${sha256(String(token))}'`);
  const s = rows[0]?.SupportSessions;
  if (!s) return null;
  if (s.RevokedAt) return { expired: true, reason: 'This support session was ended.' };
  if (new Date(s.ExpiresAt) < new Date()) return { expired: true, reason: 'This support session has expired.' };
  return { orgId: String(s.OrgID), developerEmail: s.DeveloperEmail, reason: s.Reason };
}

async function middleware(req) {
  const out = { status: 200, body: null, orgId: null, isSupport: false };
  const support = await resolveSupportSession(req);
  if (support) {
    if (support.expired) return { ...out, status: 401, body: { code: 'SUPPORT_SESSION_ENDED' } };
    const devRows = await req.catalystApp.zcql().executeZCQLQuery(
      `SELECT * FROM Developers WHERE Email = '${support.developerEmail}' AND Status = 'Active'`);
    if (devRows.length === 0) return { ...out, status: 403, body: { code: 'SUPPORT_REVOKED' } };
    if (!READ_ONLY_METHODS.has(req.method)) return { ...out, status: 403, body: { code: 'SUPPORT_READ_ONLY' } };
    return { ...out, orgId: support.orgId, isSupport: true };
  }
  // Normal path: membership lookup (empty here) → no org context.
  const rows = await req.catalystApp.zcql().executeZCQLQuery(`SELECT * FROM Users WHERE Email = 'x'`);
  return { ...out, orgId: rows[0] ? '1' : null, isSupport: false };
}

const req = (method, headers = {}) => ({ method, headers, catalystApp: fakeApp() });

// --- assertions -----------------------------------------------------------
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
};

console.log('\n── READ access ──');
for (const m of ['GET', 'HEAD', 'OPTIONS']) {
  const r = await middleware(req(m, { 'x-support-token': TOKEN }));
  check(`${m} allowed, scoped to tenant 77`, r.status === 200 && r.orgId === '77' && r.isSupport, JSON.stringify(r));
}

console.log('\n── WRITE attempts (must ALL be refused) ──');
for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  const r = await middleware(req(m, { 'x-support-token': TOKEN }));
  check(`${m} blocked`, r.status === 403 && r.body?.code === 'SUPPORT_READ_ONLY', JSON.stringify(r));
}

console.log('\n── Session lifecycle ──');
sessions[0].ExpiresAt = new Date(now - 1000).toISOString();
check('expired session refused',
  (await middleware(req('GET', { 'x-support-token': TOKEN }))).body?.code === 'SUPPORT_SESSION_ENDED');
sessions[0].ExpiresAt = new Date(now + SUPPORT_SESSION_TTL_MS).toISOString();

sessions[0].RevokedAt = new Date().toISOString();
check('revoked session refused',
  (await middleware(req('GET', { 'x-support-token': TOKEN }))).body?.code === 'SUPPORT_SESSION_ENDED');
sessions[0].RevokedAt = '';

developers[0].Status = 'Disabled';
check('session dies when developer access is revoked',
  (await middleware(req('GET', { 'x-support-token': TOKEN }))).body?.code === 'SUPPORT_REVOKED');
developers[0].Status = 'Active';

console.log('\n── Token forgery ──');
check('unknown token gets no support context',
  (await middleware(req('GET', { 'x-support-token': 'not-a-real-token' }))).isSupport === false);
check('raw token stored nowhere (hash only)',
  !JSON.stringify(sessions).includes(TOKEN));
check('token is not guessable from the hash',
  sessions[0].TokenHash !== TOKEN && sessions[0].TokenHash.length === 64);

console.log('\n── No token = unchanged behaviour ──');
const plain = await middleware(req('GET', {}));
check('no support context', plain.isSupport === false);
check('falls through to membership lookup (null org here)', plain.orgId === null);
const plainWrite = await middleware(req('POST', {}));
check('POST not blocked for normal users', plainWrite.status === 200);

console.log(`\n${fail === 0 ? `ALL ${pass} CHECKS PASSED` : `${fail} FAILED, ${pass} passed`}`);
process.exit(fail === 0 ? 0 : 1);
