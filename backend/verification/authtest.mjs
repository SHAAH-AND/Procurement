import fs from 'node:fs';

const web = fs.readFileSync(new URL('../procurement_web/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../procurement_web/js/main.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../procurement_web/js/api.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../functions/procurement_api/index.js', import.meta.url), 'utf8');
const signupGate = fs.readFileSync(new URL('../functions/procurement_signup_gate/index.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../procurement_web/css/app.css', import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
function is(label, actual, expected = true) {
  if (actual === expected) { passed++; console.log(`PASS ${label}`); }
  else { failed++; console.error(`FAIL ${label}: expected ${expected}, got ${actual}`); }
}

is('embedded Zoho sign-in is mounted', main.includes("catalyst.auth.signIn('catalyst-login-container'"));
is('hosted-login redirect is removed from the client', !main.includes("/__catalyst/auth/login") && !api.includes("/__catalyst/auth/login"));
is('login screen does not advertise public signup', !web.includes('Sign in / Sign up'));
is('login screen states invitation-only policy', web.includes('Public registration is not available.'));
is('unused sign-in fallback is hidden until it is needed', web.includes('id="btn-login" class="btn btn-primary access-login-fallback" type="button" hidden'));
is('shared button styles cannot override the hidden fallback', styles.includes('.access-login-fallback[hidden] { display: none !important; }'));
is('CSP permits the Catalyst-hosted Zoho embedded authentication frame', web.includes("frame-src 'self' https://accounts.zoho.com https://*.zoho.com"));
is('API returns the browser to embedded authentication after a 401', api.includes("new CustomEvent('procureflow:auth-required')"));
is('server does not auto-provision a Catalyst account in membership middleware', !server.includes('req.currentUser = await provisionInvitedUser'));
is('server explicitly documents invitation-only workspace membership', server.includes('Only a Users row created by an administrator invitation may'));
is('setup exception exists only before the workspace is created', server.includes('if (!workspace && SETUP_PATHS.includes(req.path)) return next();'));
is('public Catalyst signup gate always denies registration', signupGate.includes('basicIO.write(JSON.stringify(deny()))'));
is('public Catalyst signup gate has no approval path', !signupGate.includes('decide(') && !signupGate.includes('sendMail'));

console.log(`\nauthentication checks — passed: ${passed}, failed: ${failed}`);
process.exitCode = failed ? 1 : 0;
