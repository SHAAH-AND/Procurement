#!/usr/bin/env node
// Post-deploy CSP check against the LIVE site.
//
// Why this exists: a CSP shipped in v31 blocked accounts.zohoportal.com, the
// host the Catalyst SDK calls to mint an auth token. Every signed-in user got
// a boot screen that never finished, and the local CSP test passed anyway —
// because it only LOADED the page. Loading is the unauthenticated path, where
// isUserAuthenticated() rejects before a token is ever requested, so the
// blocked fetch never happened and there was nothing to report.
//
// So this does the thing the other test could not: it invokes the SDK's auth
// calls directly and watches for violations. The calls fail when signed out —
// that is fine and expected. What matters is whether the browser BLOCKED the
// request, which happens regardless of whether a session exists.
//
// Usage:
//   node tools/check-live-csp.mjs [url]
// Defaults to the production app. Exit 0 clean, 1 on any violation.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';

const TARGET = process.argv[2] || 'https://procurement.cloudhub.lk/app/index.html';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9411;

if (!fs.existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}. Edit CHROME in this file.`);
  process.exit(2);
}

const prof = fs.mkdtempSync('C:/Users/MK/AppData/Local/Temp/cdpcspchk-');
const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--disable-gpu',
  '--no-sandbox', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const put = u => new Promise((res, rej) => { const U = new URL(u);
  const q = http.request({ hostname: U.hostname, port: U.port, path: U.pathname + U.search, method: 'PUT' },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error(d)); } }); });
  q.on('error', rej); q.end(); });
const get = u => new Promise((res, rej) => { http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });
for (let i = 0; i < 40; i++) { try { await get(`http://localhost:${PORT}/json/list`); break; } catch { await sleep(250); } }

const t = await put(`http://localhost:${PORT}/json/new?about:blank`);
const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 256e6 });
await new Promise(r => ws.on('open', r));

let id = 0; const pending = new Map();
let violations = [];
ws.on('message', R => {
  const m = JSON.parse(R.toString());
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const text = m.method === 'Log.entryAdded' ? (m.params.entry?.text || '')
    : m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error'
      ? (m.params.args || []).map(a => a.value || a.description || '').join(' ') : '';
  if (text && /Content Security Policy|Refused to connect/i.test(text)) violations.push(text);
});
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.result?.value;

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
console.log(`Checking ${TARGET}\n`);
await send('Page.navigate', { url: TARGET });
await sleep(6000);

// A page that never loaded produces zero violations, which this tool would
// otherwise report as PASS — a green light for a site it never reached. That
// is worse than no check at all, so prove the app is actually running before
// trusting any result. (Seen for real: intermittent ERR_NAME_NOT_RESOLVED.)
const loaded = await ev(`typeof window.catalyst === 'object' && !!document.querySelector('#boot-screen, #gate-screen')`);
if (!loaded) {
  const where = await ev(`location.href`);
  const title = await ev(`document.title || '(no title)'`);
  console.log('INCONCLUSIVE — the app never ran, so nothing was tested.\n');
  if (/__catalyst\/auth\/login/.test(String(where))) {
    // Not a failure. The developer portal sends signed-out visitors straight
    // to hosted login, so there is no app page left to measure a policy on.
    console.log('  Reason: redirected to Catalyst hosted sign-in.');
    console.log('  This page requires a session before it will render.');
    console.log('  Sign in in a normal browser, or check the main app instead:');
    console.log('    node tools/check-live-csp.mjs https://procurement.cloudhub.lk/app/index.html');
    console.log('  The offline policy check covers this page either way:');
    console.log('    node tools/check-csp-hosts.mjs');
  } else {
    console.log(`  Reason: the page did not load. document.title: ${title}`);
    console.log(`  Landed on: ${where}`);
    console.log('  Check DNS/network reachability to the host and re-run.');
  }
  ws.close(); ch.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  process.exit(2);
}

const onLoad = [...violations];
violations = [];

// Invoke the auth calls explicitly. Signed out they will fail — that is not
// what we are measuring. We are measuring whether the browser refused to let
// the request leave at all, which is a policy problem, not a session problem.
await ev(`
  (async () => {
    const swallow = p => p.then(() => {}, () => {});
    const bounded = p => Promise.race([swallow(p), new Promise(r => setTimeout(r, 9000))]);
    try { await bounded(window.catalyst.auth.isUserAuthenticated()); } catch {}
    try { await bounded(window.catalyst.auth.generateAuthToken()); } catch {}
    return true;
  })()
`);
await sleep(1500);
const onAuth = [...violations];

const report = (label, list) => {
  console.log(`${list.length === 0 ? 'PASS' : 'FAIL'}  ${label} — ${list.length} violation(s)`);
  [...new Set(list)].forEach(v => console.log(`        ! ${v.slice(0, 220)}`));
};
report('page load', onLoad);
report('SDK auth calls (isUserAuthenticated + generateAuthToken)', onAuth);

const total = onLoad.length + onAuth.length;
console.log(`\n${total === 0
  ? 'CSP OK — nothing the app needs was blocked, including the auth token path.'
  : `CSP BLOCKS ${total} REQUEST(S). Signed-in users will hang on the boot screen.`}`);

ws.close(); ch.kill();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(total === 0 ? 0 : 1);
