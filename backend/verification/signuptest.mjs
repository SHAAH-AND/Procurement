#!/usr/bin/env node
// Stage: the public signup gate.
//
// Public signup is enabled, so this function is the only thing between the
// internet and an auth account in the tenant. The property that matters is not
// "does it approve the right people" - it is "does it EVER approve anyone a
// human has not already approved". Every test below that ends in a denial is
// therefore more important than the one that ends in approval.
//
// These call the real decide() with fake dependencies, rather than reading the
// source for reassuring-looking strings. Two earlier stages on this project
// passed while the code they covered was broken, both times because they
// inspected text instead of running it.

import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const signup = require('../functions/procurement_signup_gate/signup.js');

let pass = 0, fail = 0;
const failures = [];

const ok = (label, cond, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(detail ? `${label} — ${detail}` : label); }
};

const CONFIG = {
  adminEmails: ['admin@cloudpartners.biz'],
  fromEmail: 'admin@cloudpartners.biz',
  appOrigin: 'https://procurement.cloudhub.lk',
  appName: 'ProcureFlow',
  apiName: 'procurement_api'
};

/** A dependency set that records what was attempted. */
function deps(overrides = {}) {
  const sent = [];
  const queries = [];
  const logs = [];
  return {
    sent, queries, logs,
    zcql: async q => { queries.push(q); return (overrides.rows || []); },
    sendMail: async m => { sent.push(m); },
    crypto,
    now: () => Date.parse('2026-08-05T00:00:00Z'),
    config: CONFIG,
    log: m => logs.push(m),
    ...overrides
  };
}

const signupFor = (email, extra = {}) => ({
  request_type: 'add_user',
  request_details: {
    user_details: { email_id: email, first_name: 'Ada', last_name: 'Lovelace', ...extra },
    auth_type: 'web'
  }
});

const isDenial = r => r && r.status === 'failure';
const isApproval = r => r && r.status === 'success';

// ── The default is denial ──────────────────────────────────────────────────

{
  const d = deps();
  const { response } = await signup.decide(signupFor('stranger@example.com'), d);
  ok('an unknown address is denied', isDenial(response));
  ok('the unknown address is recorded', d.queries.some(q => /INSERT INTO SignupRequests/.test(q)));
  ok('the administrator is emailed', d.sent.length === 1);
  ok('the email goes to the configured admin',
     d.sent[0]?.to_email?.includes('admin@cloudpartners.biz'));
  ok('the email carries an approve link',
     /\/api\/signup\/approve\?token=/.test(d.sent[0]?.content || ''));
  ok('the email carries a reject link',
     /\/api\/signup\/reject\?token=/.test(d.sent[0]?.content || ''));
}

// ── Only a stored approval opens the door ──────────────────────────────────

{
  const d = deps({ rows: [{ SignupRequests: { ROWID: '1', Status: 'Approved', Attempts: 1 } }] });
  const { response } = await signup.decide(signupFor('approved@example.com'), d);
  ok('an approved address is allowed', isApproval(response));
  ok('approval sends no further email', d.sent.length === 0);
}

{
  const d = deps({ rows: [{ SignupRequests: { ROWID: '1', Status: 'Rejected', Attempts: 1 } }] });
  const { response } = await signup.decide(signupFor('rejected@example.com'), d);
  ok('a rejected address stays denied', isDenial(response));
  ok('re-applying after rejection does not email the admin again', d.sent.length === 0);
}

{
  const d = deps({ rows: [{ SignupRequests: { ROWID: '1', Status: 'Pending', Attempts: 1 } }] });
  const { response } = await signup.decide(signupFor('waiting@example.com'), d);
  ok('a pending address is denied', isDenial(response));
  ok('a second attempt does not spam the administrator', d.sent.length === 0);
  ok('the attempt counter is raised', d.queries.some(q => /UPDATE SignupRequests SET Attempts/.test(q)));
}

// ── Every failure denies ───────────────────────────────────────────────────
//
// The important half. Each of these is a way the function can go wrong in
// production, and each must end with the door shut.

{
  const d = deps({ zcql: async () => { throw new Error('datastore unreachable'); } });
  const { response } = await signup.decide(signupFor('nobody@example.com'), d);
  ok('a datastore read failure denies', isDenial(response));
  ok('a datastore failure sends no email', d.sent.length === 0);
}

{
  // The read works and finds nothing; the INSERT is what fails. Without a
  // stored token the approval link would be dead, so no email may go out.
  let call = 0;
  const d = deps({
    zcql: async q => {
      call++;
      if (/^INSERT/.test(q.trim())) throw new Error('write rejected');
      return [];
    }
  });
  const { response } = await signup.decide(signupFor('nobody2@example.com'), d);
  ok('a failed INSERT denies', isDenial(response));
  ok('a failed INSERT sends no approval link', d.sent.length === 0);
}

