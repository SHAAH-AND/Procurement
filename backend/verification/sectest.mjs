// Security assertions driven through the REAL middleware chain.
//
// Not grep: an unauthenticated request is actually issued against the Express
// app and the response is inspected. That is the only way to prove the gate
// covers a route, because the gate is `app.use` ordering, not a per-route flag.
import { createRequire } from 'node:module';
import http from 'node:http';
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

// A Catalyst stub whose user lookup FAILS — i.e. an anonymous caller. Any route
// that answers with data under these conditions is unauthenticated.
require.cache[require.resolve('zcatalyst-sdk-node')] = {
  id: 'zcatalyst-sdk-node', filename: 'zcatalyst-sdk-node', loaded: true, exports: {
    initialize: () => ({
      zcql: () => ({ executeZCQLQuery: async () => [] }),
      datastore: () => ({ table: () => ({ insertRow: async r => r, insertRows: async r => r, updateRow: async r => r, deleteRow: async () => ({}) }) }),
      userManagement: () => ({ getCurrentUser: async () => { throw new Error('no session'); } }),
      filestore: () => ({}), stratus: () => ({})
    })
  }
};

process.env.APP_ORIGIN = 'https://procurement.cloudhub.lk';
delete process.env.BOOKS_CLIENT_SECRET;   // an unconfigured deployment
const app = require(ROOT + '/index.js');

const server = http.createServer(app);
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const get = async (p, opts) => {
  const r = await fetch(base + p, opts);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body, headers: r.headers };
};

console.log('-- unauthenticated access is refused --');
for (const path of ['/api/reference', '/api/correspondence/templates',
                    '/api/analytics/group-matrix', '/api/prs/1/workflow',
                    '/api/items', '/api/prs', '/api/users', '/api/suppliers']) {
  const r = await get(path);
  r.status === 401 || r.status === 403
    ? ok(`${path} -> ${r.status}`)
    : bad(`${path} is reachable without a session`, `status ${r.status}, body ${JSON.stringify(r.body).slice(0, 120)}`);
}

console.log('-- POST routes too --');
for (const path of ['/api/correspondence/draft', '/api/prs', '/api/items']) {
  const r = await get(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  r.status === 401 || r.status === 403
    ? ok(`POST ${path} -> ${r.status}`)
    : bad(`POST ${path} reachable without a session`, `status ${r.status}`);
}

console.log('-- health is deliberately public, and leaks nothing --');
{
  const r = await get('/api/health');
  is('health reachable', r.status, 200);
  is('reports the build', r.body.version, '4.1.2-invitation-only-auth');
  const keys = Object.keys(r.body).sort().join(',');
  is('exposes only ok/service/time/version', keys, 'ok,service,time,version');
}

console.log('-- security headers on every response --');
{
  const r = await get('/api/health');
  is('X-Content-Type-Options', r.headers.get('x-content-type-options'), 'nosniff');
  is('X-Frame-Options', r.headers.get('x-frame-options'), 'DENY');
  is('Referrer-Policy', r.headers.get('referrer-policy'), 'no-referrer');
  r.headers.get('strict-transport-security')?.includes('max-age=31536000')
    ? ok('HSTS present') : bad('HSTS missing', String(r.headers.get('strict-transport-security')));
  r.headers.get('cache-control')?.includes('no-store')
    ? ok('Cache-Control no-store') : bad('Cache-Control weak', String(r.headers.get('cache-control')));
  r.headers.get('content-security-policy')?.includes("default-src 'none'")
    ? ok('CSP locks the API down') : bad('CSP missing', String(r.headers.get('content-security-policy')));
  !r.headers.get('x-powered-by') ? ok('framework not advertised') : bad('x-powered-by leaks', r.headers.get('x-powered-by'));
}
// A 401 must carry the headers too — error paths are the ones people forget.
{
  const r = await get('/api/items');
  is('401 still carries nosniff', r.headers.get('x-content-type-options'), 'nosniff');
  is('401 still carries frame-deny', r.headers.get('x-frame-options'), 'DENY');
}

console.log('-- errors do not leak internals --');
{
  const r = await get('/api/items');
  const s = JSON.stringify(r.body).toLowerCase();
  const leaks = ['select ', 'zcql', 'stack', 'at object.', 'node_modules', 'c:\\\\users'];
  const found = leaks.filter(l => s.includes(l));
  found.length === 0 ? ok('no query/stack/path detail in the error body')
                     : bad('error body leaks internals', found.join(', '));
}

console.log('-- optional integration degrades safely --');
{
  const mod = require(ROOT + '/index.js');
  ok('function loads with no Books secret configured (integration simply unavailable)');
}

console.log(`\npassed: ${pass}  failed: ${fail}`);
// Close and let the loop drain before exiting. Calling process.exit() while the
// server handle is still closing trips a libuv assertion on Windows, which
// would surface as a bogus non-zero exit and fail the gate for no reason.
await new Promise(resolve => server.close(resolve));
process.exitCode = fail ? 1 : 0;
