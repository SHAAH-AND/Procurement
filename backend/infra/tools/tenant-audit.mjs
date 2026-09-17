#!/usr/bin/env node
// Static guard over the API's ZCQL. Enforces the two rules that keep one
// customer's data away from another's:
//
//   1. TENANT SCOPE  — a query touching an org-scoped table filters by OrgID.
//   2. ESCAPING      — every value interpolated into a query goes through
//                      zqRaw(), so a value can never break out of its quote
//                      and rewrite the WHERE clause (including the OrgID
//                      predicate that rule 1 relies on).
//
// Both rules have real exceptions — platform rollups that are cross-org on
// purpose, auth lookups keyed by a token hash. Those live in the allowlists
// below WITH A REASON. Adding to an allowlist is a deliberate act; forgetting
// an OrgID filter is not. That is the whole point of the file.
//
// Usage:  node tools/tenant-audit.mjs        (exit 0 clean, 1 on violations)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = path.join(ROOT, 'functions', 'procurement_api', 'index.js');
const src = fs.readFileSync(API, 'utf8');

// Tables that carry tenant data. Mirrors ORG_TABLES in index.js.
const ORG_TABLES = [
  'PRItems', 'POItems', 'GRNItems', 'Bids', 'RFQVendors',
  'PRs', 'POs', 'GRNs', 'RFQs', 'Invoices', 'Payments',
  'VendorContacts', 'VendorBankAccounts', 'BudgetPeriods', 'ApprovalHistory',
  'RecurringBills', 'VendorCredits', 'Attachments', 'AuditLog', 'Integrations', 'UsageCounters',
  'Assets', 'PropertyAssignments', 'VendorPortalAccess', 'VendorSessions',
  'Suppliers', 'Items', 'Budgets', 'Properties', 'CustomModules', 'CustomFields',
  'DashboardConfigs', 'PdfTemplates', 'Profiles', 'Roles', 'Users'
];

// Queries that are cross-org BY DESIGN. Each needs a reason.
const SCOPE_ALLOWLIST = [
  { match: /FROM Users WHERE Email =/i,
    reason: 'Membership lookup: resolves WHICH orgs an authenticated email belongs to, then narrows to the requested one.' },
  { match: /FROM UsageCounters/i,
    reason: 'Platform billing rollup across all tenants — the developer portal, not a tenant surface.' },
  { match: /FROM VendorSessions WHERE TokenHash =/i,
    reason: 'Vendor auth: the token hash IS the credential and the row supplies the OrgID.' },
  { match: /FROM VendorSessions WHERE ExpiresAt </i,
    reason: 'Scheduled purge of expired sessions across all tenants.' },
  { match: /FROM VendorPortalAccess WHERE VendorID = .* AND InviteToken =/i,
    reason: 'Invite acceptance: the single-use invite token is the credential.' },
  { match: /FROM VendorPortalAccess WHERE Email =/i,
    reason: 'Vendor login: the same email may hold access in several orgs; the access code disambiguates.' },
  { match: /FROM SupportSessions WHERE TokenHash =/i,
    reason: 'Support session lookup: the token hash is the credential and the row supplies the OrgID.' },
];

// Interpolations that are not values needing escape: internally-built SQL
// fragments, and loop variables holding a table name from ORG_TABLES.
const ESCAPE_ALLOWLIST = [
  /^\$\{zqRaw\(/,               // already escaped
  /^\$\{sha256\(/,              // fixed-length hex digest
  /^\$\{Number\(/,              // coerced to a number
  /^\$\{propertyScopeClause\(/, // pre-built, internally escaped SQL fragment
  /^\$\{(where|moduleFilter|sql)\}$/,      // pre-built SQL fragments
  /^\$\{(ids|idsList|idList|invIdList)\}$/, // pre-built quoted lists (built with zqRaw)
  /^\$\{(t|table|p)\}$/,        // table/prefix name from an internal constant
  /^\$\{(period|nowIso)\}$/,    // server-generated timestamps
];

// ---- Parse every ZCQL statement -------------------------------------------
const queries = [];
const re = /`((?:SELECT|UPDATE|DELETE|INSERT)[\s\S]*?)`/gi;
let m;
while ((m = re.exec(src)) !== null) {
  queries.push({
    line: src.slice(0, m.index).split('\n').length,
    raw: m[1],
    text: m[1].replace(/\s+/g, ' ').trim()
  });
}

// ---- Rule 1: tenant scope ---------------------------------------------------
const scopeViolations = [];
let orgScoped = 0;
for (const q of queries) {
  const tbl = ORG_TABLES.find(t => new RegExp(`\\b(FROM|UPDATE|INTO)\\s+${t}\\b`, 'i').test(q.text));
  if (!tbl) continue;
  orgScoped++;
  if (/OrgID\s*(=|IN)/i.test(q.text)) continue;
  if (SCOPE_ALLOWLIST.some(a => a.match.test(q.text))) continue;
  scopeViolations.push({ ...q, tbl });
}

// ---- Rule 2: escaping -------------------------------------------------------
const escapeViolations = [];
let interpolations = 0;
for (const q of queries) {
  const found = q.raw.match(/\$\{[^}]*\}/g) || [];
  for (const i of found) {
    interpolations++;
    if (ESCAPE_ALLOWLIST.some(rx => rx.test(i))) continue;
    escapeViolations.push({ line: q.line, expr: i, text: q.text });
  }
}

// ---- Report -----------------------------------------------------------------
console.log('ZCQL tenant-isolation audit');
console.log('='.repeat(60));
console.log(`Statements parsed             ${queries.length}`);
console.log(`Touching an org-scoped table  ${orgScoped}`);
console.log(`  scoped by OrgID             ${orgScoped - scopeViolations.length - SCOPE_ALLOWLIST.length >= 0 ? orgScoped - scopeViolations.length : 'n/a'}`);
console.log(`  unscoped BY DESIGN          ${SCOPE_ALLOWLIST.length} allowlisted patterns`);
console.log(`  UNSCOPED VIOLATIONS         ${scopeViolations.length}`);
console.log(`Value interpolations          ${interpolations}`);
console.log(`  UNESCAPED VIOLATIONS        ${escapeViolations.length}`);
console.log('');

if (scopeViolations.length) {
  console.log('--- RULE 1 FAILED: query on tenant data without an OrgID filter ---');
  for (const v of scopeViolations) {
    console.log(`\n  index.js:${v.line}  [${v.tbl}]`);
    console.log(`    ${v.text.slice(0, 160)}`);
  }
  console.log('\n  Add "AND OrgID = \'${zqRaw(orgId)}\'" — or, if it is cross-org on');
  console.log('  purpose, add it to SCOPE_ALLOWLIST in this file with a reason.\n');
}

if (escapeViolations.length) {
  console.log('--- RULE 2 FAILED: value interpolated into ZCQL without zqRaw() ---');
  for (const v of escapeViolations) {
    console.log(`\n  index.js:${v.line}  ${v.expr}`);
    console.log(`    ${v.text.slice(0, 160)}`);
  }
  console.log('\n  Wrap it: ${zqRaw(value)}. An unescaped value can close its quote');
  console.log('  and append SQL, which defeats the OrgID filter next to it.\n');
}

const total = scopeViolations.length + escapeViolations.length;
console.log('='.repeat(60));
console.log(total === 0
  ? 'PASS — every tenant query is scoped, every value is escaped.'
  : `FAIL — ${total} violation(s). Cross-tenant exposure is possible.`);
process.exit(total === 0 ? 0 : 1);
