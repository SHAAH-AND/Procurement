'use strict';

// Signup validation, as a pure module.
//
// index.js cannot be tested: it requires the Catalyst SDK and the platform's
// Basic I/O objects. Everything that decides anything lives here instead, so
// the tests execute the real code rather than reading it. That distinction has
// already mattered twice on this project - tests that grepped source passed on
// code that was broken.
//
// The one rule this file exists to enforce: DENY unless a human has already
// approved this exact email address. Not "deny if suspicious" - deny, always,
// unless there is an Approved row. Every error path returns denial, because the
// alternative to a failed check is an open door.

const ALLOW = 'success';
const DENY = 'failure';

/** Twelve hours. Long enough for an admin asleep in another timezone. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The response Catalyst understands.
 *
 * Denial carries no reason: the person signing up is not necessarily the
 * person who should learn why, and "no such user" and "not approved yet" must
 * look identical to someone probing for valid addresses.
 */
const deny = () => ({ status: DENY });

const allow = (firstName, lastName) => ({
  status: ALLOW,
  user_details: {
    first_name: firstName || 'New',
    last_name: lastName || 'User'
  }
});

/**
 * Normalise an email for comparison.
 *
 * Addresses are matched case-insensitively, because Catalyst will happily hand
 * us `Person@Example.com` on Tuesday and `person@example.com` on Wednesday, and
 * an approval that only matches one of those is an approval that appears to
 * have been ignored.
 */
function normaliseEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 190) return null;
  // Deliberately strict rather than RFC-complete: this address is about to be
  // interpolated into ZCQL, and anything exotic is likelier to be an attack
  // than a customer.
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Pull the signup details out of whatever Catalyst passed us.
 *
 * Shape is documented as
 *   { request_type, request_details: { user_details: { email_id, ... } } }
 * but this runs on the far side of a platform boundary, so every level is
 * checked. A shape we do not recognise is not an error to report - it is a
 * signup to refuse.
 */
function readRequest(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const details = raw.request_details;
  if (!details || typeof details !== 'object') return null;

  const user = details.user_details;
  if (!user || typeof user !== 'object') return null;

  const email = normaliseEmail(user.email_id);
  if (!email) return null;

  // request_type is only ever documented as 'add_user'. Anything else is a
  // flow this function was not written for, and guessing is how a gate becomes
  // decorative.
  if (raw.request_type && raw.request_type !== 'add_user') return null;

  return {
    email,
    firstName: typeof user.first_name === 'string' ? user.first_name.slice(0, 100) : '',
    lastName: typeof user.last_name === 'string' ? user.last_name.slice(0, 100) : ''
  };
}

/** ZCQL has no bound parameters, so every value is escaped by hand. */
function zq(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    throw new TypeError('refusing to interpolate an object into ZCQL');
  }
  return String(value).replace(/'/g, "''");
}

/**
 * A token for the approval link.
 *
 * crypto.randomUUID is available on node20 and is a CSPRNG. Math.random is not
 * and must never appear here: the token is the only thing standing between a
 * stranger and an approved account.
 */
