// Renders the new item picker and record view in a real Chrome against a stub
// API, so the modules are exercised rather than merely parsed. Static checks
// caught nothing in the last three bugs I shipped; this one runs the code.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');

const S = path.dirname(new URL(import.meta.url).pathname).replace(/^\//, '');
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
const is = (m, got, want) => got === want ? ok(m) : bad(m, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
const inc = (m, hay, n) => String(hay).includes(n) ? ok(m) : bad(m, `missing "${n}"`);
const gt = (m, got, min) => got > min ? ok(m) : bad(m, `expected > ${min}, got ${got}`);

// ---- a page that boots the modules with a stubbed api.js -------------------
const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/app.css">
</head><body>
<div id="page-root"></div>
<div class="modal-backdrop" id="modal-backdrop" hidden>
  <div class="modal" id="modal">
    <div class="modal-header"><h3 id="modal-title"></h3><button class="modal-close" data-close>&times;</button></div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-footer" id="modal-footer"></div>
  </div>
</div>
<div id="toast-container"></div>
<script type="module">
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => window.__errors.push('rejection: ' + e.reason));

  // A different ?v= is a different module URL, hence a DIFFERENT module
  // instance — populate the wrong one and the picker reads an empty catalogue.
  // No regex here on purpose: this lives inside a template literal, where
  // backslash escapes are eaten before the browser ever sees them.
  const srcTxt = await (await fetch('/js/itempicker.js')).text();
  const marker = 'api.js?v=';
  const at = srcTxt.indexOf(marker);
  let V = '';
  if (at >= 0) { let i = at + marker.length; while (srcTxt[i] >= '0' && srcTxt[i] <= '9') V += srcTxt[i++]; }
  const q = V ? '?v=' + V : '';
  window.__V = V;
  const { state } = await import('/js/api.js' + q);
  state.cache.items = [
    { ROWID:'1', Name:'Bath Towels (dozen)', SKU:'HK-001', Description:'600gsm cotton, white, for guest rooms and pool.', UnitPrice:42, Category:'Housekeeping', Unit:'dozen', ExpenseType:'OpEx', ItemType:'Goods', PreferredVendorID:'v1', CustomFieldsJson:'{"Par Level":120,"Perishable":false}' },
    { ROWID:'2', Name:'Commercial Blender', SKU:'KE-001', Description:'2.5L, 1800W, for the main kitchen.', UnitPrice:620, Category:'Kitchen Equipment', Unit:'unit', ExpenseType:'CapEx', ItemType:'Goods' },
    { ROWID:'3', Name:'Bottled Water 500ml', SKU:'FB-001', Description:'Case of 24.', UnitPrice:8.5, Category:'Food & Beverage', Unit:'case', ExpenseType:'OpEx', CustomFieldsJson:'{"Perishable":true,"Par Level":300}' },
    { ROWID:'4', Name:'Pool Chlorine Tablets', SKU:'EN-004', Description:'', UnitPrice:95, Category:'Engineering & Maintenance', Unit:'bucket', ExpenseType:'OpEx' }
  ];
  state.cache.suppliers = [{ ROWID:'v1', Name:'Lanka Linen Supplies' }];
  state.orgSettings = { currency:'USD', categories:[{name:'Housekeeping',expense:'OpEx'},{name:'Kitchen Equipment',expense:'CapEx'}] };

  const ip = await import('/js/itempicker.js' + q);
  const rv = await import('/js/recordview.js' + q);
  window.__ip = ip; window.__rv = rv; window.__state = state;

  // A line-items table exactly like the PR form builds.
  const host = document.createElement('table');
  host.innerHTML = '<tbody id="lines"><tr><td>' + ip.itemTriggerHTML() + '</td><td><input class="l-price"><input class="l-expense"></td></tr></tbody>';
  document.body.appendChild(host);
  window.__picked = null;
  ip.wireItemPickers(document.getElementById('lines'), (btn, item) => { window.__picked = { id: btn.value, price: btn.dataset.price, expense: btn.dataset.expense, name: item.Name }; });
  window.__ready = true;
<\/script>
</body></html>`;

fs.writeFileSync(`${WEB}/__uitest.html`, HARNESS);

// static file server over the real procurement_web directory
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = `${WEB}${path === '/' ? '/__uitest.html' : path}`;
  // The browser asks for /favicon.ico on its own; answer it so the automatic
  // request does not read as an application error.
  if (path === '/favicon.ico') { res.writeHead(200, {'Content-Type':'image/svg+xml'}); return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>'); }
  fs.readFile(file, (err, buf) => {
    if (err) { console.log(`        [404] ${path}`); res.writeHead(404); return res.end('nope'); }
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(HTTP_PORT);

const prof = fs.mkdtempSync('C:/Users/MK/AppData/Local/Temp/uitest-');
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu', '--no-sandbox',
   `--user-data-dir=${prof}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

const put = u => new Promise((res, rej) => { const U = new URL(u);
  const q = http.request({ hostname:U.hostname, port:U.port, path:U.pathname+U.search, method:'PUT' },
    r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d));}catch{rej(new Error(d));} }); });
  q.on('error', rej); q.end(); });
