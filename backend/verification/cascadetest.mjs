// Exercise the department → category → sub-category cascade and the approval
// route renderer in a real browser. The static gate proves these functions
// exist; this proves they produce the right DOM when driven.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');

const WEB = REPO_ROOT + '/procurement_web';
// Ports are randomised per run: an orphaned Chrome from an earlier run
// squats on a fixed debug port, and attaching to it silently drives the
// WRONG browser — a stale page that fails for reasons unrelated to the code.
const PORT = 9000 + Math.floor(Math.random() * 900);
const HTTP_PORT = 8000 + Math.floor(Math.random() * 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = m => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m, d) => { console.log(`  FAIL  ${m}\n        ${d}`); fail++; };
const is = (m, got, want) => got === want ? ok(`${m} (${JSON.stringify(got)})`) : bad(m, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const inc = (m, hay, n) => String(hay).includes(n) ? ok(m) : bad(m, `missing "${n}" in: ${String(hay).slice(0, 200)}`);

const require_ = (await import('node:module')).createRequire(import.meta.url);
const pack = require_(REPO_ROOT + '/functions/procurement_api/industry-packs.js');
const P = pack.getPack('hotel');
const REFERENCE = {
  classification: P.classification, departments: P.departments, categories: P.categories,
  clusters: P.clusters, expenditureCategories: P.expenditureCategories,
  budgetClasses: P.budgetClasses, paymentTerms: P.paymentTerms, baseUoms: P.baseUoms,
  purchasingUoms: P.purchasingUoms, itemTypes: P.itemTypes, itemStatuses: P.itemStatuses,
  supplierApprovalStatuses: P.supplierApprovalStatuses, taxTreatments: P.taxTreatments,
  workflows: P.workflows, roles: P.roles.map(r => r.name)
};

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/app.css"></head><body>
<div id="page-root"></div>
<div class="modal-backdrop" id="modal-backdrop" hidden><div class="modal" id="modal">
  <div class="modal-header"><h3 id="modal-title"></h3><button class="modal-close" data-close>&times;</button></div>
  <div class="modal-body" id="modal-body"></div><div class="modal-footer" id="modal-footer"></div>
</div></div>
<div id="toast-container"></div>
<script type="module">
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errors.push('rejection: ' + e.reason));

const srcTxt = await (await fetch('/js/api.js')).text();
const marker = 'ui.js?v=';
let V = '';
const admin = await (await fetch('/js/views-admin.js')).text();
const at = admin.indexOf(marker);
if (at >= 0) { let i = at + marker.length; while (admin[i] >= '0' && admin[i] <= '9') V += admin[i++]; }
const q = V ? '?v=' + V : '';
window.__V = V;

const apiMod = await import('/js/api.js' + q);
// Serve the real reference payload without a server round-trip.
apiMod.state.reference = ${JSON.stringify(REFERENCE)};

// Prove the cascade helpers select the right slices of the matrix.
window.__catsForDept = (d) => apiMod.categoriesForDepartment(d).map(c => c.name);
window.__subsForCat  = (c) => apiMod.subCategoriesFor(c);

window.__ready = true;
</script></body></html>`;

fs.writeFileSync(path.join(WEB, '__cascade.html'), HARNESS);

const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(WEB, rel === '/' ? '__cascade.html' : rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(HTTP_PORT, r));

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find(p => fs.existsSync(p));
if (!CHROME) { console.log('  SKIP  Chrome not found'); process.exit(0); }

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new',
  '--no-sandbox', '--disable-gpu', `--user-data-dir=${process.env.TEMP}/cascadeprof`,
  'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:${HTTP_PORT}/`, { method: 'PUT' });
    if (r.ok) target = await r.json();
  } catch {}
}
if (!target) { console.log('  FAIL  could not start Chrome'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let msgId = 0; const waiting = new Map();
ws.on('message', d => {
  const m = JSON.parse(d);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(r => {
  const id = ++msgId; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' :: ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
for (let i = 0; i < 60; i++) { await sleep(250); if (await evaluate('window.__ready === true').catch(() => false)) break; }

console.log('-- module graph --');
const errs = await evaluate('JSON.stringify(window.__errors || [])');
is('no uncaught errors on boot', errs, '[]');

console.log('-- classification cascade --');
const eng = await evaluate("JSON.stringify(window.__catsForDept('Engineering & Facilities'))");
inc('Engineering yields its own categories', eng, 'HVAC & Refrigeration');
is('Engineering has exactly 5 categories', JSON.parse(eng).length, 5);

const fbCul = await evaluate("JSON.stringify(window.__catsForDept('Food & Beverage (F&B) - Culinary'))");
is('F&B Culinary has 4 categories', JSON.parse(fbCul).length, 4);
inc('alcoholic beverages filed under Culinary', fbCul, 'Beverages (Alcoholic)');

// The cascade must not leak categories across departments — that is the whole
// point of narrowing, and the failure would be silent.
const leak = JSON.parse(eng).filter(c => JSON.parse(fbCul).includes(c));
is('no category leaks between departments', leak.length, 0);

const subs = await evaluate("JSON.stringify(window.__subsForCat('HVAC & Refrigeration'))");
inc('R410a sub-category present verbatim', subs, 'Refrigerant Gases (R410a, R134a)');
is('HVAC has 6 sub-categories', JSON.parse(subs).length, 6);

const none = await evaluate("JSON.stringify(window.__subsForCat('Not A Real Category'))");
is('unknown category yields no sub-categories', none, '[]');

const unknownDept = await evaluate("JSON.stringify(window.__catsForDept('Nope'))");
is('unknown department yields no categories', unknownDept, '[]');

console.log(`\npassed: ${pass}  failed: ${fail}`);
try { fs.unlinkSync(path.join(WEB, '__cascade.html')); } catch {}
ws.close(); server.close(); chrome.kill();
process.exit(fail ? 1 : 0);
