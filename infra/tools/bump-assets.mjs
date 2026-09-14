// One version number busts every cached asset.
//
// The HTML's `main.js?v=N` only busts main.js — the modules it imports are
// fetched by bare path and served from cache, so a deploy could pair new
// main.js with stale ui.js. Stamping the same version onto every relative
// import specifier removes the need to hard-refresh after a deploy.
import fs from 'node:fs';

const WEB = 'c:/Users/MK/Documents/Procurement/procurement_web';
const V = process.argv[2];
if (!V) { console.error('usage: node bump.mjs <version>'); process.exit(1); }

let changed = 0;

// 1. Relative import specifiers inside every module (static + dynamic),
// including the standalone vendor entry point at the web root.
const modulePaths = [
  ...fs.readdirSync(`${WEB}/js`).filter(n => n.endsWith('.js')).map(f => `${WEB}/js/${f}`),
  `${WEB}/vendor.js`
].filter(p => fs.existsSync(p));
for (const p of modulePaths) {
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(
    /(\bfrom\s*|\bimport\s*\()(['"])(\.\/[A-Za-z0-9_\/-]+\.js)(?:\?v=[^'"]*)?(['"])/g,
    (_m, lead, q1, path, q2) => `${lead}${q1}${path}?v=${V}${q2}`
  );
  if (after !== before) { fs.writeFileSync(p, after); changed++; console.log(`  ${p.slice(WEB.length + 1)}`); }
}

// 2. HTML asset references (css + entry scripts).
for (const f of ['index.html', 'developer.html', 'vendor_portal.html']) {
  const p = `${WEB}/${f}`;
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before
    .replace(/(href="css\/[A-Za-z0-9_-]+\.css)(\?v=[^"]*)?"/g, `$1?v=${V}"`)
    // Entry scripts live both in js/ and at the web root (vendor.js).
    .replace(/(src="(?:js\/)?[A-Za-z0-9_-]+\.js)(\?v=[^"]*)?"/g, `$1?v=${V}"`);
  if (after !== before) { fs.writeFileSync(p, after); changed++; console.log(`  ${f}`); }
}

console.log(`\nStamped v=${V} across ${changed} file(s).`);