{
  // Mail failure is the one error that must NOT lose the request: it is
  // recorded, so the admin can still find it in the app.
  const d = deps({ sendMail: async () => { throw new Error('mail quota exceeded'); } });
  const { response, recorded, mailError } =
    await signup.decide(signupFor('nobody3@example.com'), d);
  ok('a mail failure still denies', isDenial(response));
  ok('a mail failure still records the request', recorded === true);
  // The whole workflow depends on somebody receiving that link, and the logs
  // are not readable on this platform, so the error must come back to the
  // caller rather than being swallowed.
  ok('a mail failure is reported to the caller', mailError === 'mail quota exceeded',
     String(mailError));
}

{
  const d = deps();
  const { mailError } = await signup.decide(signupFor('mailok@example.com'), d);
  ok('a successful send reports no mail error', !mailError);
}

// ── Malformed input is denied, never crashed on ────────────────────────────

const junk = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'add_user'],
  ['a number', 42],
  ['an empty object', {}],
  ['no request_details', { request_type: 'add_user' }],
  ['null request_details', { request_type: 'add_user', request_details: null }],
  ['no user_details', { request_type: 'add_user', request_details: {} }],
  ['no email', { request_type: 'add_user', request_details: { user_details: {} } }],
  ['a null email', { request_type: 'add_user', request_details: { user_details: { email_id: null } } }],
  ['an empty email', { request_type: 'add_user', request_details: { user_details: { email_id: '' } } }],
  ['an email that is an object',
   { request_type: 'add_user', request_details: { user_details: { email_id: { a: 1 } } } }],
  ['an email that is an array',
   { request_type: 'add_user', request_details: { user_details: { email_id: ['a@b.com'] } } }],
  ['a non-address string',
   { request_type: 'add_user', request_details: { user_details: { email_id: 'not-an-email' } } }],
  ['an unexpected request_type',
   { request_type: 'delete_user', request_details: { user_details: { email_id: 'a@b.com' } } }]
];

for (const [label, payload] of junk) {
  let response, threw = null;
  try {
    ({ response } = await signup.decide(payload, deps()));
  } catch (err) {
    threw = err;
  }
  ok(`${label} is denied`, !threw && isDenial(response),
     threw ? `it threw: ${threw.message}` : `it returned ${JSON.stringify(response)}`);
}

// ── Injection ──────────────────────────────────────────────────────────────