const getj = u => new Promise((res, rej) => { http.get(u, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error', rej); });
for (let i=0;i<60;i++){ try { await getj(`http://localhost:${PORT}/json/list`); break; } catch { await sleep(250); } }

const t = await put(`http://localhost:${PORT}/json/new?about:blank`);
const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 512e6 });
await new Promise(r => ws.on('open', r));
let id=0; const pending=new Map(); const consoleErrors=[];
ws.on('message', R => {
  const m = JSON.parse(R.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Log.entryAdded' && m.params.entry?.level === 'error') consoleErrors.push(m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(String(m.params.exceptionDetails?.text || m.params.exceptionDetails?.exception?.description));
});
const send=(m,p={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true}))?.result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:`http://127.0.0.1:${HTTP_PORT}/`});
for (let i=0;i<40 && !(await ev('window.__ready'));i++) await sleep(250);

console.log('═══ 1. Item picker ═══');
is('modules loaded without error', await ev('window.__ready'), true);
inc('trigger renders the empty state', await ev(`document.querySelector('.itempick').textContent`), 'Select an item');

await ev(`document.querySelector('.itempick').click()`);
await sleep(400);
is('clicking the trigger opens the picker', await ev(`document.getElementById('modal-backdrop').classList.contains('open')`), true);
gt('every catalogue item is listed', await ev(`document.querySelectorAll('.ip-row').length`), 3);
inc('the description is shown, not just the name', await ev(`document.querySelector('.ip-row').textContent`), '600gsm cotton');
inc('the unit is shown with the price', await ev(`document.querySelector('.ip-row .ip-price').textContent`), 'per dozen');
inc('the preferred vendor is shown', await ev(`document.querySelector('.ip-row').textContent`), 'Lanka Linen');
inc('the par level is shown', await ev(`document.querySelector('.ip-row').textContent`), 'Par 120');
is('CapEx items are tagged as such', await ev(`[...document.querySelectorAll('.ip-tag-capex')].length > 0`), true);
is('perishable stock is flagged', await ev(`document.body.textContent.includes('Perishable')`), true);

console.log('\n═══ 2. Search ═══');
await ev(`(()=>{const q=document.getElementById('ip-q'); q.value='blender'; q.dispatchEvent(new Event('input')); return 1})()`);
await sleep(200);
is('typing filters the list', await ev(`document.querySelectorAll('.ip-row').length`), 1);
inc('and finds the right item', await ev(`document.querySelector('.ip-row').textContent`), 'Commercial Blender');
await ev(`(()=>{const q=document.getElementById('ip-q'); q.value='kitchen'; q.dispatchEvent(new Event('input')); return 1})()`);
await sleep(200);
is('search covers the description too', await ev(`document.querySelectorAll('.ip-row').length`), 1);
await ev(`(()=>{const q=document.getElementById('ip-q'); q.value='zzzz'; q.dispatchEvent(new Event('input')); return 1})()`);
await sleep(200);
inc('a search with no hits says so', await ev(`document.querySelector('.ip-list').textContent`), 'Nothing matches');
await ev(`(()=>{const q=document.getElementById('ip-q'); q.value=''; q.dispatchEvent(new Event('input')); return 1})()`);
await sleep(200);

console.log('\n═══ 3. Choosing ═══');
await ev(`document.querySelectorAll('.ip-row')[1].click()`);
await sleep(400);
is('the picker closes on choose', await ev(`!document.getElementById('modal-backdrop').classList.contains('open')`), true);
const picked = await ev('JSON.stringify(window.__picked)');
inc('the callback receives the item', picked, 'Commercial Blender');
inc('the trigger carries the id', picked, '"id":"2"');
inc('the price came across for the line total', picked, '"price":"620"');
inc('the expense type came across', picked, '"expense":"CapEx"');
inc('the trigger now shows the item', await ev(`document.querySelector('.itempick').textContent`), 'Commercial Blender');
inc('and its unit and category', await ev(`document.querySelector('.itempick').textContent`), 'per unit');

