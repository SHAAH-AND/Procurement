// Compares what the live Slate app serves against the local source, so a
// backend-only deploy can't be mistaken for a full one.
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = 'https://procurement-932021889.development.catalystserverless.com/app';
const LOCAL = 'c:/Users/MK/Documents/Procurement/procurement_web';

const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const norm = s => s.replace(/\r\n/g, '\n').trim();

const files = [
  'index.html', 'developer.html', 'vendor_portal.html',
  'css/app.css', 'js/main.js', 'js/ui.js', 'js/api.js',
  'js/views-admin.js', 'js/views-p2p.js', 'js/developer.js', 'js/l3.js',
  'js/tour.js', 'js/documents.js', 'vendor.js', 'img/logo.svg'
];

console.log('Comparing live Slate app against local source\n');
let mismatched = 0, missing = 0;

for (const f of files) {
  let localTxt;
  try { localTxt = norm(fs.readFileSync(`${LOCAL}/${f}`, 'utf8')); }
  catch { console.log(`—  ${f.padEnd(24)} (no local file)`); continue; }

  // Cache-bust the fetch itself so we compare the deployed bytes, not a CDN copy.
  const url = `${BASE}/${f}?cb=${Date.now()}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { console.log(`✗  ${f.padEnd(24)} HTTP ${res.status}`); missing++; continue; }
    const liveTxt = norm(await res.text());
    const same = sha(liveTxt) === sha(localTxt);
    if (!same) mismatched++;
    console.log(`${same ? '✓' : '✗'}  ${f.padEnd(24)} live ${sha(liveTxt)}  local ${sha(localTxt)}${same ? '' : '   ← STALE'}`);
  } catch (e) {
    console.log(`✗  ${f.padEnd(24)} ${e.message}`); missing++;
  }
}

// Content assertions that matter regardless of hashing.
console.log('\n--- Content checks on the LIVE index.html ---');
const live = await (await fetch(`${BASE}/index.html?cb=${Date.now()}`, { cache: 'no-store' })).text();
const checks = [
  ['corrected logo geometry (M14.8 24)', live.includes('M14.8 24 V53.6')],
  ['no stale logo (M16.6 25.7)',         !live.includes('M16.6 25.7')],
  ['no skeleton regression',            !live.includes('skeletonTimer')],
  ['asset version stamped',              /\?v=\d+/.test(live)],
  ['determinate ring markup',             live.includes('ring-prog')],
  ['boot failure panel',                  live.includes('boot-fail')],
  ['SVG flow icons (no emoji)',           !live.includes('flow-dot">📝')],
  ['favicon uses new viewBox',            live.includes('1.4%20-0.15%2064%2064')]
];
let failed = 0;
for (const [label, ok] of checks) { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'}  ${label}`); }

const liveMain = await (await fetch(`${BASE}/js/main.js?cb=${Date.now()}`, { cache: 'no-store' })).text();
console.log('\n--- Content checks on the LIVE main.js ---');
const mchecks = [
  ['versioned module imports', /\.\/ui\.js\?v=\d+/.test(liveMain)],
  ['no pageSkeleton regression', !liveMain.includes('pageSkeleton')],
  ['health probe present',     liveMain.includes('/api/health')],
  ['staged boot progress',     liveMain.includes('bootStage')],
  ['logo onerror fallback',    liveMain.includes('img.onerror')],
  ['system theme support',     liveMain.includes('watchSystemTheme')]
];
for (const [label, ok] of mchecks) { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'}  ${label}`); }

console.log(`\n${mismatched === 0 && missing === 0 && failed === 0
  ? 'FRONTEND FULLY DEPLOYED — live matches local'
  : `PROBLEM: ${mismatched} stale, ${missing} unreachable, ${failed} content check(s) failed`}`);
