// Cross-checks every `row.Field` the frontend reads against the authoritative
// column map in index.js. This is the check that would have caught
// RequestorEmail, MatchStatus, SupplierInvoiceNo, ReceivedBy and TaxNumber
// before they shipped — all of which rendered as a silent "—".
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');

const API = REPO_ROOT + '/functions/procurement_api/index.js';
const WEB = REPO_ROOT + '/procurement_web/js/';

// ---- 1. read the column map ------------------------------------------------
const src = fs.readFileSync(API, 'utf8');
const mapStart = src.indexOf('  CustomModules: [');
const mapEnd = src.indexOf('};', mapStart);
const block = src.slice(mapStart, mapEnd);

const columns = {};
for (const m of block.matchAll(/^\s*(\w+):\s*\[([^\]]+)\]/gm)) {
  columns[m[1]] = m[2].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
}
// Catalyst adds these to every row.
const SYSTEM = ['ROWID', 'CREATORID', 'CREATEDTIME', 'MODIFIEDTIME'];

console.log(`Column map: ${Object.keys(columns).length} tables\n`);

// ---- 2. which variable maps to which table --------------------------------
// Deliberately conservative: only variables whose table is unambiguous.
const BINDINGS = [
  { file: 'views-p2p.js', varName: 'pr',     table: 'PRs' },
  { file: 'views-p2p.js', varName: 'po',     table: 'POs' },
  { file: 'views-admin.js', varName: 'vendor', table: 'Suppliers' },
  { file: 'views-admin.js', varName: 'item',   table: 'Items' }
];

// Fields computed by the server and attached to a response, not stored columns.
const DERIVED = new Set(['_qty', 'capabilities', 'terminology', 'userCount']);

let problems = 0;
for (const { file, varName, table } of BINDINGS) {
  const code = fs.readFileSync(WEB + file, 'utf8');
  const allowed = new Set([...columns[table], ...SYSTEM]);
  const seen = new Map();

  for (const m of code.matchAll(new RegExp(`\\b${varName}\\.([A-Z]\\w*)`, 'g'))) {
    const field = m[1];
    if (DERIVED.has(field)) continue;
    if (!allowed.has(field)) {
      const line = code.slice(0, m.index).split('\n').length;
      if (!seen.has(field)) seen.set(field, line);
    }
  }
  if (seen.size) {
    problems += seen.size;
    console.log(`✗ ${file}: \`${varName}\` is a ${table} row`);
    for (const [field, line] of seen) {
      console.log(`    line ${line}: .${field} is not a ${table} column`);
    }
    console.log(`    ${table} has: ${columns[table].join(', ')}\n`);
  } else {
    console.log(`✓ ${file}: every \`${varName}.*\` is a real ${table} column`);
  }
}

// ---- 3. line-item tables read by key in column configs --------------------
const LINE_CHECKS = [
  { file: 'views-p2p.js', table: 'POItems', keys: ['ItemID', 'Quantity', 'UnitPrice'] },
  { file: 'views-p2p.js', table: 'PRItems', keys: ['ItemID', 'Quantity', 'EstimatedPrice', 'DiscountPct', 'TaxPct', 'ExpenseType', 'Category'] },
  { file: 'views-p2p.js', table: 'GRNs',    keys: ['GRNNumber', 'ReceivedDate', 'ReceivedByID'] },
  { file: 'views-p2p.js', table: 'Invoices', keys: ['InvoiceNumber', 'SupplierInvoiceDate', 'MatchScore', 'Status', 'Amount'] }
];
console.log();
for (const { table, keys } of LINE_CHECKS) {
  const allowed = new Set([...columns[table], ...SYSTEM]);
  const bad = keys.filter(k => !allowed.has(k));
  if (bad.length) { problems += bad.length; console.log(`✗ ${table}: ${bad.join(', ')} not real columns`); }
  else console.log(`✓ ${table}: the keys in use are all real columns`);
}

console.log(`\n${problems === 0 ? 'PASS — no phantom fields.' : `FAIL — ${problems} phantom field(s).`}`);
process.exit(problems === 0 ? 0 : 1);