console.log('\n═══ 4. Record view ═══');
await ev(`window.__rv.openRecord({
  number:'PR-00042', status:'Pending_Approval', subtitle:'Purchase request',
  summary:{label:'Total', value:'$1,240.00'},
  actions:[{label:'Print', onClick:()=>{window.__printed=true;}}],
  tabs:[
    { id:'details', label:'Details', render:(el)=>{ el.innerHTML = window.__rv.factsHTML([['Department','Food & Beverage'],['Property','Beach Resort'],['Empty','']]); } },
    { id:'lines', label:'Line items', count:2, render:(el)=>{ el.innerHTML = window.__rv.linesHTML(
        [{key:'n',label:'Item'},{key:'q',label:'Qty',num:true}],
        [{n:'Bath Towels',q:12},{n:'Bottled Water',q:40}],
        [['Total','$1,240.00',true]]); } },
    { id:'approvals', label:'Approvals', render:(el)=>{ el.innerHTML = window.__rv.timelineHTML([
        {title:'Submitted', who:'nimal@hotel.lk', when:'2 Aug', tone:'neutral'},
        {title:'Approved', who:'gm@hotel.lk', when:'3 Aug', tone:'good', note:'Within budget.'}]); } }
  ]
})`);
await sleep(500);
inc('the record number is shown', await ev(`document.querySelector('.rv-no')?.textContent`), 'PR-00042');
inc('the status renders as a badge', await ev(`document.querySelector('.rv-bar')?.textContent`), 'Pending');
inc('the headline figure is shown', await ev(`document.querySelector('.rv-sum-v')?.textContent`), '1,240');
is('all three tabs render', await ev(`document.querySelectorAll('.rv-tab').length`), 3);
is('the line-item count shows on the tab', await ev(`document.querySelector('[data-tab=lines] em')?.textContent`), '2');
inc('the first tab is open by default', await ev(`document.querySelector('.rv-panel')?.textContent`), 'Food & Beverage');
is('empty facts are dropped, not shown as a dash', await ev(`document.querySelector('.rv-panel')?.textContent.includes('Empty')`), false);

await ev(`document.querySelector('[data-tab=lines]').click()`);
await sleep(300);
inc('switching tabs renders the line items', await ev(`document.querySelector('.rv-panel')?.textContent`), 'Bath Towels');
inc('with a totals row', await ev(`document.querySelector('.rv-table tfoot')?.textContent`), '1,240');

await ev(`document.querySelector('[data-tab=approvals]').click()`);
await sleep(300);
is('the approvals timeline renders both events', await ev(`document.querySelectorAll('.rv-ev').length`), 2);
inc('an approval note is shown', await ev(`document.querySelector('.rv-panel')?.textContent`), 'Within budget');
is('the approved step is toned green', await ev(`!!document.querySelector('.rv-ev-good')`), true);

await ev(`document.querySelector('[data-rec-action="0"]').click()`);
await sleep(200);
is('header actions fire', await ev('window.__printed'), true);

console.log('\n═══ 5. Layout ═══');
for (const [label, w] of [['desktop',1440],['tablet',820],['phone',390]]) {
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:1,mobile:w<700});
  await sleep(300);
  const over = await ev('document.documentElement.scrollWidth > window.innerWidth + 1');
  is(`no sideways scroll on ${label}`, over, false);
}

const errs = await ev('JSON.stringify(window.__errors)');
is('no uncaught page errors', errs, '[]');
if (errs !== '[]') console.log('        ' + errs);
const realConsole = consoleErrors.filter(e => !/favicon|__uitest/i.test(e));
is('no console errors', realConsole.length, 0);
if (realConsole.length) console.log('        ' + [...new Set(realConsole)].join('\n        '));

fs.mkdirSync(`${S}/shots-ui`, { recursive: true });
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await sleep(300);
const shot = await send('Page.captureScreenshot',{format:'png'});
if (shot?.result?.data) fs.writeFileSync(`${S}/shots-ui/record-view.png`, Buffer.from(shot.result.data,'base64'));

// picker screenshot
await ev(`document.querySelector('.rv') && (document.getElementById('page-root').innerHTML='')`);
await ev(`document.querySelector('.itempick').click()`);
await sleep(500);
const shot2 = await send('Page.captureScreenshot',{format:'png'});
if (shot2?.result?.data) fs.writeFileSync(`${S}/shots-ui/item-picker.png`, Buffer.from(shot2.result.data,'base64'));

console.log(`\n════════════════════════════════════\n  passed: ${pass}   failed: ${fail}`);
console.log(fail === 0 ? '  ALL GREEN' : '  SEE FAILURES ABOVE');

ws.close(); chrome.kill(); server.close();
try { fs.unlinkSync(`${WEB}/__uitest.html`); } catch {}
try { fs.rmSync(prof,{recursive:true,force:true}); } catch {}
process.exit(fail === 0 ? 0 : 1);
