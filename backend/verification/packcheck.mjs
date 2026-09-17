// Verify the hotel pack against the customer's own workbook, and verify the
// backend actually wires it up. These are the assertions that would have
// caught a half-applied rewrite: the pack looking right while nothing reads it.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// Resolve the repo from this file's own location, so the suite runs
// from any checkout rather than one developer's home directory.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const require = createRequire(import.meta.url);

const ROOT = REPO_ROOT + '';
const pack = require(ROOT + '/functions/procurement_api/industry-packs.js');
const api = fs.readFileSync(ROOT + '/functions/procurement_api/index.js', 'utf8');
const p2p = fs.readFileSync(ROOT + '/procurement_web/js/views-p2p.js', 'utf8');
const apijs = fs.readFileSync(ROOT + '/procurement_web/js/api.js', 'utf8');
const css = fs.readFileSync(ROOT + '/procurement_web/css/app.css', 'utf8');

let pass = 0, fail = 0;
const ok = m => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m, d) => { console.log(`  FAIL  ${m}\n        ${d}`); fail++; };
const eq = (m, got, want) => got === want ? ok(`${m} (${got})`) : bad(m, `expected ${want}, got ${got}`);
const has = (m, hay, n) => hay.includes(n) ? ok(m) : bad(m, `missing: ${n}`);

const P = pack.getPack('hotel');

console.log('-- classification matrix (from the customer workbook) --');
eq('departments', P.departments.length, 10);
eq('primary categories', P.categories.length, 27);
eq('sub-categories', P.categories.reduce((n, c) => n + c.sub.length, 0), 137);
eq('clusters', P.clusters.length, 5);
eq('properties across clusters', P.clusters.reduce((n, c) => n + c.properties.length, 0), 15);
eq('payment terms', P.paymentTerms.length, 8);
eq('base UOMs', P.baseUoms.length, 7);
eq('tax treatments', P.taxTreatments.length, 4);
eq('expenditure categories', P.expenditureCategories.length, 4);

// Spot-check exact strings: a paraphrase here would ship wrong data.
has('Galle Face Hotel Colombo is a property', JSON.stringify(P.clusters), 'Galle Face Hotel Colombo');
has('CHC Rest Houses cluster present', JSON.stringify(P.clusters), 'CHC Rest Houses');
has('SSCL tax treatment verbatim', JSON.stringify(P.taxTreatments), 'SSCL Applicable');
has('AMC is an expenditure category', JSON.stringify(P.expenditureCategories), 'AMC');
has('R410a refrigerant sub-category verbatim', JSON.stringify(P.categories), 'Refrigerant Gases (R410a, R134a)');

console.log('-- approval routes --');
eq('budgeted route stages', P.workflows.budgeted.stages.length, 6);
eq('non-budgeted route stages', P.workflows.non_budgeted.stages.length, 5);
eq('budget-exceed route stages', P.workflows.budget_exceed.stages.length, 7);
// The workbook's non-budget lane ends at the Board and never reaches
// Purchasing/Central Procurement before approval — that ordering is the point.
const nb = P.workflows.non_budgeted.stages.map(s => s.role);
nb[nb.length - 1] === 'Board of Directors'
  ? ok('non-budgeted escalates to the Board last')
  : bad('non-budgeted final approver', `got ${nb[nb.length - 1]}`);
P.workflows.budget_exceed.stages.map(s => s.role).includes('Procurement Committee')
  ? ok('budget-exceed passes the Procurement Committee') : bad('budget-exceed committee', 'missing');
pack.workflowFor('nonsense').key === 'budgeted'
  ? ok('unknown budget class falls back to the budgeted route') : bad('workflow fallback', 'wrong');

console.log('-- backend wiring --');
has('setup seeds roles from the pack', api, 'for (const r of (pack.roles || []))');
has('setup seeds profiles from the pack', api, 'for (const p of (pack.profiles || []))');
has('setup falls back to the real cluster list', api, 'pack.clusters || []');
has('/api/reference exists', api, "app.get('/api/reference'");
has('/api/prs/:id/workflow exists', api, "app.get('/api/prs/:id/workflow'");
has('role-based approver lookup exists', api, 'async function findApproverByRole');
has('approve walks the route', api, "route.stages.find(s => s.seq > currentSeq");
has('engine honours the Workflow rule', api, "moduleRule === 'Workflow'");
has('settings carry the classification', api, 'classification: pack.classification');
has('approvalRules set to Workflow', api, "approvalRules: { PR: 'Workflow' }");

// A vacant rung must never read as approved.
has('unassigned rung is reported, not swallowed', api, 'unassigned: !approver');

console.log('-- frontend wiring --');
has('loadReference exported', apijs, 'export async function loadReference');
has('PR form loads reference data', p2p, 'await loadReference()');
has('budget class field on the PR form', p2p, 'pr-budgetclass');
has('expenditure category field on the PR form', p2p, 'pr-expcat');
has('budget class is submitted', p2p, 'BudgetClass:');
has('route renderer exists', p2p, 'function approvalRouteHTML');
has('approvals tab fetches the route', p2p, '/workflow');
has('vacant seat is surfaced to the user', p2p, 'No one is mapped to this role');
has('route styles exist', css, '.wf-stage');
has('current rung is visually distinct', css, '.wf-stage.is-current');

// Cache-bust consistency: a single stale ?v= means two module instances and a
// silently empty picker. This is the bug the gate caught last time.
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const f = d + '/' + e.name;
  if (e.isDirectory()) walk(f);
  else if (/\.(js|html)$/.test(e.name)) files.push(f);
});
walk(ROOT + '/procurement_web');
const versions = new Set();
for (const f of files) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\?v=(\d+)/g)) versions.add(m[1]);
}
versions.size === 1
  ? ok(`one cache-bust version across all modules (v=${[...versions][0]})`)
  : bad('cache-bust drift', `found versions: ${[...versions].join(', ')} — different URLs are different module instances`);

console.log(`\npassed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
