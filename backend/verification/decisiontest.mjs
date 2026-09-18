#!/usr/bin/env node
// Stage: the approve / reject links.
//
// Unauthenticated by necessity - the administrator clicks them from an email,
// which carries no session - so the token in the URL is the whole credential.
// These tests are about that token: that it must be one we issued, that using
// it consumes it, that an old one is refused, and that probing reveals nothing.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const decision = require('../functions/procurement_api/signupdecision.js');

let pass = 0, fail = 0;
const failures = [];
const ok = (label, cond, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(detail ? `${label} — ${detail}` : label); }
};

const NOW = Date.parse('2026-08-05T06:00:00Z');
const GOOD = 'a'.repeat(64);

/** Matches the real escaping convention in this build: a BARE escaped value. */
const esc = v => String(v === null || v === undefined ? '' : v)
  .replace(/\\/g, '\\\\').replace(/'/g, "''");
const escId = v => {
  const s = String(v ?? '').trim();
  if (!/^\d{1,20}$/.test(s)) throw new Error(`Invalid record id: ${v}`);
  return s;
};

function depsFor(row) {
  const queries = [];
  return {
    queries,
    esc, escId,
    now: () => NOW,
    zcql: async sql => {
      queries.push(sql);
      if (/^SELECT/i.test(sql.trim())) {
        if (!row) return [];
        return sql.includes(`'${row.Token}'`) ? [{ SignupRequests: row }] : [];
      }
      if (/^UPDATE/i.test(sql.trim())) {
        if (row && row.Status === 'Pending') {
          row.Status = sql.match(/Status = '(\w+)'/)?.[1];
          return 1;
        }
        return 0;
      }
      return [];
    }
  };
}

const pending = (over = {}) => ({
  ROWID: '97606000000040001',
  Email: 'applicant@example.com',
  Status: 'Pending',
  Token: GOOD,
  ExpiresAt: '2026-08-05 12:00:00',
  ...over
});

// ── The happy path ─────────────────────────────────────────────────────────

{
  const row = pending();
  const d = depsFor(row);
  const res = await decision.handle(GOOD, 'Approved', d);
  ok('approving answers with a page', typeof res.html === 'string');
  ok('the row becomes Approved', row.Status === 'Approved');
  ok('the applicant address is shown', res.html.includes('applicant@example.com'));
  ok('the page says view-only', /view-only/i.test(res.html));
}

{
  const row = pending();
  const d = depsFor(row);
  const res = await decision.handle(GOOD, 'Rejected', d);
  ok('rejecting answers with a page', typeof res.html === 'string');
  ok('the row becomes Rejected', row.Status === 'Rejected');
  ok('the page says refused', /refused|rejected/i.test(res.html));
}

// ── Single use ─────────────────────────────────────────────────────────────

{
  const row = pending();
  const d = depsFor(row);
  await decision.handle(GOOD, 'Approved', d);
  const second = await decision.handle(GOOD, 'Approved', d);
  ok('a second click is refused', /already/i.test(second.html));
  ok('the row keeps its first decision', row.Status === 'Approved');
}

{
  const row = pending();
  const d = depsFor(row);
  await decision.handle(GOOD, 'Approved', d);
  await decision.handle(GOOD, 'Rejected', d);
  ok('a used link cannot be flipped', row.Status === 'Approved');
}

{
  const row = pending();
  const d = depsFor(row);
  await decision.handle(GOOD, 'Approved', d);
  const update = d.queries.find(q => /^UPDATE/i.test(q.trim())) || '';
  ok('the UPDATE is guarded on Status = Pending', /Status = 'Pending'/.test(update), update);
  ok('the UPDATE writes a single-quoted status', /Status = 'Approved'/.test(update), update);
  ok('the UPDATE has no doubled quotes', !/''(Approved|Pending)''/.test(update), update);
}

// ── Expiry ─────────────────────────────────────────────────────────────────

for (const [label, expires] of [
  ['one second ago', '2026-08-05 05:59:59'],
  ['absent', null],
  ['unparseable', 'not a date']
]) {
  const row = pending({ ExpiresAt: expires });
  const res = await decision.handle(GOOD, 'Approved', depsFor(row));
  ok(`an expiry that is ${label} refuses the link`, /expired/i.test(res.html));
  ok(`an expiry that is ${label} approves nobody`, row.Status === 'Pending');
}

// ── Bad tokens ─────────────────────────────────────────────────────────────

const badTokens = [
  ['missing', undefined], ['empty', ''], ['null', null],
  ['an object', { toString: () => GOOD }], ['an array', [GOOD]],
  ['too short', 'abc'], ['non-hex', 'z'.repeat(64)],
  ['a quote', `' OR '1'='1`], ['a SQL comment', `${'a'.repeat(60)}'--`],
  ['whitespace', '   '], ['uppercase hex', 'A'.repeat(64)]
];

for (const [label, token] of badTokens) {
  const row = pending();
  const d = depsFor(row);
  let res, threw = null;
  try { res = await decision.handle(token, 'Approved', d); }
  catch (err) { threw = err; }
  ok(`a token that is ${label} is refused`,
     !threw && /not valid/i.test(res?.html || ''),
     threw ? `threw: ${threw.message}` : '');
  ok(`a token that is ${label} approves nobody`, row.Status === 'Pending');
  ok(`a token that is ${label} never reaches the datastore`, d.queries.length === 0);
}

// ── Probing ────────────────────────────────────────────────────────────────

{
  const unknown = await decision.handle('b'.repeat(64), 'Approved', depsFor(null));
  const invalid = await decision.handle('zz', 'Approved', depsFor(null));
  ok('an unknown token looks like an invalid one', unknown.html === invalid.html);
}

// ── Escaping ───────────────────────────────────────────────────────────────

{
  const row = pending({ Email: '<img src=x onerror=alert(1)>@example.com' });
  const res = await decision.handle(GOOD, 'Approved', depsFor(row));
  ok('an address cannot inject markup', !/<img/i.test(res.html));
  ok('the escaped form is shown', /&lt;img/i.test(res.html));
}

ok('escapeHtml handles a quote', decision.escapeHtml('"') === '&quot;');
ok('escapeHtml handles null', decision.escapeHtml(null) === '');
ok('a 32-char hex token is valid', decision.validToken('a'.repeat(32)));
ok('a 31-char token is not', !decision.validToken('a'.repeat(31)));
ok('a 129-char token is not', !decision.validToken('a'.repeat(129)));

console.log(`signup decisions — passed: ${pass}, failed: ${fail}`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exitCode = fail ? 1 : 0;