{
  const d = deps();
  await signup.decide(signupFor("attacker'--@example.com"), d);
  // The address should not survive validation at all, but if the pattern ever
  // loosens, the escaping must still hold.
  const unsafe = d.queries.filter(q => /'--/.test(q) && !/''/.test(q));
  ok('a quote in an address cannot break out of ZCQL', unsafe.length === 0,
     unsafe[0] || '');
}

ok('zq escapes single quotes', signup.zq("o'brien") === "o''brien");
ok('zq refuses objects', (() => {
  try { signup.zq({}); return false; } catch { return true; }
})());

// ── The approval email is not an injection vector ──────────────────────────

{
  const d = deps();
  await signup.decide(
    signupFor('xss@example.com', { first_name: '<script>alert(1)</script>', last_name: '"onload="x' }),
    d
  );
  const html = d.sent[0]?.content || '';
  ok('a script tag in the name is escaped', !/<script>/.test(html));
  ok('a quote in the name cannot break an attribute', !/"onload="x/.test(html));
}

// ── Configuration ──────────────────────────────────────────────────────────
//
// A gate with nobody to ask must not silently approve. readConfig returning
// null is what index.js turns into a denial.

ok('no admin address means no configuration',
   signup.readConfig({ APP_ORIGIN: 'https://x.example.com' }) === null);
ok('no origin means no configuration',
   signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com' }) === null);
ok('a non-https origin is refused',
   signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com', APP_ORIGIN: 'http://x.example.com' }) === null);
ok('a complete configuration is accepted',
   signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com', APP_ORIGIN: 'https://x.example.com' }) !== null);
// APP_ORIGIN must be an origin, not a page. The URL in the address bar is the
// natural thing to paste and it is wrong: the approval links append a path to
// this, so a page URL yields a dead link in every email. This was pasted for
// real on the first configuration attempt.
for (const bad of [
  'https://x.example.com/app/index.html',
  'https://x.example.com/app/',
  'https://x.example.com/app',
  'https://x.example.com/server/procurement_api',
  'x.example.com',
  'https://',
  'https://x.example.com/?a=b'
]) {
  ok(`APP_ORIGIN ${JSON.stringify(bad)} is refused`,
     signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com', APP_ORIGIN: bad }) === null);
}

for (const good of [
  'https://x.example.com',
  'https://x.example.com/',            // one trailing slash is tidied, not fatal
  'https://procurement.cloudhub.lk',
  'https://procurement.cloudhub.lk',
  'https://localhost:3000'
]) {
  ok(`APP_ORIGIN ${JSON.stringify(good)} is accepted`,
     signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com', APP_ORIGIN: good }) !== null);
}

// And the links built from it must be reachable paths.
{
  const cfg = signup.readConfig({
    SIGNUP_ADMIN_EMAILS: 'a@b.com',
    APP_ORIGIN: 'https://x.example.com/',
    API_FUNCTION_NAME: 'procurement_api'
  });
  const mail = signup.buildMail('someone@example.com',
    { firstName: 'A', lastName: 'B' }, 'f'.repeat(64), cfg);
  ok('the approve link has exactly one slash before /server',
     /https:\/\/x\.example\.com\/server\/procurement_api\/api\/signup\/approve\?token=/.test(mail.content),
     (mail.content.match(/https:\/\/[^"]+approve[^"]*/) || [])[0] || '');
  ok('the link carries no doubled slash',
     !/[^:]\/\//.test((mail.content.match(/https:\/\/[^"]+approve[^"]*/) || [''])[0]));
}
ok('several admins are read',
   signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com, c@d.com', APP_ORIGIN: 'https://x.example.com' })
     ?.adminEmails.length === 2);


ok('several admins are read',
   signup.readConfig({ SIGNUP_ADMIN_EMAILS: 'a@b.com, c@d.com', APP_ORIGIN: 'https://x.example.com' })
     ?.adminEmails.length === 2);

// ── Tokens ─────────────────────────────────────────────────────────────────

{
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(signup.makeToken(crypto));
  ok('tokens do not repeat', seen.size === 500);
  const one = signup.makeToken(crypto);
  ok('a token is long enough to be unguessable', one.length >= 32, `length ${one.length}`);
  ok('a token is hex only', /^[0-9a-f]+$/.test(one));
}

// The source must not reach for Math.random. It is not a CSPRNG, and this
// token is the whole security of the approval link.
//
// Comments are stripped before checking: the docblock above makeToken names
// Math.random precisely to warn against it, and a check that cannot tell a
// warning from a use would fail on the code that heeds it.
{
  const src = require('node:fs').readFileSync(
    new URL('../functions/procurement_signup_gate/signup.js', import.meta.url), 'utf8');
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '');      // line comments
  ok('the gate never uses Math.random', !/Math\.random/.test(code));
  ok('the gate uses a CSPRNG', /crypto\.randomUUID/.test(code));
}

// ── Email normalisation ────────────────────────────────────────────────────

ok('addresses are lowercased', signup.normaliseEmail('Person@Example.COM') === 'person@example.com');
ok('surrounding space is trimmed', signup.normaliseEmail('  a@b.com  ') === 'a@b.com');
ok('an over-long address is refused', signup.normaliseEmail('a'.repeat(200) + '@b.com') === null);
ok('a bare word is refused', signup.normaliseEmail('nope') === null);
ok('a missing TLD is refused', signup.normaliseEmail('a@b') === null);

// Case-insensitive matching is what stops an approval looking ignored.
{
  const d = deps({ rows: [{ SignupRequests: { ROWID: '1', Status: 'Approved', Attempts: 1 } }] });
  const { response } = await signup.decide(signupFor('APPROVED@EXAMPLE.COM'), d);
  ok('approval matches regardless of case', isApproval(response));
  ok('the lookup queries the lowercased address',
     d.queries[0].includes("'approved@example.com'"));
}

// ── The workspace is stamped on the request ────────────────────────────────
//
// Specific to this build: the hotel app scopes everything by OrgID, so a
// request that records none is one the app cannot show the administrator.

{
  const d = deps({
    zcql: async q => {
      if (/FROM Organizations/.test(q)) return [{ Organizations: { ROWID: '97606000000036005' } }];
      return [];
    }
  });
  const queries = [];
  const wrapped = { ...d, zcql: async q => { queries.push(q); return d.zcql(q); } };
  await signup.decide(signupFor('orgstamp@example.com'), wrapped);
  const insert = queries.find(q => /^INSERT/.test(q.trim())) || '';
  ok('the workspace is looked up', queries.some(q => /FROM Organizations/.test(q)));
  ok('the request records its OrgID', insert.includes('97606000000036005'), insert);
}

{
  // Losing the workspace lookup must not lose the request: it is still denied
  // and still recorded, which is the part that matters.
  const d = deps({
    zcql: async q => {
      if (/FROM Organizations/.test(q)) throw new Error('workspace lookup failed');
      return [];
    }
  });
  const { response, recorded } = await signup.decide(signupFor('noorg@example.com'), d);
  ok('a failed workspace lookup still denies', isDenial(response));
  ok('a failed workspace lookup still records the request', recorded === true);
}

// ── The expiry actually reaches the row ────────────────────────────────────

{
  const d = deps();
  await signup.decide(signupFor('expiry@example.com'), d);
  const insert = d.queries.find(q => /^INSERT/.test(q.trim())) || '';
  ok('the recorded row carries an expiry', /ExpiresAt/.test(insert));
  ok('the expiry is 12 hours out', insert.includes('2026-08-05 12:00:00'), insert);
  ok('the row starts Pending', /'Pending'/.test(insert));
}

console.log(`signup gate — passed: ${pass}, failed: ${fail}`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\nPublic signup is enabled. Until these pass, the only thing');
  console.log('deciding who gets an account is this function.');
}
process.exitCode = fail ? 1 : 0;