function makeToken(crypto) {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

/**
 * Decide whether this signup may proceed.
 *
 * `deps` carries everything that touches the outside world, so the tests can
 * supply their own and assert on what was attempted.
 */
async function decide(rawRequest, deps) {
  const { zcql, sendMail, crypto, now, config, log } = deps;

  const request = readRequest(rawRequest);
  if (!request) {
    log('rejected: unrecognised or invalid signup payload');
    return { response: deny(), recorded: false };
  }

  const { email } = request;

  // Has a human already approved this address?
  //
  // Read before write. An approved person signing in for a second time must
  // not be turned away because the first attempt left a Pending row.
  let rows;
  try {
    rows = await zcql(
      `SELECT ROWID, Status, Attempts FROM SignupRequests WHERE Email = '${zq(email)}'`
    );
  } catch (err) {
    // The database is the only thing that knows whether this person was
    // approved. Without it there is no evidence of approval, so there is no
    // approval.
    log(`denied ${email}: could not read SignupRequests - ${err && err.message}`);
    return { response: deny(), recorded: false };
  }

  const existing = (rows || [])
    .map(r => r.SignupRequests)
    .filter(Boolean)[0] || null;

  if (existing && String(existing.Status) === 'Approved') {
    log(`allowed ${email}: previously approved`);
    return { response: allow(request.firstName, request.lastName), recorded: true, approved: true };
  }

  if (existing && String(existing.Status) === 'Rejected') {
    // A rejection is a decision, not a rate limit. Re-applying does not undo
    // it, and does not send the admin another email either.
    log(`denied ${email}: previously rejected`);
    return { response: deny(), recorded: true };
  }

  // Pending, or never seen. Either way the answer is no - but the admin should
  // hear about it, and only once.
  if (existing) {
    const attempts = Number(existing.Attempts || 1) + 1;
    try {
      await zcql(
        `UPDATE SignupRequests SET Attempts = ${Number.isFinite(attempts) ? attempts : 2} ` +
        `WHERE ROWID = ${zq(existing.ROWID)}`
      );
    } catch (err) {
      log(`could not bump attempts for ${email}: ${err && err.message}`);
    }
    log(`denied ${email}: already pending, no new email sent`);
    return { response: deny(), recorded: true, alreadyPending: true };
  }

  // First time. Record it, then ask a human.
  const token = makeToken(crypto);
  const expiresAt = new Date(now() + TOKEN_TTL_MS);

  // Which workspace this belongs to. This installation has exactly one, so a
  // failure here is not worth denying over - the request is still recorded and
  // still requires approval, it just carries no OrgID.
  let orgId = null;
  try {
    const orgs = await zcql('SELECT ROWID FROM Organizations');
    orgId = (orgs || []).map(r => r.Organizations).filter(Boolean)[0]?.ROWID || null;
  } catch (err) {
    log(`could not resolve the workspace for ${email}: ${err && err.message}`);
  }

  try {
    await zcql(
      `INSERT INTO SignupRequests (Email, FullName, Status, Token, ExpiresAt, Attempts, OrgID) ` +
      `VALUES ('${zq(email)}', '${zq(`${request.firstName} ${request.lastName}`.trim())}', ` +
      `'Pending', '${zq(token)}', '${zq(formatStamp(expiresAt))}', 1, '${zq(orgId)}')`
    );
  } catch (err) {
    // Without a stored token the approval link cannot work, so sending one
    // would be worse than sending nothing.
    log(`denied ${email}: could not record the request - ${err && err.message}`);
    return { response: deny(), recorded: false };
  }

  // The email is a courtesy, not part of the decision. If it fails the request
  // is still recorded and still pending, and the admin can find it in the app.
  //
  // A failure here is invisible in practice: the workflow depends on somebody
  // receiving that link, and application logs are not retrievable on this
  // platform. So the error is returned to the caller, which records it where
  // an administrator can actually read it.
  let mailError = null;
  try {
    await sendMail(buildMail(email, request, token, config));
    log(`denied ${email}: pending approval, admin notified`);
  } catch (err) {
    mailError = (err && err.message) || String(err);
    log(`recorded ${email} but could not email the admin - ${mailError}`);
  }

  return { response: deny(), recorded: true, token, mailError };
}

/** Catalyst datetime wants 'YYYY-MM-DD HH:MM:SS'. */
function formatStamp(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ` +
         `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;
}

/**
 * Escape for HTML.
 *
 * The name and email come from whoever is signing up, and land in an email the
 * administrator opens. Treat both as hostile.
 */
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMail(email, request, token, config) {
  const approve = `${config.appOrigin}/server/${config.apiName}/api/signup/approve` +
                  `?token=${encodeURIComponent(token)}`;
  const reject = `${config.appOrigin}/server/${config.apiName}/api/signup/reject` +
                 `?token=${encodeURIComponent(token)}`;

  const name = `${request.firstName} ${request.lastName}`.trim() || '(no name given)';

  return {
    from_email: config.fromEmail,
    to_email: config.adminEmails,
    subject: `${config.appName}: access request from ${email}`,
    html_mode: true,
    display_name: config.appName,
    content: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
        <h2 style="margin:0 0 4px">Someone requested access</h2>
        <p style="color:#555;margin:0 0 20px">
          They cannot sign in unless you approve. Ignoring this email denies them.
        </p>
        <table style="border-collapse:collapse;margin-bottom:24px">
          <tr><td style="padding:4px 16px 4px 0;color:#666">Email</td>
              <td style="padding:4px 0"><strong>${esc(email)}</strong></td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666">Name given</td>
              <td style="padding:4px 0">${esc(name)}</td></tr>
        </table>
        <p style="margin:0 0 8px">
          <a href="${esc(approve)}"
             style="background:#127a3d;color:#fff;padding:11px 20px;border-radius:6px;
                    text-decoration:none;display:inline-block">Approve access</a>
          <a href="${esc(reject)}"
             style="background:#fff;color:#b3261e;padding:10px 19px;border-radius:6px;
                    text-decoration:none;display:inline-block;border:1px solid #b3261e;
                    margin-left:8px">Reject</a>
        </p>
        <p style="color:#888;font-size:13px;margin-top:20px">
          This link works once and expires in 12 hours. Approving lets them sign
          in with no permissions - you still choose their role in Settings.
        </p>
      </div>`
  };
}

/**
 * Read configuration from the environment.
 *
 * Returns null when anything required is missing, because a gate that cannot
 * reach an administrator should not be quietly approving people. The caller
 * denies in that case.
 */
function readConfig(env) {
  const admins = String(env.SIGNUP_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!admins.length) return null;

  // An ORIGIN, not a page. The approval links are built by appending
  // /server/<api>/api/signup/... to this, so a value like
  // "https://host/app/index.html" produces a dead link - and it is the natural
  // thing to paste, because it is the URL in the address bar. Rejecting it
  // here turns a silently broken email into a startup error in the log.
  const appOrigin = String(env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(appOrigin)) return null;

  return {
    adminEmails: admins,
    // Catalyst only sends from a verified address; falling back to the first
    // administrator is the one address we know is real.
    fromEmail: String(env.SIGNUP_FROM_EMAIL || admins[0]).trim(),
    appOrigin,
    appName: String(env.APP_NAME || 'ProcureFlow').slice(0, 60),
    apiName: String(env.API_FUNCTION_NAME || 'procurement_api').slice(0, 60)
  };
}

module.exports = {
  decide, readRequest, normaliseEmail, readConfig, buildMail,
  makeToken, formatStamp, esc, zq, allow, deny,
  TOKEN_TTL_MS
};
