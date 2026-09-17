'use strict';

const express = require('express');
const cors = require('cors');
const catalyst = require('zcatalyst-sdk-node');
const multer = require('multer');
const crypto = require('crypto');
const { Readable } = require('stream');
const { getPack, workflowFor, subCategoriesFor } = require('./industry-packs');
// Supplier-facing letters (RFQ/RFP invitation, award, regret) in the group's
// own wording.
const correspondence = require('./correspondence');
// Only the resolver is still used: it turns the hotel pack's capability
// defaults into the flag set the UI reads. The registry browser and the
// per-tenant override editor went with the platform console.
const { resolveCapabilities } = require('./capabilities');

// Sender address for outbound platform mail. Catalyst only accepts a verified
// sender, so this must be an address confirmed in the Catalyst console
// (Settings -> Email). Overridable per environment.
const MAIL_FROM = process.env.MAIL_FROM || 'sulaiman@cloudpartners.biz';

// ---- Error surfacing ---------------------------------------------------
// An error reaching a client must never carry internal detail. A raw Catalyst
// or ZCQL failure has the query text, table names and column layout in its
// message — handing that to a browser is free reconnaissance for anyone
// probing the API, and it is the customer's data model, not ours to disclose.
//
// So there are two kinds of error. Deliberate, user-facing ones are thrown as
// AppError and pass through verbatim, because we wrote that wording for the
// person reading it. Everything else is unexpected: it gets logged in full
// server-side under a short reference and replaced with a generic message
// carrying that reference, so support can find the real stack trace without
// the user ever seeing it.
class AppError extends Error {
  constructor(message, { status = 400, code } = {}) {
    super(message);
    this.name = 'AppError';
    this.expose = true;
    this.status = status;
    this.code = code;
  }
}

function fail(res, err, fallbackStatus = 500) {
  if (err && err.expose) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    return res.status(err.status || fallbackStatus).json(body);
  }
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[err:${ref}]`, err && err.stack ? err.stack : err);
  return res.status(fallbackStatus).json({
    error: `Something went wrong on our side. Quote reference ${ref} if you contact support.`,
    code: 'INTERNAL_ERROR',
    reference: ref
  });
}

// ---- Datastore column guard -------------------------------------------
// Catalyst rejects a whole insert/update with the opaque message
// "Invalid input value for column name" when the payload carries a key the
// table does not have. That hides which key was wrong, so this map lets us
// name the offender in logs and drop it instead of failing the request.
//
// Only tables written with a fixed payload are listed; anything absent is
// passed through untouched.
const TABLE_COLUMNS = {
  ApprovalHistory: ['OrgID','RecordType','RecordID','Action','ActorEmail','Reason'],
  Assets: ['OrgID','PropertyID','Name','SourcePRID','Value','Category','AcquisitionDate','Status'],
  Attachments: ['OrgID','RecordType','RecordID','FileID','FileName','FileSize','UploadedBy','ObjectKey'],
  AuditLog: ['OrgID','ActorEmail','Action','RecordType','RecordID','Detail'],
  Bids: ['OrgID','RFQID','VendorID','TotalBidAmount','ProposalNotes','Status'],
  BudgetPeriods: ['OrgID','BudgetID','PeriodLabel','BudgetedAmount','SpentAmount'],
  Budgets: ['OrgID','Department','Amount','FiscalYear','Spent','Status','PropertyID','Committed','ExpenseType'],
  CustomFields: ['OrgID','Module','FieldName','FieldType','Options','Status'],
  CustomModules: ['OrgID','ModuleName','FieldsSchema','Status'],
  DashboardConfigs: ['OrgID','Name','RoleID','ProfileID','WidgetsJson','IsDefault'],
  GRNItems: ['OrgID','GRNID','ItemID','QuantityReceived','QuantityAccepted','QuantityRejected'],
  GRNs: ['OrgID','GRNNumber','POID','ReceivedDate','ReceivedByID','PropertyID'],
  Integrations: ['OrgID','Provider','Status','ConfigJson','LastSyncAt','LastLogJson'],
  Invoices: ['OrgID','InvoiceNumber','POID','SupplierInvoiceDate','Amount','Status','MatchScore','CustomFieldsJson','PropertyID'],
  Items: ['OrgID','SKU','Name','Description','UnitPrice','Category','CustomFieldsJson','ItemType','Unit','PreferredVendorID','ExpenseType'],
  Organizations: ['Name','Domain','Status','Settings'],
  Payments: ['OrgID','InvoiceID','AmountPaid','PaymentDate','PaymentMode','ReferenceNumber'],
  PdfTemplates: ['OrgID','Module','TemplateName','ConfigJson','IsDefault'],
  POItems: ['OrgID','POID','ItemID','Quantity','UnitPrice'],
  POs: ['OrgID','PONumber','PRID','SupplierID','TotalAmount','Status','Terms','CustomFieldsJson','ExpectedDate','DeliveryDate','DeliveryAddress','ReferenceNo','Notes','TaxTotal','DiscountTotal','PropertyID','VendorDecision','VendorNote'],
  PRItems: ['OrgID','PRID','ItemID','Quantity','EstimatedPrice','ExpenseType','TaxPct','DiscountPct','Category'],
  Profiles: ['OrgID','ProfileName','Description','Permissions'],
  Properties: ['OrgID','Name','Location','Cluster','Currency','FiscalYearStart','Status'],
  PropertyAssignments: ['OrgID','UserID','PropertyID'],
  PRs: ['OrgID','PRNumber','Justification','CurrentApproverID','RequestorID','TotalAmount','Status','CustomFieldsJson','ExpenseType','Category','ExpectedDate','DeliveryAddress','ReferenceNo','Notes','TaxTotal','DiscountTotal','PropertyID','Department','ApprovalLevel'],
  RecurringBills: ['OrgID','VendorID','Amount','Frequency','StartDate','EndDate','Status'],
  RFQs: ['OrgID','RFQNumber','PRID','Status','Deadline','Notes'],
  RFQVendors: ['OrgID','RFQID','VendorID'],
  Roles: ['OrgID','RoleName','Permissions','ReportsToRoleID','Description'],
  Suppliers: ['OrgID','Name','ContactEmail','Phone','Address','Rating','Status','CustomFieldsJson','Scope','PropertyID'],
  SupportSessions: ['TokenHash','OrgID','DeveloperEmail','Reason','ExpiresAt','RevokedAt'],
  SupportTickets: ['OrgID','TicketNo','Subject','Description','Severity','Status','Category','AssignedTo','RaisedBy','Resolution','NotesJson','ResolvedAt'],
  UsageCounters: ['OrgID','Period','Calls'],
  Users: ['OrgID','Email','FullName','RoleID','ApprovalLimit','Status','ProfileID'],
  VendorBankAccounts: ['OrgID','VendorID','BankName','AccountNumber','RoutingInfo','AccountName'],
  VendorContacts: ['OrgID','VendorID','Name','Email','Phone','Designation'],
  VendorCredits: ['OrgID','VendorID','CreditAmount','Balance','ReferenceNumber','Reason','Status'],
  VendorPortalAccess: ['OrgID','VendorID','Email','CodeHash','Status','InviteToken','InviteExpiresAt','LastLoginAt'],
  VendorSessions: ['TokenHash','OrgID','VendorID','ExpiresAt']
};
const SYSTEM_COLUMNS = ['ROWID', 'CREATORID', 'CREATEDTIME', 'MODIFIEDTIME'];

// Strip keys the table does not have, logging each one so the real cause is
// visible in the function logs rather than surfacing as a generic 500.
function sanitizeRow(tableName, row) {
  const allowed = TABLE_COLUMNS[tableName];
  if (!allowed || !row || typeof row !== 'object') return row;
  const valid = new Set([...allowed, ...SYSTEM_COLUMNS]);
  const clean = {};
  const dropped = [];
  for (const [k, v] of Object.entries(row)) {
    if (valid.has(k)) clean[k] = v;
    else dropped.push(k);
  }
  if (dropped.length) {
    console.warn(`[Schema] ${tableName}: dropped unknown column(s) -> ${dropped.join(', ')}`);
  }
  return clean;
}

// Wrap datastore().table(name) so every write is sanitized automatically.
function safeTable(app, tableName) {
  const t = app.datastore().table(tableName);
  return {
    insertRow: (row) => t.insertRow(sanitizeRow(tableName, row)),
    insertRows: (rows) => t.insertRows((rows || []).map(r => sanitizeRow(tableName, r))),
    updateRow: (row) => t.updateRow(sanitizeRow(tableName, row)),
    updateRows: (rows) => t.updateRows((rows || []).map(r => sanitizeRow(tableName, r))),
    deleteRow: (id) => t.deleteRow(id)
  };
}

const app = express();

// ---- Security headers --------------------------------------------------
// Applied to every response including errors and 429s, so there is no path
// out of this function that skips them. These are API responses: they carry
// tenant data as JSON and are never meant to be framed, sniffed, cached by a
// shared proxy, or to leak their URL to a third party via Referer.
app.disable('x-powered-by'); // don't advertise the framework/version
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Catalyst terminates TLS and serves this origin over HTTPS only; HSTS stops
  // a downgrade attempt before it reaches us.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Responses are tenant-scoped. Nothing here may sit in a shared or browser
  // cache where the next user of the machine could read it back.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  // An API response has no legitimate reason to execute anything.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

// File Store folder that holds record attachments — only the LEGACY fallback
// path (primary storage is the Stratus bucket). Project-specific, so overridable
// via env; empty/invalid just means the File-Store fallback is unavailable and
// uploads go to Stratus (getStratusBucket) as normal.
const ATTACHMENTS_FOLDER_ID = process.env.ATTACHMENTS_FOLDER_ID || '';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Zoho Books OAuth (shared app "POS & Procurement") ────────────────────────
// One registered OAuth client for the whole platform. Each customer connects
// their OWN Zoho Books org by signing in through Zoho's consent screen (the
// authorization-code flow) — they never paste client credentials or refresh
// tokens. We exchange the returned code for a per-org refresh token and store
// that (encrypted-at-rest in the Integrations table). A Cloud Scale Connection
// named "books" (created in the console with full Books scope) is the source of
// truth for the scopes; these constants drive the OAuth handshake itself.
const BOOKS_OAUTH = {
  // The client ID is public — it travels in the consent URL the customer sees —
  // so a baked-in default is harmless. The SECRET never lives in source: it is
  // read from the function's environment (Catalyst console → Functions →
  // procurement_api → Configuration → Environment Variables).
  clientId: process.env.BOOKS_CLIENT_ID || '1000.OJ6E0KHTHUC2P3NXQGZQFHS6QP2D5X',
  clientSecret: process.env.BOOKS_CLIENT_SECRET || '',
  // Full-access Books scope (matches the "books" connection). ZohoBooks.fullaccess.all
  // covers contacts (vendors), items and bills — everything we push.
  scope: 'ZohoBooks.fullaccess.all',
  connectionName: 'books'
};

// Books is an optional integration: a deployment without the secret simply
// cannot offer it. Every Books route checks this first so a misconfigured
// deploy fails loudly with a clear message, instead of half-working and
// surfacing an opaque OAuth error from Zoho's side.
function booksConfigured() {
  return Boolean(BOOKS_OAUTH.clientId && BOOKS_OAUTH.clientSecret);
}
const BOOKS_NOT_CONFIGURED =
  'Zoho Books is not configured on this deployment. Set BOOKS_CLIENT_SECRET in the function environment variables.';
// The canonical public origin of this deployment. Every absolute URL we hand
// to a browser or an email is built from it, so moving to a new domain is one
// environment variable rather than a hunt through the source.
//
// Note this is deliberately NOT derived from req.headers.host: the Books
// redirect URI must byte-match a value registered in the Zoho API console, and
// a header an attacker controls must never decide where an OAuth code is sent.
const APP_ORIGIN = String(process.env.APP_ORIGIN || 'https://procurement.cloudhub.lk').replace(/\/$/, '');

// The OAuth redirect (callback) URL. Must EXACTLY match an Authorized Redirect
// URI registered on the client in the Zoho API console. Zoho accepts several
// per client, so the old *.catalystserverless.com URI can stay registered
// alongside this one and both hosts keep working during a domain move.
const BOOKS_REDIRECT_URI = process.env.BOOKS_REDIRECT_URI
  || `${APP_ORIGIN}/server/procurement_api/api/integrations/books/callback`;
// Where to bounce the admin back to in the web app after the consent round-trip.
const BOOKS_RETURN_URL = process.env.BOOKS_RETURN_URL
  || `${APP_ORIGIN}/app/index.html#/settings?tab=integrations`;

// Enable CORS and JSON parsing.
// We REFLECT the caller's Origin (rather than only allowing localhost). This is
// required for the vendor portal: when the portal page and the function are on
// different origins, the browser treats /server calls as cross-origin, and if
// the actual response carries no Access-Control-Allow-Origin the browser hides
// the JSON body from JS — so a login 401 surfaces as a contentless
// "Request failed (401)" instead of the real "Invalid email or access code".
// Reflecting the exact Origin (not "*") keeps Allow-Credentials:true valid for
// the cookie-based main app while also unblocking the bearer-token vendor portal.
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost(:\d+)?|[a-z0-9-]+\.(catalystserverless|zohostratus|catalyst\.zoho|zoho)\.com)$/i;

// Custom domains. A mapped domain (procurement.cloudhub.lk) is NOT matched by
// the pattern above, so without this a page served from it would have its API
// responses stripped of Allow-Origin and the browser would hide the JSON body —
// surfacing as a contentless "Request failed", exactly the class of bug the
// vendor portal already hit once. Comma-separated, so mapping the next domain
// is an environment change and not a redeploy.
const EXTRA_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || 'https://procurement.cloudhub.lk')
    .split(',').map(s => s.trim().replace(/\/$/, '').toLowerCase()).filter(Boolean)
);
const originAllowed = o => ALLOWED_ORIGIN_RE.test(o) || EXTRA_ORIGINS.has(o.toLowerCase());

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    // X-Vendor-Token is the vendor portal's own credential: the Catalyst
    // gateway intercepts Bearer tokens upstream, so vendor sessions travel in
    // a custom header and it has to survive preflight.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vendor-Token');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});
app.use(express.json({ limit: '2mb' }));

// 0. Rate limiter — in-memory sliding window per client IP. Protects against
// bursts/abuse. (Per-instance; adequate for this workload. A distributed limiter
// would use Catalyst Cache.)
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 240; // requests / minute / IP
const rateBuckets = new Map();
app.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_MAX) {
    res.setHeader('Retry-After', Math.ceil((RATE_WINDOW_MS - (now - bucket.start)) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  // Opportunistic cleanup to bound memory.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now - v.start > RATE_WINDOW_MS) rateBuckets.delete(k);
  }
  next();
});

// 1. Catalyst SDK Initializer Middleware
app.use((req, res, next) => {
  try {
    // We use Admin Scope by default to perform high-privilege multi-tenant logic and ignore app-user restrictions
    req.catalystApp = catalyst.initialize(req, { scope: 'admin' });
    next();
  } catch (err) {
    console.error('Failed to initialize Catalyst SDK:', err);
    res.status(500).json({ error: 'Failed to initialize database connectivity' });
  }
});

// Approval-timeline writer (separate from the general audit log).
async function approvalHistory(req, recordType, recordId, action, reason) {
  try {
    await safeTable(req.catalystApp, 'ApprovalHistory').insertRow({
      OrgID: req.orgId,
      RecordType: recordType,
      RecordID: String(recordId),
      Action: action,
      ActorEmail: req.authUser?.email || 'system',
      Reason: reason || ''
    });
  } catch (e) { console.warn('[ApprovalHistory] write failed:', e.message); }
}

// Budget reservation helpers (used by PR submit / reject / recall / resubmit).
// Budget tracks three numbers: Amount (allocated), Committed (reserved by
// requisitions/POs not yet invoiced) and Spent (actual, invoiced). Requisition
// reservation moves money into Committed; reject/recall releases it.
// Resolve the ONE budget a requisition reserves against. Must mirror the
// matching used when the reservation is made (PR create): department AND
// property. Matching on department alone releases against a sibling
// property's budget on multi-property tenants, stranding the commitment.
async function findBudget(req, department, propertyId) {
  if (!department) return null;
  const zcql = req.catalystApp.zcql();
  let sql = `SELECT * FROM Budgets WHERE Department = '${zqRaw(department)}' AND OrgID = '${zqRaw(req.orgId)}' AND Status = 'Active'`;
  if (propertyId) sql += ` AND PropertyID = '${zqRaw(propertyId)}'`;
  const rows = await zcql.executeZCQLQuery(sql);
  return rows[0]?.Budgets || null;
}

async function reserveBudget(req, department, amount, propertyId) {
  if (!department || !amount) return;
  const b = await findBudget(req, department, propertyId);
  if (!b) return;
  await safeTable(req.catalystApp, 'Budgets').updateRow({ ROWID: b.ROWID, Committed: Number(b.Committed || 0) + amount });
}
async function releaseBudget(req, department, amount, propertyId) {
  if (!department || !amount) return;
  const b = await findBudget(req, department, propertyId);
  if (!b) return;
  await safeTable(req.catalystApp, 'Budgets').updateRow({ ROWID: b.ROWID, Committed: Math.max(0, Number(b.Committed || 0) - amount) });
}
// Settle a reservation into ACTUAL spend: when an invoice is logged the money is
// no longer a soft commitment, it's realized — move it from Committed to Spent.
// Without this, Committed grew forever and Spent stayed 0, so available
// (Amount − Committed − Spent) shrank permanently and never reflected real spend.
// Idempotency note: called once per invoice at creation.
async function settleBudget(req, department, amount, propertyId) {
  if (!department || !amount) return;
  const b = await findBudget(req, department, propertyId);
  if (!b) return;
  await safeTable(req.catalystApp, 'Budgets').updateRow({
    ROWID: b.ROWID,
    Committed: Math.max(0, Number(b.Committed || 0) - amount),
    Spent: Number(b.Spent || 0) + amount
  });
}
// Resolve the budget scope (department + property) for an invoice by walking
// Invoice → PO → PR. Both are needed: settling must target the same budget row
// the requisition reserved against.
async function budgetScopeForPO(req, poId) {
  if (!poId) return null;
  const zcql = req.catalystApp.zcql();
  const poRows = await zcql.executeZCQLQuery(`SELECT PRID FROM POs WHERE ROWID = '${zqRaw(poId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
  const prId = poRows[0]?.POs?.PRID;
  if (!prId) return null;
  const prRows = await zcql.executeZCQLQuery(`SELECT Department, PropertyID FROM PRs WHERE ROWID = '${zqRaw(prId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
  const pr = prRows[0]?.PRs;
  if (!pr?.Department) return null;
  return { department: pr.Department, propertyId: pr.PropertyID || '' };
}

// Fire-and-forget audit writer. Never blocks or fails a request.
async function audit(req, action, recordType, recordId, detail) {
  try {
    if (!req.orgId) return;
    await safeTable(req.catalystApp, 'AuditLog').insertRow({
      OrgID: req.orgId,
      ActorEmail: req.authUser?.email || 'system',
      Action: action,
      RecordType: recordType || '',
      RecordID: recordId ? String(recordId) : '',
      Detail: detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 9000) : ''
    });
  } catch (e) {
    console.warn('[Audit] write failed:', e.message);
  }
}

// Workflow webhooks — fire-and-forget POSTs to org-configured endpoints on
// business events. Configured in Settings → Automation → Webhooks and stored
// in Organizations.Settings.webhooks = [{ name, url, events[], secret, active }].
// An empty events array means "all events". Never blocks or fails a request.
function fireWebhooks(req, event, payload) {
  (async () => {
    try {
      if (!req.orgId) return;
      const zcql = req.catalystApp.zcql();
      const rows = await zcql.executeZCQLQuery(`SELECT Settings FROM Organizations WHERE ROWID = '${zqRaw(req.orgId)}'`);
      const hooks = (safeParse(rows[0]?.Organizations?.Settings, {}).webhooks || [])
        .filter(h => h && h.url && h.active !== false &&
          (!Array.isArray(h.events) || h.events.length === 0 || h.events.includes(event)));
      if (hooks.length === 0) return;
      const body = JSON.stringify({
        event,
        orgId: req.orgId,
        at: new Date().toISOString(),
        actor: req.authUser?.email || 'system',
        data: payload || {}
      });
      await Promise.allSettled(hooks.map(h => fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(h.secret ? { 'X-Webhook-Secret': h.secret } : {}) },
        body,
        signal: AbortSignal.timeout(6000)
      })));
    } catch (e) { console.warn('[Webhooks] fire failed:', e.message); }
  })();
}

// 2. Identity Middleware — resolves the logged-in Catalyst user SERVER-SIDE from the
// session credential on the request (cookie on same-domain Slate app, or auth token).
// Client-supplied identity headers (X-User-ID) are never trusted for authentication.
// The VENDOR-FACING /api/vendor-portal/* surface is its own auth universe (vendors
// have no Catalyst user account) — it is verified independently by vendorAuth()
// below, never by this Catalyst-user middleware or the org-tenant middleware that
// follows it. The ADMIN management endpoints (invite/revoke/access) are the
// exception: they are org-user actions and MUST run under the normal auth stack.
const VENDOR_PORTAL_ADMIN_PATHS = ['/api/vendor-portal/access', '/api/vendor-portal/invite', '/api/vendor-portal/revoke'];
const isVendorPortalPath = (p) => p.startsWith('/api/vendor-portal/') && !VENDOR_PORTAL_ADMIN_PATHS.includes(p);
// The Books OAuth callback is hit by the browser redirect FROM Zoho (no app
// session), so it can't run under the Catalyst-user / tenant middleware — it
// authenticates itself via the signed `state` (orgId + stored nonce) instead.
// /api/health is the deploy + connectivity probe. It is deliberately exempt from
// auth so the boot screen can tell "backend unreachable" apart from "not signed
// in" — the two need very different messages. It exposes no tenant data.
// The signup approve/reject links are opened from an email, which carries no
// session, so they cannot require authentication. The token in the URL is the
// credential instead: CSPRNG-generated, single-use and expiring. See
// signupdecision.js.
const AUTH_EXEMPT_PATHS = [
  '/api/integrations/books/callback',
  '/api/health',
  '/api/signup/approve',
  '/api/signup/reject'
];

// Bumped on each deploy so the browser can confirm which build it is talking to.
// Bumped on every deploy that changes this function, so /api/health can tell
// you WHICH build is live. It sat at 2.0.0 across two deploys, which is how a
// security fix stayed unnoticed in local-only limbo.
const BUILD_VERSION = '4.1.2-invitation-only-auth';

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'procurement_api',
    version: BUILD_VERSION,
    time: new Date().toISOString()
  });
});

// Deciding a pending signup, from a link in the notification email. Listed in
// AUTH_EXEMPT_PATHS above: a mail client carries no session, so the token is
// the credential. Answers with a page rather than JSON because a human is
// looking at it in a browser tab.
const signupDecision = require('./signupdecision');

const decisionDeps = catalystApp => ({
  zcql: q => catalystApp.zcql().executeZCQLQuery(q),
  esc: zqRaw,
  escId: value => {
    const s = String(value === null || value === undefined ? '' : value).trim();
    if (!/^\d{1,20}$/.test(s)) throw new Error(`Invalid record id: ${value}`);
    return s;
  },
  now: () => Date.now()
});

async function signupDecisionRoute(req, res, status) {
  try {
    const result = await signupDecision.handle(
      req.query && req.query.token, status, decisionDeps(req.catalystApp)
    );
    res.set('Content-Type', 'text/html; charset=utf-8').send(result.html);
  } catch (err) {
    console.error('[SignupDecision]', err);
    res.status(500)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(signupDecision.page(
        'Something went wrong',
        'The link could not be processed. Try again, or decide the request in the app.',
        'bad'
      ));
  }
}

app.get('/api/signup/approve', (req, res) => signupDecisionRoute(req, res, 'Approved'));
app.get('/api/signup/reject',  (req, res) => signupDecisionRoute(req, res, 'Rejected'));

app.use(async (req, res, next) => {
  if (isVendorPortalPath(req.path) || AUTH_EXEMPT_PATHS.includes(req.path)) return next();

  try {
    // A user-scoped app instance enforces strict user credentials: it throws when the
    // request carries no real user session, instead of silently falling back to the
    // platform admin credential (which the default/admin scope would allow).
    const userScopedApp = catalyst.initialize(req, { scope: 'user' });
    const me = await userScopedApp.userManagement().getCurrentUser();
    if (!me || !me.email_id) throw new Error('No session user');
    req.authUser = {
      email: String(me.email_id).toLowerCase(),
      firstName: me.first_name || '',
      lastName: me.last_name || '',
      catalystUserId: me.user_id
    };
    return next();
  } catch (err) {
    // Local-development escape hatch only: `catalyst serve` runs on localhost where no
    // hosted-login cookie exists. Production hosts can never match this check.
    const isLocalDev = /^localhost(:\d+)?$/.test(req.headers.host || '');
    if (isLocalDev && req.headers['x-dev-email']) {
      req.authUser = {
        email: String(req.headers['x-dev-email']).toLowerCase(),
        firstName: 'Dev',
        lastName: 'User',
        catalystUserId: 'local-dev'
      };
      return next();
    }
    return res.status(401).json({ error: 'Not authenticated. Please sign in.', code: 'UNAUTHENTICATED' });
  }
});

// 3. Workspace Context Middleware (SINGLE TENANT)
//
// This deployment serves ONE hotel group. There is exactly one Organizations
// row — "the workspace" — created by first-run setup. It is not a tenant to be
// selected: it is the installation.
//
// The OrgID columns remain on every table and every query still filters by
// them. That is deliberate. Dropping the column would mean rebuilding 36 tables
// in every customer project and rewriting ~270 query sites for no behavioural
// gain, while the column costs nothing and keeps the data self-describing in
// backups. What has gone is the SaaS machinery around it: no org switching, no
// X-Org-ID header, no membership arbitration, no suspension gates, no billing.
const SETUP_PATHS = ['/api/sync-user', '/api/setup'];

let workspaceCache = null;
let workspaceCachedAt = 0;
const WORKSPACE_TTL_MS = 60 * 1000;

/** The one and only Organizations row, or null before first-run setup. */
async function getWorkspace(app, opts = {}) {
  if (!opts.fresh && workspaceCache && (Date.now() - workspaceCachedAt) < WORKSPACE_TTL_MS) {
    return workspaceCache;
  }
  const rows = await app.zcql().executeZCQLQuery('SELECT * FROM Organizations');
  const orgs = rows.map(r => r.Organizations)
    .sort((a, b) => String(a.ROWID).localeCompare(String(b.ROWID)));
  if (orgs.length > 1) {
    // Should be impossible in a single-tenant install. Take the oldest and say
    // so loudly rather than silently serving a different workspace per request.
    console.warn(`[Workspace] ${orgs.length} Organizations rows found; using ${orgs[0].ROWID}. This install should have exactly one.`);
  }
  workspaceCache = orgs[0] || null;
  workspaceCachedAt = Date.now();
  return workspaceCache;
}

function invalidateWorkspace() {
  workspaceCache = null;
  workspaceCachedAt = 0;
}

/**
 * Create a Users row for somebody who was invited through the Catalyst console
 * and has just signed in for the first time.
 *
 * The invitation is the authorisation. Public signup is off, so Catalyst will
 * only ever authenticate an account an administrator deliberately created —
 * which means the person on the other end of this call has already been let in
 * by a human. Making them fill in a form to be told "ask an administrator",
 * when an administrator is precisely who invited them, helps nobody.
 *
 * What this must not do is hand out authority. The row is created with:
 *
 *   - the LEAST privileged profile in the workspace, not the administrator one
 *   - the role that sits lowest in the hierarchy, so they are not slotted into
 *     an approval rung nobody assigned them to
 *   - an approval limit of zero, so they cannot approve spend
 *
 * An administrator then promotes them in Settings → Users. The effect is that a
 * new arrival can sign in and look around immediately, and can do nothing
 * consequential until somebody says so.
 *
 * Returns the new row, or null if the workspace has no roles or profiles yet —
 * in which case the caller falls through to the normal refusal.
 */
async function provisionInvitedUser(catalystApp, orgId, authUser) {
  if (!authUser?.email) return null;

  try {
    const zcql = catalystApp.zcql();

    const [profileRows, roleRows] = await Promise.all([
      zcql.executeZCQLQuery(`SELECT * FROM Profiles WHERE OrgID = '${zqRaw(orgId)}'`),
      zcql.executeZCQLQuery(`SELECT * FROM Roles WHERE OrgID = '${zqRaw(orgId)}'`)
    ]);

    const profiles = profileRows.map(r => r.Profiles);
    const roles = roleRows.map(r => r.Roles);
    if (!profiles.length || !roles.length) return null;

    // The least privileged profile: the one granting the fewest permissions,
    // and never the administrator profile whatever it happens to be called.
    const rank = p => {
      const perms = safeParse(p.Permissions, {});
      if (perms['*']) return 99;
      return ['view', 'create', 'edit', 'approve'].filter(k => perms[k]).length;
    };
    const viewerProfile = profiles
      .filter(p => !safeParse(p.Permissions, {})['*'])
      .sort((a, b) => rank(a) - rank(b))[0] || null;
    if (!viewerProfile) return null;

    // The entry-level role, named explicitly rather than inferred.
    //
    // The first version of this walked the hierarchy for a role nothing reports
    // to, on the assumption it was a tree. The seeded hierarchy is a cycle —
    // Board → CEO → Committee → Central Procurement → GM → Finance → Purchasing
    // Manager → HoD → Administrator → Board — so the only role with nothing
    // reporting to it was Administrator, and every new arrival would have been
    // made one. Caught by running the rule against the real production roles.
    //
    // Naming the role is duller and correct. "Head of the department" is where
    // requisitions start, so it is the right floor: someone can raise a request
    // and see their own department, and approve nothing, because the approval
    // limit below is zero.
    const ENTRY_ROLE_NAMES = ['Head of the department', 'Requester', 'Staff', 'User'];
    // Roles that must never be handed out automatically, whatever the data says.
    const NEVER_AUTO = /administrator|board|chief|ceo|director|committee/i;

    let leafRole = null;
    for (const wanted of ENTRY_ROLE_NAMES) {
      leafRole = roles.find(r =>
        String(r.RoleName).toLowerCase() === wanted.toLowerCase());
      if (leafRole) break;
    }
    // Nothing recognised: fall back to any role that is clearly not senior,
    // and refuse rather than guess if none qualifies.
    if (!leafRole) {
      leafRole = roles.find(r => !NEVER_AUTO.test(String(r.RoleName))) || null;
    }
    if (!leafRole || NEVER_AUTO.test(String(leafRole.RoleName))) {
      console.warn(
        `[Provision] No safe entry-level role found for ${authUser.email}; ` +
        'refusing to auto-provision. An administrator should add them manually.'
      );
      return null;
    }

    const fullName = [authUser.firstName, authUser.lastName].filter(Boolean).join(' ')
      || authUser.email;

    const created = await safeTable(catalystApp, 'Users').insertRow({
      Email: authUser.email,
      FullName: fullName,
      OrgID: String(orgId),
      RoleID: String(leafRole.ROWID),
      ProfileID: String(viewerProfile.ROWID),
      Status: 'Active',
      // Zero, explicitly. A default limit would let a brand-new account approve
      // spend before anyone reviewed who they are.
      ApprovalLimit: 0
    });

    console.log(
      `[Provision] Created a Users row for ${authUser.email} with role ` +
      `"${leafRole.RoleName}", profile "${viewerProfile.ProfileName}" and no ` +
      `approval limit. An administrator should review this in Settings > Users.`
    );

    // Visible in the audit log, not only in function logs: somebody gaining
    // access to a procurement system is worth a record the customer can read.
    try {
      await safeTable(catalystApp, 'AuditLog').insertRow({
        OrgID: String(orgId),
        ActorEmail: authUser.email,
        Action: 'user_auto_provisioned',
        RecordType: 'User',
        RecordID: String(created.ROWID),
        Detail: JSON.stringify({
          role: leafRole.RoleName,
          profile: viewerProfile.ProfileName,
          approvalLimit: 0,
          reason: 'First sign-in after a console invitation'
        })
      });
    } catch (auditErr) {
      // An audit write failing must not deny somebody access they are entitled
      // to; the console log above still records it.
      console.error('[Provision] audit row failed:', auditErr?.message);
    }

    return created;
  } catch (err) {
    // A race — two tabs opening at once — means the row now exists. Read it
    // back rather than failing the request.
    try {
      const zcql = catalystApp.zcql();
      const again = await zcql.executeZCQLQuery(
        `SELECT * FROM Users WHERE OrgID = '${zqRaw(orgId)}' AND Email = '${zqRaw(authUser.email)}'`
      );
      if (again[0]?.Users) return again[0].Users;
    } catch { /* fall through */ }

    console.error('[Provision] could not create a Users row:', err?.message);
    return null;
  }
}

app.use(async (req, res, next) => {
  if (isVendorPortalPath(req.path) || AUTH_EXEMPT_PATHS.includes(req.path)) return next();

  try {
    const zcql = req.catalystApp.zcql();
    const workspace = await getWorkspace(req.catalystApp);

    req.workspace = workspace;
    req.orgId = workspace ? String(workspace.ROWID) : null;
    req.currentUser = null;
    req.propertyScope = null;

    // Before setup there is nothing to scope to; only the setup endpoints run.
    if (!workspace) {
      if (SETUP_PATHS.includes(req.path)) return next();
      return res.status(403).json({ error: 'This workspace has not been set up yet.', code: 'SETUP_REQUIRED' });
    }

    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM Users WHERE OrgID = '${zqRaw(req.orgId)}' AND Email = '${zqRaw(req.authUser.email)}'`
    );
    req.currentUser = rows[0]?.Users || null;

    if (!req.currentUser) {
      // Authentication proves who this is; it does not grant Procurement
      // access. Only a Users row created by an administrator invitation may
      // enter this workspace. Before first-run setup there is no membership
      // row yet, so and only so the setup endpoints remain reachable.
      if (!workspace && SETUP_PATHS.includes(req.path)) return next();
      return res.status(403).json({
        error: 'Your account does not have access to this workspace. Ask an administrator to add you.',
        code: 'NOT_A_MEMBER'
      });
    }

    // A row created by the in-app invitation flow becomes active only after
    // Catalyst has authenticated that exact email. Reaching this middleware is
    // the acceptance proof; inactive/suspended users remain blocked below.
    if (String(req.currentUser.Status) === 'Invited') {
      req.currentUser = await safeTable(req.catalystApp, 'Users').updateRow({
        ROWID: req.currentUser.ROWID,
        Status: 'Active'
      });
      await audit(req, 'user_invitation_accepted', 'User', req.currentUser.ROWID, {
        email: req.authUser.email
      });
    }

    if (String(req.currentUser.Status || 'Active') !== 'Active') {
      return res.status(403).json({ error: 'Your account has been deactivated.', code: 'USER_INACTIVE' });
    }

    // Property scope. A user with explicit PropertyAssignments sees only those
    // properties; a user with none is group-level and sees every property.
    // null = all properties; otherwise an array of allowed PropertyIDs.
    try {
      const asg = await zcql.executeZCQLQuery(
        `SELECT PropertyID FROM PropertyAssignments WHERE OrgID = '${zqRaw(req.orgId)}' AND UserID = '${zqRaw(req.currentUser.ROWID)}'`
      );
      if (asg.length > 0) req.propertyScope = asg.map(r => String(r.PropertyAssignments.PropertyID));
    } catch { /* no assignments table rows; treat as group-level */ }

    next();
  } catch (err) {
    console.error('[Workspace Middleware] Failed to resolve workspace context:', err);
    res.status(500).json({ error: 'Failed to resolve workspace context' });
  }
});

// 3b. Periodic maintenance.
//
// Per-org API metering used to live here — it existed to invoice tenants on a
// shared platform. One installation per customer means there is nothing to
// apportion, so the UsageCounters table, the rate cards and the consumption
// reports are gone. Catalyst already reports this project's own usage.
//
// What remains is the housekeeping that rode along with the flush cycle:
// expired vendor-portal sessions still need sweeping, and doing it here keeps
// the app free of a dedicated cron.
let lastMaintenance = 0;
const MAINTENANCE_INTERVAL_MS = 60 * 1000;

function scheduleMaintenance(app) {
  if (Date.now() - lastMaintenance < MAINTENANCE_INTERVAL_MS) return;
  lastMaintenance = Date.now();
  // Fire and forget: the request must never wait on housekeeping.
  // purgeExpiredVendorSessions is a hoisted function declaration defined later.
  Promise.resolve()
    .then(() => purgeExpiredVendorSessions(app))
    .catch(() => { /* best-effort */ });
}

app.use((req, res, next) => { try { scheduleMaintenance(req.catalystApp); } catch { /* never block */ } next(); });

// ZCQL string escape helper. Catalyst ZCQL does not expose bound parameters,
// so any user-supplied value interpolated into a query MUST be passed through
// this to prevent ZCQL injection. Strings are single-quoted with internal
// single-quotes doubled; non-strings are returned as-is (numbers/booleans).
function zq(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // Treat as a string — escape single quotes and backslashes
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
// Strip surrounding quotes because we interpolate the value inside an outer
// query already wrapped in single quotes in most call sites. Use zqRaw() for
// the raw escaped value WITHOUT quotes when building `col = '<val>'`.
function zqRaw(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
}
function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}

// Catalyst datetime columns require the format "yyyy-MM-dd HH:mm:ss" (local-ish,
// no "T", no milliseconds, no trailing "Z"). A raw `new Date().toISOString()`
// ("2026-07-17T14:30:00.000Z") or a bare date input ("2026-07-17") is REJECTED
// with "Invalid input value for <col>. datetime value expected". This coerces
// any Date / ISO string / date-only string into the accepted shape; falsy input
// defaults to "now". A date-only value gets " 00:00:00" appended.
function toCatalystDateTime(value) {
  let d;
  if (value === undefined || value === null || value === '') {
    d = new Date();
  } else if (value instanceof Date) {
    d = value;
  } else {
    const s = String(value).trim();
    // Bare "yyyy-MM-dd" → treat as midnight (avoids TZ-shifting the calendar day).
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
    // Already in "yyyy-MM-dd HH:mm:ss[.fff]" → normalise to seconds precision.
    const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
    if (m) return `${m[1]} ${m[2]}`;
    d = new Date(s);
  }
  if (isNaN(d.getTime())) d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// The Items table columns (besides system + OrgID) are exactly:
//   SKU, Name, Description, UnitPrice, Category, CustomFieldsJson,
//   ItemType, Unit, PreferredVendorID, ExpenseType
// Every one of these is written straight through — there is no "fallback that
// drops columns" any more (that silently lost Description/Category/etc. and was
// masking the real problem, which was the ExpenseType column simply not
// existing on the table — now it does).
function buildCatalogItemPayload(req, body) {
  const payload = {
    OrgID: req.orgId,
    SKU: String(body.SKU || '').trim(),
    Name: String(body.Name || '').trim(),
    UnitPrice: Number(body.UnitPrice)
  };
  if (body.Description !== undefined) payload.Description = String(body.Description).trim();
  if (body.Category !== undefined) payload.Category = String(body.Category).trim();
  if (body.ExpenseType === 'CapEx' || body.ExpenseType === 'OpEx') payload.ExpenseType = body.ExpenseType;
  if (body.ItemType === 'Goods' || body.ItemType === 'Service') payload.ItemType = body.ItemType;
  if (body.Unit !== undefined) payload.Unit = String(body.Unit).trim();
  if (body.PreferredVendorID !== undefined) payload.PreferredVendorID = String(body.PreferredVendorID).trim();
  if (body.CustomFields !== undefined) payload.CustomFieldsJson = JSON.stringify(body.CustomFields);
  return payload;
}

// Returns a ZCQL fragment that restricts a query to the caller's allowed
// properties, or '' when they are group-level (see req.propertyScope). Records
// with no PropertyID (group-wide) are always visible.
function propertyScopeClause(req, column = 'PropertyID') {
  if (!req.propertyScope || req.propertyScope.length === 0) return '';
  const ids = req.propertyScope.map(id => `'${zqRaw(id)}'`).join(', ');
  return ` AND (${column} IN (${ids}) OR ${column} IS NULL OR ${column} = '')`;
}
// True if the caller may act on a given PropertyID.
function canUseProperty(req, propertyId) {
  if (!propertyId) return true; // group-wide record
  if (!req.propertyScope) return true; // group-level user
  return req.propertyScope.map(String).includes(String(propertyId));
}

// 4. Access control — Zoho-style: a user's PROFILE carries a per-module
// permission matrix ({ module: { view, create, edit, delete, approve } });
// their ROLE carries only hierarchy (ReportsTo). Legacy role permission
// arrays keep working as a fallback until every user has a profile.
const LEGACY_PERM_MAP = {
  create_pr: ['prs', 'create'],
  approve_pr: ['prs', 'approve'],
  create_po: ['pos', 'create'],
  receive_grn: ['grns', 'create'],
  match_invoice: ['invoices', 'create']
};

async function checkAccess(req, moduleKey, action) {
  if (!req.currentUser) return { ok: false, reason: 'no user profile in this organization' };
  const zcql = req.catalystApp.zcql();

  // 1. Profile matrix (preferred)
  if (req.currentUser.ProfileID) {
    const pRows = await zcql.executeZCQLQuery(
      `SELECT * FROM Profiles WHERE ROWID = '${zqRaw(req.currentUser.ProfileID)}' AND OrgID = '${zqRaw(req.orgId)}'`
    );
    if (pRows.length > 0) {
      let matrix = {};
      try { matrix = JSON.parse(pRows[0].Profiles.Permissions || '{}'); } catch {}
      if (matrix['*'] === true) return { ok: true };
      const mod = matrix[moduleKey] || {};
      return mod[action] === true
        ? { ok: true }
        : { ok: false, reason: `your profile does not allow ${action} on ${moduleKey}` };
    }
  }

  // 2. Legacy role permission array (fallback)
  if (req.currentUser.RoleID) {
    const rRows = await zcql.executeZCQLQuery(
      `SELECT * FROM Roles WHERE ROWID = '${zqRaw(req.currentUser.RoleID)}' AND OrgID = '${zqRaw(req.orgId)}'`
    );
    if (rRows.length > 0) {
      let perms = [];
      try { perms = JSON.parse(rRows[0].Roles.Permissions || '[]'); } catch {}
      if (perms.includes('*')) return { ok: true };
      const legacyKey = Object.keys(LEGACY_PERM_MAP).find(k => {
        const [m, a] = LEGACY_PERM_MAP[k];
        return m === moduleKey && a === action;
      });
      if (legacyKey && perms.includes(legacyKey)) return { ok: true };
    }
  }
  return { ok: false, reason: `no profile or role grants ${action} on ${moduleKey}` };
}

function requirePermission(requiredPermission) {
  const [moduleKey, action] = LEGACY_PERM_MAP[requiredPermission] || requiredPermission.split('.');
  return async (req, res, next) => {
    try {
      const result = await checkAccess(req, moduleKey, action);
      if (result.ok) return next();
      return res.status(403).json({ error: `Access denied: ${result.reason}.` });
    } catch (err) {
      console.error('[RBAC Middleware] Error checking permissions:', err);
      res.status(500).json({ error: 'Internal RBAC authority verification error' });
    }
  };
}

// perm('module', 'action') — the general-purpose guard used everywhere.
function perm(moduleKey, action) {
  return async (req, res, next) => {
    try {
      const result = await checkAccess(req, moduleKey, action);
      if (result.ok) return next();
      return res.status(403).json({ error: `Access denied: ${result.reason}.` });
    } catch (err) {
      console.error('[RBAC] Error:', err);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

// Settings/admin actions require the 'settings' module (admins have '*').
const requireAdmin = perm('settings', 'edit');
const requireMastersCreate = perm('masters', 'create');


// ==========================================
// 🏢 ORGANIZATIONS ENDPOINTS
// ==========================================

// List tenant organizations for current user context
app.get('/api/organizations', async (req, res) => {
  try {
    if (!req.orgId) {
      return res.json([]);
    }
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Organizations WHERE ROWID = '${zqRaw(req.orgId)}'`);
    const orgs = rows.map(r => r.Organizations);

    // Self-heal: an org whose industry resolves to a multi-property pack but
    // was created before the flag existed gets multiProperty backfilled here,
    // so property management appears without re-onboarding.
    for (const org of orgs) {
      try {
        const s = JSON.parse(org.Settings || '{}');
        const pack = getPack(s.industry || s.industryPack);
        if (pack.multiProperty && !s.multiProperty) {
          s.multiProperty = true;
          org.Settings = JSON.stringify(s);
          await safeTable(req.catalystApp, 'Organizations').updateRow({ ROWID: org.ROWID, Settings: org.Settings });
        }
        // The app hides modules the tenant is not entitled to; ship the
        // resolved capability set alongside the org so the UI never has to
        // reimplement the default -> pack -> override precedence.
        org.capabilities = resolveCapabilities(pack, s);
        org.terminology = pack.terminology || {};
      } catch { /* leave settings as-is on parse errors */ }
    }
    res.json(orgs);
  } catch (err) {
    fail(res, err);
  }
});

// NOTE: there is deliberately no POST /api/organizations. A workspace is
// created once, by POST /api/setup, and this installation serves exactly one.

// Update the workspace (name, settings)
app.put('/api/organizations/:id', async (req, res) => {
  try {
    if (req.params.id !== req.orgId) {
      return res.status(403).json({ error: 'That is not this workspace.' });
    }

    const { Settings, Name } = req.body;
    const datastore = req.catalystApp.datastore();

    const updateData = { ROWID: req.params.id };
    if (Settings) updateData.Settings = typeof Settings === 'string' ? Settings : JSON.stringify(Settings);
    if (Name && String(Name).trim()) updateData.Name = String(Name).trim();

    const updatedOrg = await safeTable(req.catalystApp, 'Organizations').updateRow(updateData);
    invalidateWorkspace();   // the middleware caches the workspace for a minute
    res.json(updatedOrg);
  } catch (err) {
    fail(res, err);
  }
});


// ==========================================
// 🔑 ROLES & USER MANAGEMENT
// ==========================================

// Get all roles for active organization
app.get('/api/roles', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Roles WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.Roles));
  } catch (err) {
    fail(res, err);
  }
});

// Create hierarchy role (Zoho-style: role = position in reporting chain)
app.post('/api/roles', requireAdmin, async (req, res) => {
  try {
    const { RoleName, Permissions, ReportsToRoleID, Description } = req.body;
    if (!RoleName) return res.status(400).json({ error: 'RoleName is required' });

    const table = safeTable(req.catalystApp, 'Roles');
    const newRole = await table.insertRow({
      OrgID: req.orgId,
      RoleName,
      Description: Description || '',
      ReportsToRoleID: ReportsToRoleID || null,
      Permissions: Permissions ? JSON.stringify(Permissions) : '[]'
    });

    res.status(201).json(newRole);
  } catch (err) {
    fail(res, err);
  }
});

// Update a role (rename / re-parent in the hierarchy)
app.put('/api/roles/:id', requireAdmin, async (req, res) => {
  try {
    const { RoleName, ReportsToRoleID, Description } = req.body;
    if (ReportsToRoleID && String(ReportsToRoleID) === String(req.params.id)) {
      return res.status(400).json({ error: 'A role cannot report to itself.' });
    }
    const updateData = { ROWID: req.params.id };
    if (RoleName !== undefined) updateData.RoleName = RoleName;
    if (Description !== undefined) updateData.Description = Description;
    if (ReportsToRoleID !== undefined) updateData.ReportsToRoleID = ReportsToRoleID || null;
    const updated = await safeTable(req.catalystApp, 'Roles').updateRow(updateData);
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

// Get all users for active organization
// Environment readiness is only useful to an administrator on the Users
// screen. Keep it out of the public health probe, which deliberately exposes
// only deploy liveness and version information.
app.get('/api/users/invitation-status', requireAdmin, (req, res) => {
  res.json({ configured: Boolean(String(process.env.PROCUREFLOW_AUTH_ZAID || '').trim()) });
});

app.get('/api/users', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Users WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.Users));
  } catch (err) {
    fail(res, err);
  }
});

// Boot handshake. Tells the client which of three states it is in:
//   setupRequired  — no workspace yet; run first-run setup
//   user: null     — workspace exists but this account was never invited
//   user: {...}    — signed in and a member
// Identity comes exclusively from the authenticated session; the body is ignored.
//
// There is no separate operator console: one installation per customer means
// the people who run the hotel are the only people who need to get in, and
// they are managed in Settings -> Users like everybody else.
app.post('/api/sync-user', async (req, res) => {
  try {
    if (!req.workspace) {
      return res.json({ setupRequired: true, user: null });
    }
    if (req.currentUser) {
      return res.json({ setupRequired: false, user: req.currentUser });
    }

    // The middleware provisions on every other path, but sync-user is listed in
    // SETUP_PATHS so it can answer before a workspace exists — which means it
    // skips that step and has to do it here. Somebody arriving from a console
    // invitation should land in the app, not on a refusal.
    const provisioned = await provisionInvitedUser(
      req.catalystApp, req.orgId, req.authUser
    );
    if (provisioned) {
      return res.json({
        setupRequired: false,
        user: provisioned,
        // The client shows this once, so a new arrival understands why the app
        // looks read-only rather than assuming it is broken.
        notice: 'Your account has been created with view-only access. ' +
                'An administrator can give you a role and approval limit in Settings.'
      });
    }

    return res.json({
      setupRequired: false,
      user: null,
      message: 'Your account has not been given access to this workspace.'
    });
  } catch (err) {
    fail(res, err);
  }
});

// First-run setup. Creates THE workspace for this installation.
//
// There is no industry choice: this build is the Hotel Management edition, so
// the hotel pack (multi-property, F&B/Housekeeping/Engineering departments,
// CapEx-OpEx category map, HACCP and par-level fields) is always applied.
// Running this a second time is refused — the installation already exists.
app.post('/api/setup', async (req, res) => {
  try {
    const {
      orgName, domain, adminName, currency, adminApprovalLimit,
      country, address, fiscalYearStart, timezone, phone, properties
    } = req.body;
    // The admin account is always the authenticated user — never a body-supplied email.
    const adminEmail = req.authUser.email;
    if (!orgName) return res.status(400).json({ error: 'Tell us the name of your hotel or group.' });

    // Guard against a double submit or a second person racing the setup screen.
    if (await getWorkspace(req.catalystApp, { fresh: true })) {
      return res.status(409).json({
        error: 'This workspace has already been set up.',
        code: 'ALREADY_SET_UP'
      });
    }

    const parsedLimit = adminApprovalLimit !== undefined && adminApprovalLimit !== ''
      ? Number(adminApprovalLimit) : 50000;

    // Always the hotel pack — this is the Hotel Management edition.
    const pack = getPack('hotel');

    // 1. Create the workspace. No verification gate: whoever installs this
    // deployment owns it, and there is no platform operator to wait on.
    const newOrg = await safeTable(req.catalystApp, 'Organizations').insertRow({
      Name: orgName,
      Domain: domain || '',
      Status: 'Active',
      Settings: JSON.stringify({
        currency: currency || 'USD',
        autoApproveLimit: 5000,
        industry: 'hospitality',
        industryPack: pack.key,
        multiProperty: true,
        terminology: pack.terminology || {},
        country: country || '',
        address: address || '',
        fiscalYearStart: fiscalYearStart || 'January',
        timezone: timezone || '',
        phone: phone || '',
        departments: pack.departments || [],
        categories: pack.categories || [],
        // The classification matrix drives department -> category -> sub-category
        // pickers throughout the app, so it travels with the workspace settings
        // rather than being re-derived on every request.
        classification: pack.classification || [],
        expenditureCategories: pack.expenditureCategories || [],
        budgetClasses: pack.budgetClasses || [],
        baseUoms: pack.baseUoms || [],
        purchasingUoms: pack.purchasingUoms || [],
        itemTypes: pack.itemTypes || [],
        itemStatuses: pack.itemStatuses || [],
        supplierApprovalStatuses: pack.supplierApprovalStatuses || [],
        taxTreatments: pack.taxTreatments || [],
        workflows: pack.workflows || {},
        paymentTerms: (pack.paymentTerms || []).map(name => ({ name })),
        approvalRules: { PR: 'Workflow' }
      })
    });
    invalidateWorkspace();

    // 2. Seed the approval hierarchy. The roles come from the customer's own
    // approval routes, so a requisition can be routed the day the workspace is
    // created rather than after someone hand-builds the ladder.
    //
    // Roles are inserted top-down and each is pointed at the one above it, which
    // is what makes escalation ("who is next?") a single lookup.
    const roleIds = {};
    let previousRoleId = null;
    for (const r of (pack.roles || [])) {
      const row = await safeTable(req.catalystApp, 'Roles').insertRow({
        OrgID: newOrg.ROWID,
        RoleName: r.name,
        Description: r.description || '',
        Permissions: r.name === 'Administrator' ? '["*"]' : '[]',
        ReportsToRoleID: previousRoleId
      });
      roleIds[r.name] = row.ROWID;
      // Administrator sits outside the approval ladder — it is an access level,
      // not a rung, so it must not become the parent of the next role.
      if (r.name !== 'Administrator') previousRoleId = row.ROWID;
    }

    const profileIds = {};
    for (const p of (pack.profiles || [])) {
      const row = await safeTable(req.catalystApp, 'Profiles').insertRow({
        OrgID: newOrg.ROWID,
        ProfileName: p.name,
        Description: p.description || '',
        Permissions: JSON.stringify(p.permissions || {})
      });
      profileIds[p.name] = row.ROWID;
    }

    // The person running setup owns the workspace: top role, full access.
    const adminRole = { ROWID: roleIds['Administrator'] };
    const adminProfile = { ROWID: profileIds['Administrator'] };

    // 3. Create the User mapped to this Org, Role and Profile
    const newUser = await safeTable(req.catalystApp, 'Users').insertRow({
      OrgID: newOrg.ROWID,
      FullName: adminName || `${req.authUser.firstName} ${req.authUser.lastName}`.trim() || adminEmail,
      Email: adminEmail,
      RoleID: adminRole.ROWID,
      ProfileID: adminProfile.ROWID,
      ApprovalLimit: parsedLimit,
      Status: 'Active'
    });

    // 4. Apply the industry pack: custom fields, sample catalog, default dashboard.
    try {
      if (pack.customFields?.length) {
        await safeTable(req.catalystApp, 'CustomFields').insertRows(pack.customFields.map(f => ({
          OrgID: newOrg.ROWID,
          Module: f.module,
          FieldName: f.name,
          FieldType: f.type || 'text',
          Options: f.options ? JSON.stringify(f.options) : '',
          Status: 'Active'
        })));
      }
      if (pack.sampleItems?.length) {
        await safeTable(req.catalystApp, 'Items').insertRows(pack.sampleItems.map(i => ({
          OrgID: newOrg.ROWID,
          SKU: i.SKU, Name: i.Name, Description: '',
          UnitPrice: Number(i.UnitPrice), Category: i.Category,
          ExpenseType: i.ExpenseType || 'OpEx'
        })));
      }
      if (pack.dashboard) {
        await safeTable(req.catalystApp, 'DashboardConfigs').insertRow({
          OrgID: newOrg.ROWID,
          Name: 'Default dashboard',
          RoleID: null, ProfileID: null,
          WidgetsJson: JSON.stringify(pack.dashboard.widgets || []),
          IsDefault: 'true'
        });
      }
    } catch (seedErr) {
      console.warn('[Setup] Hotel pack seeding partially failed:', seedErr.message);
    }

    // 5. Seed the properties entered during setup. A hotel group is defined by
    // its properties, so getting them in on day one is what makes budgets,
    // requisitions and reporting meaningful straight away.
    let seededProperties = 0;
    try {
      let list = Array.isArray(properties)
        ? properties.map(p => (typeof p === 'string' ? { Name: p } : p))
            .filter(p => p && String(p.Name || '').trim())
        : [];
      // Nothing typed in? Fall back to the group's own cluster structure so the
      // workspace is usable immediately. Anything entered on the setup screen
      // wins — this is a default, not an override.
      if (!list.length) {
        list = (pack.clusters || []).flatMap(c =>
          c.properties.map(name => ({ Name: name, Cluster: c.name })));
      }
      if (list.length) {
        await safeTable(req.catalystApp, 'Properties').insertRows(list.map(p => ({
          OrgID: newOrg.ROWID,
          Name: String(p.Name).trim(),
          Location: String(p.Location || '').trim(),
          Cluster: String(p.Cluster || '').trim(),
          Currency: p.Currency || currency || 'USD',
          FiscalYearStart: p.FiscalYearStart || fiscalYearStart || 'January',
          Status: 'Active'
        })));
        seededProperties = list.length;
      }
    } catch (propErr) {
      console.warn('[Setup] Property seeding failed:', propErr.message);
    }

    res.status(201).json({
      message: 'Setup complete',
      org: newOrg,
      user: newUser,
      pack: pack.key,
      properties: seededProperties
    });
  } catch (err) {
    fail(res, err);
  }
});

function catalystUserList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['users', 'data', 'user_details']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function catalystUserEmail(user) {
  return String(user?.email_id || user?.email || user?.emailId || '').trim().toLowerCase();
}

function catalystUserId(payload) {
  return payload?.user_id || payload?.userId || payload?.id ||
    payload?.user_details?.user_id || payload?.data?.user_id || null;
}

function catalystNameParts(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts.shift() || '',
    last_name: parts.join(' ') || ''
  };
}

// Invite a real Catalyst user, then create the workspace membership carrying
// their role, permission profile and approval limit. This replaces the old
// Data-Store-only row insert which left administrators finishing the job in
// the Catalyst console by hand.
app.post('/api/users', requireAdmin, async (req, res) => {
  let registeredCatalystUserId = null;
  try {
    const { Email, FullName, RoleID, ProfileID, ApprovalLimit } = req.body;
    if (!Email || !FullName) return res.status(400).json({ error: 'Email and FullName are required' });

    const email = String(Email).trim().toLowerCase();
    const fullName = String(FullName).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Enter a valid email address.', { code: 'INVALID_EMAIL' });
    }
    if (!RoleID || !ProfileID) {
      throw new AppError('A role and permission profile are required.', { code: 'ACCESS_ASSIGNMENT_REQUIRED' });
    }

    const zcql = req.catalystApp.zcql();
    const [duplicates, roleRows, profileRows] = await Promise.all([
      zcql.executeZCQLQuery(
        `SELECT ROWID FROM Users WHERE OrgID = '${zqRaw(req.orgId)}' AND Email = '${zqRaw(email)}'`
      ),
      zcql.executeZCQLQuery(
        `SELECT ROWID FROM Roles WHERE OrgID = '${zqRaw(req.orgId)}' AND ROWID = '${zqRaw(RoleID)}'`
      ),
      zcql.executeZCQLQuery(
        `SELECT ROWID FROM Profiles WHERE OrgID = '${zqRaw(req.orgId)}' AND ROWID = '${zqRaw(ProfileID)}'`
      )
    ]);
    if (duplicates.length) {
      throw new AppError('A workspace user with this email already exists.', {
        status: 409,
        code: 'USER_EXISTS'
      });
    }
    if (!roleRows.length || !profileRows.length) {
      throw new AppError('The selected role or permission profile is not valid for this workspace.', {
        code: 'INVALID_ACCESS_ASSIGNMENT'
      });
    }

    const users = req.catalystApp.userManagement();
    let catalystUsers = [];
    try {
      catalystUsers = catalystUserList(await users.getAllUsers());
    } catch (lookupErr) {
      console.warn('[User invite] Could not list Catalyst users:', lookupErr?.message);
    }

    let linkedExisting = catalystUsers.some(user => catalystUserEmail(user) === email);
    let invitationSent = false;
    if (!linkedExisting) {
      const zaid = String(process.env.PROCUREFLOW_AUTH_ZAID || '').trim();
      if (!zaid) {
        throw new AppError(
          'User invitations are not configured for this environment. Set PROCUREFLOW_AUTH_ZAID in the Catalyst function environment.',
          { status: 503, code: 'USER_INVITES_NOT_CONFIGURED' }
        );
      }
      const registration = await users.registerUser(
        { platform_type: 'web', zaid },
        { email_id: email, ...catalystNameParts(fullName) }
      );
      registeredCatalystUserId = catalystUserId(registration);
      invitationSent = true;
    }

    const table = safeTable(req.catalystApp, 'Users');
    const newUser = await table.insertRow({
      OrgID: req.orgId,
      Email: email,
      FullName: fullName,
      RoleID: String(RoleID),
      ProfileID: String(ProfileID),
      ApprovalLimit: ApprovalLimit !== undefined ? Number(ApprovalLimit) : 1000.0,
      Status: linkedExisting ? 'Active' : 'Invited'
    });

    await audit(req, linkedExisting ? 'user_linked' : 'user_invited', 'User', newUser.ROWID, {
      email,
      roleId: String(RoleID),
      profileId: String(ProfileID),
      approvalLimit: Number(newUser.ApprovalLimit || 0)
    });

    res.status(201).json({ user: newUser, invitationSent, linkedExisting });
  } catch (err) {
    // Registration succeeded but the membership write did not. Remove only the
    // exact identity created by this request so the administrator can retry
    // cleanly; never delete a pre-existing Catalyst account.
    if (registeredCatalystUserId) {
      try {
        await req.catalystApp.userManagement().deleteUser(registeredCatalystUserId);
      } catch (rollbackErr) {
        console.error('[User invite] Catalyst identity rollback failed:', rollbackErr?.message);
      }
    }
    fail(res, err);
  }
});

// Update a user (role / profile / limit / status)
app.put('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const { FullName, RoleID, ProfileID, ApprovalLimit, Status } = req.body;
    if (Status !== undefined && !['Invited', 'Active', 'Inactive'].includes(String(Status))) {
      throw new AppError('Status must be Invited, Active, or Inactive.', { code: 'INVALID_USER_STATUS' });
    }

    // Never let an edit remove the final active administrator. This covers
    // both deactivation and changing that person's permission profile.
    if (Status !== undefined || ProfileID !== undefined) {
      const zcql = req.catalystApp.zcql();
      const [targetRows, profileRows, activeRows] = await Promise.all([
        zcql.executeZCQLQuery(
          `SELECT * FROM Users WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`
        ),
        zcql.executeZCQLQuery(`SELECT * FROM Profiles WHERE OrgID = '${zqRaw(req.orgId)}'`),
        zcql.executeZCQLQuery(
          `SELECT * FROM Users WHERE OrgID = '${zqRaw(req.orgId)}' AND Status = 'Active'`
        )
      ]);
      const target = targetRows[0]?.Users;
      if (!target) throw new AppError('User not found.', { status: 404, code: 'USER_NOT_FOUND' });

      if (target.Status === 'Invited' && Status === 'Active') {
        throw new AppError('An invited user becomes active after their first authenticated sign-in.', {
          code: 'INVITATION_NOT_ACCEPTED'
        });
      }

      const profiles = profileRows.map(row => row.Profiles).filter(Boolean);
      const adminProfileIds = new Set(profiles
        .filter(profile => Boolean(safeParse(profile.Permissions, {})['*']))
        .map(profile => String(profile.ROWID)));
      const targetIsActiveAdmin = target.Status === 'Active' && adminProfileIds.has(String(target.ProfileID));
      const resultingStatus = Status === undefined ? target.Status : Status;
      const resultingProfile = ProfileID === undefined ? target.ProfileID : ProfileID;
      const remainsActiveAdmin = resultingStatus === 'Active' && adminProfileIds.has(String(resultingProfile));
      if (targetIsActiveAdmin && !remainsActiveAdmin) {
        const activeAdmins = activeRows
          .map(row => row.Users)
          .filter(user => user && adminProfileIds.has(String(user.ProfileID)));
        if (activeAdmins.length <= 1) {
          throw new AppError('Assign another active administrator before changing this account.', {
            status: 409,
            code: 'LAST_ADMIN_REQUIRED'
          });
        }
      }
    }

    const updateData = { ROWID: req.params.id };
    if (FullName !== undefined) updateData.FullName = FullName;
    if (RoleID !== undefined) updateData.RoleID = RoleID || null;
    if (ProfileID !== undefined) updateData.ProfileID = ProfileID || null;
    if (ApprovalLimit !== undefined) updateData.ApprovalLimit = Number(ApprovalLimit);
    if (Status !== undefined) updateData.Status = Status;
    const updated = await safeTable(req.catalystApp, 'Users').updateRow(updateData);
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});


// ==========================================
// 🗂 PROCUREMENT REFERENCE DATA
// ==========================================
// The classification matrix, the option sets behind the item master, the
// payment terms and the three approval routes. The frontend builds every
// dependent dropdown from this one call rather than hard-coding the lists in
// two places and letting them drift apart.
app.get('/api/reference', async (req, res) => {
  try {
    const pack = getPack('hotel');
    res.json({
      classification: pack.classification,
      departments: pack.departments,
      categories: pack.categories,
      clusters: pack.clusters,
      expenditureCategories: pack.expenditureCategories,
      budgetClasses: pack.budgetClasses,
      paymentTerms: pack.paymentTerms,
      baseUoms: pack.baseUoms,
      purchasingUoms: pack.purchasingUoms,
      itemTypes: pack.itemTypes,
      itemStatuses: pack.itemStatuses,
      supplierApprovalStatuses: pack.supplierApprovalStatuses,
      taxTreatments: pack.taxTreatments,
      workflows: pack.workflows,
      roles: pack.roles.map(r => r.name)
    });
  } catch (err) { fail(res, err); }
});

// The approval ladder a requisition is walking, with the current position
// marked — this is what the record view's Approvals tab draws.
app.get('/api/prs/:id/workflow', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT CustomFieldsJson, ApprovalLevel, Status, PropertyID FROM PRs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`
    );
    if (!rows.length) return res.status(404).json({ error: 'Requisition not found' });
    const pr = rows[0].PRs;
    const custom = safeParse(pr.CustomFieldsJson, {}) || {};
    const route = workflowFor(custom.budgetClass);
    const current = Number(pr.ApprovalLevel || 0);

    // Name the person sitting in each seat, so the trail reads as people
    // rather than as role titles nobody can act on.
    const stages = [];
    for (const s of route.stages) {
      const holder = await findApproverByRole(req.catalystApp, req.orgId, s.role, pr.PropertyID);
      let holderName = '';
      if (holder) {
        const u = await zcql.executeZCQLQuery(
          `SELECT FullName, Email FROM Users WHERE ROWID = '${zqRaw(holder.ROWID)}' LIMIT 1`
        );
        if (u.length) holderName = u[0].Users.FullName || u[0].Users.Email;
      }
      stages.push({
        seq: s.seq,
        role: s.role,
        action: s.action,
        holder: holderName,
        state: pr.Status === 'Rejected' ? 'rejected'
             : pr.Status === 'Approved' || !current ? (pr.Status === 'Approved' ? 'done' : 'pending')
             : s.seq < current ? 'done' : s.seq === current ? 'current' : 'pending'
      });
    }
    res.json({ workflow: route.key, label: route.label, description: route.description, currentStage: current, stages });
  } catch (err) { fail(res, err); }
});

// ==========================================
// 📦 SUPPLIERS & PRODUCT CATALOG (ITEMS)
// ==========================================

// ==========================================
// 🏨 PROPERTIES (multi-property / Hotel Management)
// A group organization can hold many properties; users are scoped to properties
// via PropertyAssignments (none = group-level, sees all).
// ==========================================
app.get('/api/properties', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    // Property records themselves are scoped: a property-level user only sees
    // the properties they're assigned to (ROWID acts as the PropertyID).
    let sql = `SELECT * FROM Properties WHERE OrgID = '${zqRaw(req.orgId)}'`;
    if (req.propertyScope && req.propertyScope.length) {
      const ids = req.propertyScope.map(id => `'${zqRaw(id)}'`).join(', ');
      sql += ` AND ROWID IN (${ids})`;
    }
    sql += ' ORDER BY Name ASC';
    const rows = await zcql.executeZCQLQuery(sql);
    res.json(rows.map(r => r.Properties));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/properties', requireAdmin, async (req, res) => {
  try {
    const { Name, Location, Cluster, Currency, FiscalYearStart } = req.body;
    if (!Name) return res.status(400).json({ error: 'Property name is required' });
    const created = await safeTable(req.catalystApp, 'Properties').insertRow({
      OrgID: req.orgId, Name, Location: Location || '', Cluster: Cluster || '',
      Currency: Currency || req.body.currency || '', FiscalYearStart: FiscalYearStart || '', Status: 'Active'
    });
    await audit(req, 'create', 'Property', created.ROWID, { name: Name });
    res.status(201).json(created);
  } catch (err) { fail(res, err); }
});

// Bulk import (CSV parsed client-side into an array of rows).
app.post('/api/properties/bulk', requireAdmin, async (req, res) => {
  try {
    const list = Array.isArray(req.body.properties) ? req.body.properties : [];
    if (list.length === 0) return res.status(400).json({ error: 'No properties supplied' });
    const table = safeTable(req.catalystApp, 'Properties');
    const rows = list.filter(p => p.Name && String(p.Name).trim()).map(p => ({
      OrgID: req.orgId, Name: String(p.Name).trim(), Location: p.Location || '',
      Cluster: p.Cluster || '', Currency: p.Currency || '', FiscalYearStart: p.FiscalYearStart || '', Status: 'Active'
    }));
    if (rows.length === 0) return res.status(400).json({ error: 'No valid rows (Name is required)' });
    const inserted = await table.insertRows(rows);
    await audit(req, 'bulk-create', 'Property', '', { count: rows.length });
    res.status(201).json({ created: rows.length, rows: inserted });
  } catch (err) { fail(res, err); }
});

app.put('/api/properties/:id', requireAdmin, async (req, res) => {
  try {
    const upd = { ROWID: req.params.id };
    ['Name', 'Location', 'Cluster', 'Currency', 'FiscalYearStart', 'Status'].forEach(k => {
      if (req.body[k] !== undefined) upd[k] = req.body[k];
    });
    const updated = await safeTable(req.catalystApp, 'Properties').updateRow(upd);
    res.json(updated);
  } catch (err) { fail(res, err); }
});

app.delete('/api/properties/:id', requireAdmin, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const ref = await zcql.executeZCQLQuery(`SELECT ROWID FROM PRs WHERE PropertyID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}' LIMIT 1`);
    if (ref.length > 0) return res.status(409).json({ error: 'This property has requisitions and cannot be deleted. Mark it Inactive instead.' });
    await safeTable(req.catalystApp, 'Properties').deleteRow(req.params.id);
    res.json({ message: 'Property deleted' });
  } catch (err) { fail(res, err); }
});

// User ↔ property assignments (many-to-many). Empty set = group-level user.
app.get('/api/properties/assignments/:userId', requireAdmin, async (req, res) => {
  try {
    const rows = await req.catalystApp.zcql().executeZCQLQuery(
      `SELECT PropertyID FROM PropertyAssignments WHERE OrgID = '${zqRaw(req.orgId)}' AND UserID = '${zqRaw(req.params.userId)}'`
    );
    res.json(rows.map(r => String(r.PropertyAssignments.PropertyID)));
  } catch (err) { res.json([]); }
});

app.put('/api/properties/assignments/:userId', requireAdmin, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const ds = safeTable(req.catalystApp, 'PropertyAssignments');
    const existing = await zcql.executeZCQLQuery(
      `SELECT ROWID FROM PropertyAssignments WHERE OrgID = '${zqRaw(req.orgId)}' AND UserID = '${zqRaw(req.params.userId)}'`
    );
    for (const r of existing) await ds.deleteRow(r.PropertyAssignments.ROWID);
    const ids = Array.isArray(req.body.PropertyIDs) ? req.body.PropertyIDs : [];
    for (const pid of ids) {
      await ds.insertRow({ OrgID: req.orgId, UserID: String(req.params.userId), PropertyID: String(pid) });
    }
    res.json({ message: 'Assignments updated', count: ids.length });
  } catch (err) { fail(res, err); }
});

// ==========================================
// 🏛️ ASSETS (capital register — CapEx approvals seed draft assets)
// ==========================================
app.get('/api/assets', async (req, res) => {
  try {
    const sql = `SELECT * FROM Assets WHERE OrgID = '${zqRaw(req.orgId)}'${propertyScopeClause(req)} ORDER BY CREATEDTIME DESC`;
    const rows = await req.catalystApp.zcql().executeZCQLQuery(sql);
    res.json(rows.map(r => r.Assets));
  } catch (err) { res.json([]); }
});

app.put('/api/assets/:id', requireAdmin, async (req, res) => {
  try {
    const upd = { ROWID: req.params.id };
    ['Name', 'Value', 'Category', 'AcquisitionDate', 'Status', 'PropertyID'].forEach(k => {
      if (req.body[k] !== undefined) upd[k] = k === 'Value' ? Number(req.body[k]) : req.body[k];
    });
    const updated = await safeTable(req.catalystApp, 'Assets').updateRow(upd);
    res.json(updated);
  } catch (err) { fail(res, err); }
});

// ==========================================

// Get Suppliers
app.get('/api/suppliers', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    // Property-level users see group vendors (Scope='group') + their property's vendors.
    let sql = `SELECT * FROM Suppliers WHERE OrgID = '${zqRaw(req.orgId)}'`;
    if (req.propertyScope && req.propertyScope.length) {
      const ids = req.propertyScope.map(id => `'${zqRaw(id)}'`).join(', ');
      sql += ` AND (Scope = 'group' OR Scope IS NULL OR PropertyID IN (${ids}))`;
    }
    const rows = await zcql.executeZCQLQuery(sql);
    res.json(rows.map(r => r.Suppliers));
  } catch (err) {
    fail(res, err);
  }
});

// Create Supplier
app.post('/api/suppliers', requireMastersCreate, async (req, res) => {
  try {
    const { Name, ContactEmail, Phone, Address, Rating, Scope, PropertyID } = req.body;
    if (!Name || !ContactEmail) return res.status(400).json({ error: 'Name and ContactEmail are required' });

    const table = safeTable(req.catalystApp, 'Suppliers');
    const newSupplier = await table.insertRow({
      OrgID: req.orgId,
      Name,
      ContactEmail,
      Phone: Phone || '',
      Address: Address || '',
      Scope: Scope === 'property' ? 'property' : 'group',
      PropertyID: Scope === 'property' ? (PropertyID || '') : '',
      CustomFieldsJson: req.body.CustomFields ? JSON.stringify(req.body.CustomFields) : null,
      Rating: Rating !== undefined ? Number(Rating) : 5.0,
      Status: 'Active'
    });

    res.status(201).json(newSupplier);
  } catch (err) {
    fail(res, err);
  }
});

// Get Items
app.get('/api/items', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Items WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.Items));
  } catch (err) {
    fail(res, err);
  }
});

// Where an item has actually been used: the requisitions and orders that
// carry it. There is no bulk PRItems/POItems endpoint, and fetching every
// requisition to find out would be absurd — so ask the line tables directly
// and join back to their parents.
app.get('/api/items/:id/usage', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const org = zqRaw(req.orgId);
    const itemId = zqRaw(req.params.id);

    const [prLines, poLines] = await Promise.all([
      zcql.executeZCQLQuery(`SELECT PRID, Quantity, EstimatedPrice FROM PRItems WHERE OrgID = '${org}' AND ItemID = '${itemId}'`).catch(() => []),
      zcql.executeZCQLQuery(`SELECT POID, Quantity, UnitPrice FROM POItems WHERE OrgID = '${org}' AND ItemID = '${itemId}'`).catch(() => [])
    ]);

    const byId = (rows, key) => {
      const map = new Map();
      rows.forEach(r => {
        const line = r.PRItems || r.POItems;
        const id = String(line[key] || '');
        if (!id) return;
        const prev = map.get(id) || { qty: 0, value: 0 };
        const qty = Number(line.Quantity || 0);
        prev.qty += qty;
        prev.value += qty * Number(line.EstimatedPrice ?? line.UnitPrice ?? 0);
        map.set(id, prev);
      });
      return map;
    };
    const prAgg = byId(prLines, 'PRID');
    const poAgg = byId(poLines, 'POID');

    // Only fetch the parents we actually referenced.
    const fetchParents = async (table, ids) => {
      if (!ids.length) return [];
      const list = ids.map(i => `'${zqRaw(i)}'`).join(',');
      const rows = await zcql.executeZCQLQuery(
        `SELECT * FROM ${table} WHERE OrgID = '${org}' AND ROWID IN (${list}) ORDER BY CREATEDTIME DESC`
      ).catch(() => []);
      return rows.map(r => r[table]);
    };
    const [prs, pos] = await Promise.all([
      fetchParents('PRs', [...prAgg.keys()]),
      fetchParents('POs', [...poAgg.keys()])
    ]);

    const totalOrdered = [...poAgg.values()].reduce((a, v) => a + v.qty, 0);
    const totalSpend = [...poAgg.values()].reduce((a, v) => a + v.value, 0);

    res.json({
      requisitions: prs.map(p => ({ ...p, _qty: prAgg.get(String(p.ROWID))?.qty || 0 })),
      orders: pos.map(p => ({ ...p, _qty: poAgg.get(String(p.ROWID))?.qty || 0 })),
      totalOrdered,
      totalSpend
    });
  } catch (err) {
    fail(res, err);
  }
});

// Create Item in Catalog
app.post('/api/items', requireMastersCreate, async (req, res) => {
  try {
    const { SKU, Name, UnitPrice } = req.body;
    if (!SKU || !Name || UnitPrice === undefined) {
      return res.status(400).json({ error: 'SKU, Name, and UnitPrice are required' });
    }

    const table = safeTable(req.catalystApp, 'Items');
    const payload = buildCatalogItemPayload(req, req.body);
    const newItem = await table.insertRow(payload);

    res.status(201).json(newItem);
  } catch (err) {
    fail(res, err);
  }
});

// Edit / delete master-data records (Suppliers, Items).
app.put('/api/suppliers/:id', perm('masters', 'edit'), async (req, res) => {
  try {
    const { Name, ContactEmail, Phone, Address, Rating, Status } = req.body;
    const upd = { ROWID: req.params.id };
    if (Name !== undefined) upd.Name = Name;
    if (ContactEmail !== undefined) upd.ContactEmail = ContactEmail;
    if (Phone !== undefined) upd.Phone = Phone;
    if (Address !== undefined) upd.Address = Address;
    if (Rating !== undefined) upd.Rating = Number(Rating);
    if (Status !== undefined) upd.Status = Status;
    if (req.body.CustomFields !== undefined) upd.CustomFieldsJson = JSON.stringify(req.body.CustomFields);
    const updated = await safeTable(req.catalystApp, 'Suppliers').updateRow(upd);
    await audit(req, 'edit', 'Supplier', req.params.id, { name: Name });
    res.json(updated);
  } catch (err) { fail(res, err); }
});

app.delete('/api/suppliers/:id', perm('masters', 'delete'), async (req, res) => {
  try {
    // Block deletion if the vendor is referenced by any PO.
    const zcql = req.catalystApp.zcql();
    const refs = await zcql.executeZCQLQuery(`SELECT ROWID FROM POs WHERE SupplierID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}' LIMIT 1`);
    if (refs.length > 0) return res.status(409).json({ error: 'Cannot delete: this vendor is used on purchase orders. Mark it inactive instead.' });
    await safeTable(req.catalystApp, 'Suppliers').deleteRow(req.params.id);
    await audit(req, 'delete', 'Supplier', req.params.id, {});
    res.json({ message: 'Vendor deleted' });
  } catch (err) { fail(res, err); }
});

app.put('/api/items/:id', perm('masters', 'edit'), async (req, res) => {
  try {
    const b = req.body;
    const payload = { ROWID: req.params.id };
    // Persist every editable Items column. Empty strings ARE written (so a user
    // can clear a field) — the only fields skipped are ones the client did not
    // send at all. This is what makes a saved item actually editable.
    if (b.SKU !== undefined) payload.SKU = String(b.SKU || '').trim();
    if (b.Name !== undefined) payload.Name = String(b.Name || '').trim();
    if (b.Description !== undefined) payload.Description = String(b.Description || '').trim();
    if (b.UnitPrice !== undefined) payload.UnitPrice = Number(b.UnitPrice);
    if (b.Category !== undefined) payload.Category = String(b.Category || '').trim();
    if (b.ExpenseType === 'CapEx' || b.ExpenseType === 'OpEx') payload.ExpenseType = b.ExpenseType;
    if (b.ItemType === 'Goods' || b.ItemType === 'Service') payload.ItemType = b.ItemType;
    if (b.Unit !== undefined) payload.Unit = String(b.Unit || '').trim();
    if (b.PreferredVendorID !== undefined) payload.PreferredVendorID = String(b.PreferredVendorID || '').trim();
    if (b.CustomFields !== undefined) payload.CustomFieldsJson = JSON.stringify(b.CustomFields);

    const updated = await safeTable(req.catalystApp, 'Items').updateRow(payload);
    await audit(req, 'edit', 'Item', req.params.id, { name: b.Name });
    res.json(updated);
  } catch (err) { fail(res, err); }
});

app.delete('/api/items/:id', perm('masters', 'delete'), async (req, res) => {
  try {
    await safeTable(req.catalystApp, 'Items').deleteRow(req.params.id);
    await audit(req, 'delete', 'Item', req.params.id, {});
    res.json({ message: 'Item deleted' });
  } catch (err) { fail(res, err); }
});

// ---- Vendor contacts ----
app.get('/api/suppliers/:id/contacts', async (req, res) => {
  try {
    const rows = await req.catalystApp.zcql().executeZCQLQuery(`SELECT * FROM VendorContacts WHERE VendorID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.VendorContacts));
  } catch (err) { res.json([]); }
});
app.post('/api/suppliers/:id/contacts', perm('masters', 'edit'), async (req, res) => {
  try {
    const { Name, Email, Phone, Designation } = req.body;
    if (!Name) return res.status(400).json({ error: 'Contact name is required.' });
    const created = await safeTable(req.catalystApp, 'VendorContacts').insertRow({
      OrgID: req.orgId, VendorID: String(req.params.id), Name, Email: Email || '', Phone: Phone || '', Designation: Designation || ''
    });
    res.status(201).json(created);
  } catch (err) { fail(res, err); }
});
app.delete('/api/suppliers/:id/contacts/:cid', perm('masters', 'edit'), async (req, res) => {
  try { await safeTable(req.catalystApp, 'VendorContacts').deleteRow(req.params.cid); res.json({ message: 'Contact removed' }); }
  catch (err) { fail(res, err); }
});

// ---- Vendor bank accounts ----
app.get('/api/suppliers/:id/bank', async (req, res) => {
  try {
    const rows = await req.catalystApp.zcql().executeZCQLQuery(`SELECT * FROM VendorBankAccounts WHERE VendorID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.VendorBankAccounts));
  } catch (err) { res.json([]); }
});
app.post('/api/suppliers/:id/bank', perm('masters', 'edit'), async (req, res) => {
  try {
    const { BankName, AccountNumber, RoutingInfo, AccountName } = req.body;
    if (!BankName || !AccountNumber) return res.status(400).json({ error: 'Bank name and account number are required.' });
    const created = await safeTable(req.catalystApp, 'VendorBankAccounts').insertRow({
      OrgID: req.orgId, VendorID: String(req.params.id), BankName, AccountNumber, RoutingInfo: RoutingInfo || '', AccountName: AccountName || ''
    });
    res.status(201).json(created);
  } catch (err) { fail(res, err); }
});
app.delete('/api/suppliers/:id/bank/:bid', perm('masters', 'edit'), async (req, res) => {
  try { await safeTable(req.catalystApp, 'VendorBankAccounts').deleteRow(req.params.bid); res.json({ message: 'Bank account removed' }); }
  catch (err) { fail(res, err); }
});

// ---- Merge vendors: re-point POs from loser → winner, then delete the loser ----
app.post('/api/suppliers/merge', perm('masters', 'delete'), async (req, res) => {
  try {
    const { WinnerID, LoserID } = req.body;
    if (!WinnerID || !LoserID || WinnerID === LoserID) return res.status(400).json({ error: 'Pick two different vendors to merge.' });
    const zcql = req.catalystApp.zcql();
    const ds = req.catalystApp.datastore();

    const [winner, loser] = await Promise.all([
      zcql.executeZCQLQuery(`SELECT ROWID FROM Suppliers WHERE ROWID = '${zqRaw(WinnerID)}' AND OrgID = '${zqRaw(req.orgId)}'`),
      zcql.executeZCQLQuery(`SELECT ROWID FROM Suppliers WHERE ROWID = '${zqRaw(LoserID)}' AND OrgID = '${zqRaw(req.orgId)}'`)
    ]);
    if (winner.length === 0 || loser.length === 0) return res.status(404).json({ error: 'One of the vendors was not found.' });

    // Re-point historical POs.
    const poRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM POs WHERE SupplierID = '${zqRaw(LoserID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    for (const r of poRows) await ds.table('POs').updateRow({ ROWID: r.POs.ROWID, SupplierID: String(WinnerID) });
    // Move contacts & bank accounts too.
    for (const t of ['VendorContacts', 'VendorBankAccounts']) {
      const sub = await zcql.executeZCQLQuery(`SELECT ROWID FROM ${t} WHERE VendorID = '${zqRaw(LoserID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
      for (const r of sub) await ds.table(t).updateRow({ ROWID: r[t].ROWID, VendorID: String(WinnerID) });
    }
    await ds.table('Suppliers').deleteRow(LoserID);
    await audit(req, 'merge', 'Supplier', WinnerID, { mergedFrom: LoserID, posMoved: poRows.length });
    res.json({ message: `Merged — ${poRows.length} purchase order(s) re-pointed.` });
  } catch (err) { fail(res, err); }
});

// ---- Budget periods ----
app.get('/api/budgets/:id/periods', async (req, res) => {
  try {
    const rows = await req.catalystApp.zcql().executeZCQLQuery(`SELECT * FROM BudgetPeriods WHERE BudgetID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}' ORDER BY ROWID ASC`);
    res.json(rows.map(r => r.BudgetPeriods));
  } catch (err) { res.json([]); }
});
app.post('/api/budgets/:id/periods', requireAdmin, async (req, res) => {
  try {
    const { Periods } = req.body; // [{ PeriodLabel, BudgetedAmount }]
    if (!Array.isArray(Periods) || Periods.length === 0) return res.status(400).json({ error: 'Provide at least one period.' });
    // Replace existing periods for this budget.
    const existing = await req.catalystApp.zcql().executeZCQLQuery(`SELECT ROWID FROM BudgetPeriods WHERE BudgetID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const ds = req.catalystApp.datastore();
    for (const r of existing) await ds.table('BudgetPeriods').deleteRow(r.BudgetPeriods.ROWID);
    await ds.table('BudgetPeriods').insertRows(Periods.map(p => ({
      OrgID: req.orgId, BudgetID: String(req.params.id),
      PeriodLabel: p.PeriodLabel, BudgetedAmount: Number(p.BudgetedAmount || 0), SpentAmount: 0
    })));
    res.json({ message: 'Periods saved.' });
  } catch (err) { fail(res, err); }
});


// ==========================================
// ⚙️ ADVANCED APPROVALS ENGINE
// ==========================================
/**
 * Find who currently sits in a named role, preferring someone at the record's
 * own property over a head-office holder of the same title. A hotel group has
 * a General Manager per property and one at head office; a requisition raised
 * at Queens Kandy must go to the Queens Kandy GM.
 */
async function findApproverByRole(catalystApp, orgId, roleName, propertyId) {
  const zcql = catalystApp.zcql();
  const roleRows = await zcql.executeZCQLQuery(
    `SELECT ROWID FROM Roles WHERE OrgID = '${zqRaw(orgId)}' AND RoleName = '${zqRaw(roleName)}' LIMIT 1`
  );
  if (!roleRows.length) return null;
  const roleId = roleRows[0].Roles.ROWID;

  const holders = await zcql.executeZCQLQuery(
    `SELECT ROWID FROM Users WHERE OrgID = '${zqRaw(orgId)}' AND RoleID = '${zqRaw(roleId)}' AND Status = 'Active'`
  );
  if (!holders.length) return null;
  const ids = holders.map(r => r.Users.ROWID);
  if (ids.length === 1 || !propertyId) return { ROWID: ids[0] };

  // More than one holder: prefer the one assigned to this property.
  const assigned = await zcql.executeZCQLQuery(
    `SELECT UserID FROM PropertyAssignments WHERE OrgID = '${zqRaw(orgId)}' AND PropertyID = '${zqRaw(propertyId)}'`
  );
  const atProperty = new Set(assigned.map(r => r.PropertyAssignments.UserID));
  const match = ids.find(id => atProperty.has(id));
  return { ROWID: match || ids[0] };
}

async function runApprovalsEngine(catalystApp, orgId, module, totalAmount, requestorId, opts = {}) {
  const zcql = catalystApp.zcql();
  
  // Try to fetch custom approval rules for this module
  // Since we don't have a dedicated table yet, we check the Organization's Settings
  const orgRows = await zcql.executeZCQLQuery(`SELECT Settings FROM Organizations WHERE ROWID = '${zqRaw(orgId)}'`);
  let settings = {};
  if (orgRows.length > 0) {
    try {
      settings = JSON.parse(orgRows[0].Organizations.Settings || '{}');
    } catch(e) {}
  }
  
  const rules = settings.approvalRules || {};
  const moduleRule = rules[module] || 'Hierarchical'; // Default to Hierarchical

  let status = 'Approved';
  let currentApproverID = null;
  let approvalLevel = 0;

  if (moduleRule === 'No_Approval') {
    return { status: 'Approved', currentApproverID: null, approvalLevel: 0 };
  }

  // Fetch Requestor Details
  const reqRows = await zcql.executeZCQLQuery(`SELECT * FROM Users WHERE ROWID = '${zqRaw(requestorId)}' AND OrgID = '${zqRaw(orgId)}'`);
  if (reqRows.length === 0) throw new AppError('Requestor not found', { status: 404 });
  const requestor = reqRows[0].Users;

  // The hotel group routes by ROLE, not by spend limit: a requisition walks a
  // fixed ladder of named roles, and which ladder it walks is decided by how it
  // sits against budget. `budgetClass` is carried on the requisition.
  if (moduleRule === 'Workflow' && module === 'PR') {
    const route = workflowFor(opts.budgetClass);
    // Stage 1 is the requester raising it; approval starts at stage 2.
    const first = route.stages.find(s => s.seq > 1);
    if (!first) return { status: 'Approved', currentApproverID: null, approvalLevel: 0 };
    const approver = await findApproverByRole(catalystApp, orgId, first.role, opts.propertyId);
    return {
      status: 'Pending_Approval',
      currentApproverID: approver ? approver.ROWID : null,
      approvalLevel: first.seq,
      workflow: route.key,
      stageRole: first.role,
      // A ladder with nobody in the seat must not look approved. The record
      // stays pending and unassigned so it surfaces as needing attention
      // rather than silently sailing through.
      unassigned: !approver
    };
  }

  if (moduleRule === 'Hierarchical' || moduleRule === 'Simple') {
    if (totalAmount > Number(requestor.ApprovalLimit || 0)) {
      status = 'Pending_Approval';
      approvalLevel = 1;
      
      // Find a user with a high enough limit
      const approversRows = await zcql.executeZCQLQuery(
        // Number() is the escape for an UNQUOTED position. There is no closing
        // quote to break out of here, so a non-numeric value would append SQL
        // directly onto the WHERE clause — a worse hole than the quoted case.
        `SELECT ROWID FROM Users WHERE OrgID = '${zqRaw(orgId)}' AND ApprovalLimit >= ${Number(totalAmount) || 0} AND Status = 'Active' LIMIT 1`
      );
      if (approversRows.length > 0) {
        currentApproverID = approversRows[0].Users.ROWID;
      } else {
        // Fallback: assign to the active user with the largest limit
        const fallbackRows = await zcql.executeZCQLQuery(
          `SELECT ROWID FROM Users WHERE OrgID = '${zqRaw(orgId)}' AND Status = 'Active' ORDER BY ApprovalLimit DESC LIMIT 1`
        );
        if (fallbackRows.length > 0) {
          currentApproverID = fallbackRows[0].Users.ROWID;
        }
      }
    }
  } else if (moduleRule === 'Multi-Level') {
     // Implement a simulated Multi-Level sequential flow
     status = 'Pending_Approval';
     approvalLevel = 1;
     // For demo purposes, we pick the first user with > 0 limit
     const approversRows = await zcql.executeZCQLQuery(
        `SELECT ROWID FROM Users WHERE OrgID = '${zqRaw(orgId)}' AND Status = 'Active' AND ApprovalLimit > 0 LIMIT 1`
     );
     if (approversRows.length > 0) currentApproverID = approversRows[0].Users.ROWID;
  }

  return { status, currentApproverID, approvalLevel };
}


// ==========================================
// 📝 PURCHASE REQUISITIONS (PR) & DOA LOGIC
// ==========================================

// List all PRs (scoped to the caller's allowed properties)
app.get('/api/prs', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM PRs WHERE OrgID = '${zqRaw(req.orgId)}'${propertyScopeClause(req)} ORDER BY ROWID DESC`
    );
    res.json(rows.map(r => r.PRs));
  } catch (err) {
    fail(res, err);
  }
});

// Get single PR with items
app.get('/api/prs/:id', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const prRows = await zcql.executeZCQLQuery(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'PR not found' });

    const itemRows = await zcql.executeZCQLQuery(`SELECT * FROM PRItems WHERE PRID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    
    res.json({
      pr: prRows[0].PRs,
      items: itemRows.map(r => r.PRItems)
    });
  } catch (err) {
    fail(res, err);
  }
});

// Create PR (with dynamic lines + DoA Limit Validation)
app.post('/api/prs', requirePermission('create_pr'), async (req, res) => {
  try {
    const { RequestorID, Justification, Items, Department, ExpectedDate, DeliveryAddress, ReferenceNo, Notes, PropertyID } = req.body;
    if (!RequestorID || !Items || !Array.isArray(Items) || Items.length === 0) {
      return res.status(400).json({ error: 'RequestorID and a list of line items are required' });
    }
    // A property-scoped user can only raise requisitions for their own properties.
    if (!canUseProperty(req, PropertyID)) {
      return res.status(403).json({ error: 'You are not assigned to the selected property.' });
    }

    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    // 1. Fetch requestor details to evaluate their delegation of authority limit
    const requestorRows = await zcql.executeZCQLQuery(`SELECT * FROM Users WHERE ROWID = '${zqRaw(RequestorID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (requestorRows.length === 0) {
      return res.status(400).json({ error: 'Requestor does not exist inside this organization' });
    }
    const requestor = requestorRows[0].Users;
    const approvalLimit = Number(requestor.ApprovalLimit || 0);

    // 2. Validate line items and compute totals (with per-line discount then tax).
    let computedTotal = 0, taxTotal = 0, discountTotal = 0;
    const itemsToInsert = [];

    for (const line of Items) {
      if (!line.ItemID || !line.Quantity || Number(line.Quantity) <= 0) {
        return res.status(400).json({ error: 'Invalid line item: each item needs an ItemID and positive Quantity' });
      }
      const discountPct = Math.max(0, Math.min(100, Number(line.DiscountPct || 0)));
      const taxPct = Math.max(0, Number(line.TaxPct || 0));

      const itemRows = await zcql.executeZCQLQuery(`SELECT * FROM Items WHERE ROWID = '${zqRaw(line.ItemID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
      if (itemRows.length === 0) {
        return res.status(400).json({ error: `Item ID ${line.ItemID} does not exist in the dynamic catalog` });
      }

      const catalogItem = itemRows[0].Items;
      const unitPrice = line.EstimatedPrice !== undefined ? Number(line.EstimatedPrice) : Number(catalogItem.UnitPrice || 0);
      const gross = unitPrice * Number(line.Quantity);
      const discountAmt = gross * (discountPct / 100);
      const net = gross - discountAmt;
      const taxAmt = net * (taxPct / 100);

      computedTotal += net + taxAmt;
      discountTotal += discountAmt;
      taxTotal += taxAmt;

      itemsToInsert.push({
        OrgID: req.orgId,
        ItemID: String(line.ItemID),
        Quantity: Number(line.Quantity),
        EstimatedPrice: unitPrice,
        DiscountPct: discountPct,
        TaxPct: taxPct,
        ExpenseType: line.ExpenseType || catalogItem.ExpenseType || 'OpEx',
        Category: line.Category || catalogItem.Category || ''
      });
    }

    // 2.5 Budget engine: match on department AND (property if given), and check
    // available = Amount − Committed − Actual(Spent). Reserve into Committed.
    if (Department) {
      let bSql = `SELECT * FROM Budgets WHERE Department = '${zqRaw(Department)}' AND OrgID = '${zqRaw(req.orgId)}' AND Status = 'Active'`;
      if (PropertyID) bSql += ` AND PropertyID = '${zqRaw(PropertyID)}'`;
      const budgetRows = await zcql.executeZCQLQuery(bSql);
      if (budgetRows.length > 0) {
        const budget = budgetRows[0].Budgets;
        const committed = Number(budget.Committed || 0);
        const actual = Number(budget.Spent || 0);
        const available = Number(budget.Amount) - committed - actual;
        if (computedTotal > available) {
          return res.status(400).json({ error: `Budget Exceeded: PR total (${computedTotal.toFixed(2)}) exceeds available budget (${available.toFixed(2)}) for ${Department}${PropertyID ? ' at this property' : ''}. Available = allocated − committed − actual.` });
        }
        // Reserve into Committed (POs not yet invoiced).
        await safeTable(req.catalystApp, 'Budgets').updateRow({
          ROWID: budget.ROWID,
          Committed: committed + computedTotal
        });
      }
    }

    // 3. Execute the approvals engine. Under the hotel workflow this routes by
    // role along the ladder chosen by the requisition's budget class.
    const budgetClass = String(req.body.BudgetClass || (req.body.CustomFields || {}).budgetClass || 'budgeted');
    const approvalResult = await runApprovalsEngine(
      req.catalystApp, req.orgId, 'PR', computedTotal, RequestorID,
      { budgetClass, propertyId: PropertyID }
    );
    let status = approvalResult.status;
    let currentApproverID = approvalResult.currentApproverID;
    let approvalLevel = approvalResult.approvalLevel;

    // Keep the budget class on the record: it decides the route, so it has to
    // survive for the whole life of the requisition, not just its creation.
    const customFields = { ...(req.body.CustomFields || {}), budgetClass };

    // 4. Create master Purchase Requisition record
    const prNumber = `PR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const prTable = safeTable(req.catalystApp, 'PRs');
    const insertedPR = await prTable.insertRow({
      OrgID: req.orgId,
      PRNumber: prNumber,
      RequestorID: String(RequestorID),
      Justification: Justification || '',
      Department: Department || '',
      TotalAmount: computedTotal,
      TaxTotal: taxTotal,
      DiscountTotal: discountTotal,
      ExpectedDate: ExpectedDate || '',
      DeliveryAddress: DeliveryAddress || '',
      ReferenceNo: ReferenceNo || '',
      Notes: Notes || '',
      PropertyID: PropertyID || '',
      Status: status,
      ApprovalLevel: approvalLevel || null,
      CurrentApproverID: currentApproverID ? String(currentApproverID) : null,
      CustomFieldsJson: JSON.stringify(customFields)
    });

    const prId = insertedPR.ROWID;

    // 5. Create PR line item details
    const prItemsTable = safeTable(req.catalystApp, 'PRItems');
    const finalPRLines = itemsToInsert.map(line => ({ ...line, PRID: String(prId) }));
    await prItemsTable.insertRows(finalPRLines);

    // 6. CapEx lines seed DRAFT asset records for the capital register
    // (finance completes acquisition date & depreciation later).
    const capexLines = itemsToInsert.filter(l => l.ExpenseType === 'CapEx');
    if (capexLines.length) {
      try {
        const itemsById = {};
        for (const l of capexLines) {
          if (!itemsById[l.ItemID]) {
            // ItemID comes from the request body, so this MUST be tenant-scoped:
            // without the OrgID filter a caller could name-drop another org's
            // item into their own asset register by guessing a ROWID.
            const ir = await zcql.executeZCQLQuery(
              `SELECT Name FROM Items WHERE ROWID = '${zqRaw(l.ItemID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
            itemsById[l.ItemID] = ir[0]?.Items?.Name || `Item ${l.ItemID}`;
          }
        }
        await safeTable(req.catalystApp, 'Assets').insertRows(capexLines.map(l => ({
          OrgID: req.orgId,
          PropertyID: PropertyID || '',
          Name: itemsById[l.ItemID],
          SourcePRID: String(prId),
          Value: Number(l.EstimatedPrice) * Number(l.Quantity),
          Category: l.Category || '',
          Status: 'Draft'
        })));
      } catch (e) { console.warn('[Asset seed] failed:', e.message); }
    }

    fireWebhooks(req, 'pr.created', { id: prId, number: prNumber, total: computedTotal, status });
    res.status(201).json({
      _audit: await audit(req, 'create', 'PR', prId, { number: prNumber, total: computedTotal }),
      message: 'Requisition successfully logged',
      PRID: prId,
      PRNumber: prNumber,
      TotalAmount: computedTotal,
      Status: status,
      CurrentApproverID: currentApproverID
    });
  } catch (err) {
    console.error('[PR Creation Error]:', err);
    fail(res, err);
  }
});

// Approve PR
app.post('/api/prs/:id/approve', requirePermission('approve_pr'), async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    const prRows = await zcql.executeZCQLQuery(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'PR not found' });

    const pr = prRows[0].PRs;
    if (pr.Status !== 'Pending_Approval') {
      return res.status(400).json({ error: `Cannot approve PR in its current state: ${pr.Status}` });
    }

    // Advance along the approval route this requisition was raised under. The
    // route is fixed by the requisition's budget class, so approving simply
    // means "hand it to whoever holds the next role".
    const orgRows = await zcql.executeZCQLQuery(`SELECT Settings FROM Organizations WHERE ROWID = '${zqRaw(req.orgId)}'`);
    let settings = {};
    try { settings = JSON.parse(orgRows[0]?.Organizations?.Settings || '{}'); } catch (e) {}
    const useWorkflow = (settings.approvalRules || {}).PR === 'Workflow';

    let newStatus = 'Approved';
    let nextApprover = null;
    let nextLevel = null;
    let nextRole = '';

    if (useWorkflow) {
      const custom = safeParse(pr.CustomFieldsJson, {}) || {};
      const route = workflowFor(custom.budgetClass);
      const currentSeq = Number(pr.ApprovalLevel || 0);
      // Stages that still approve after this one. `limitless` marks the final
      // authority on the route; there is nothing above it.
      const next = route.stages.find(s => s.seq > currentSeq && s.action === 'approve');
      if (next) {
        newStatus = 'Pending_Approval';
        nextLevel = next.seq;
        nextRole = next.role;
        const approver = await findApproverByRole(req.catalystApp, req.orgId, next.role, pr.PropertyID);
        nextApprover = approver ? approver.ROWID : null;
      }
    } else if ((settings.approvalRules || {}).PR === 'Multi-Level'
               && pr.ApprovalLevel && Number(pr.ApprovalLevel) < 2) {
      newStatus = 'Pending_Approval';
      nextLevel = Number(pr.ApprovalLevel || 1) + 1;
      const fallbackRows = await zcql.executeZCQLQuery(
          `SELECT ROWID FROM Users WHERE OrgID = '${zqRaw(req.orgId)}' AND Status = 'Active' ORDER BY ApprovalLimit DESC LIMIT 1`
      );
      if (fallbackRows.length > 0) nextApprover = fallbackRows[0].Users.ROWID;
    }

    await safeTable(req.catalystApp, 'PRs').updateRow({
      ROWID: req.params.id,
      Status: newStatus,
      CurrentApproverID: nextApprover,
      ApprovalLevel: newStatus === 'Approved' ? null : nextLevel
    });

    await audit(req, 'approve', 'PR', req.params.id, {});
    await approvalHistory(req, 'PR', req.params.id, 'approved', nextRole ? `Routed to ${nextRole}` : '');
    fireWebhooks(req, newStatus === 'Approved' ? 'pr.approved' : 'pr.level_advanced', { id: req.params.id, number: pr.PRNumber });
    res.json({
      message: newStatus === 'Approved'
        ? 'Purchase Requisition approved!'
        : `Approved — routed to ${nextRole || 'the next approver'}.`,
      // Tell the caller when a rung has nobody in it: the record is parked and
      // an administrator has to map somebody to that role.
      unassigned: newStatus === 'Pending_Approval' && !nextApprover,
      nextRole
    });
  } catch (err) {
    fail(res, err);
  }
});

// Reject a PR with a mandatory reason.
app.post('/api/prs/:id/reject', requirePermission('approve_pr'), async (req, res) => {
  try {
    const { Reason } = req.body;
    if (!Reason || !String(Reason).trim()) return res.status(400).json({ error: 'A rejection reason is required.' });
    const zcql = req.catalystApp.zcql();
    const prRows = await zcql.executeZCQLQuery(`SELECT Status, Department, TotalAmount, PropertyID FROM PRs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'PR not found' });
    if (prRows[0].PRs.Status !== 'Pending_Approval') return res.status(400).json({ error: 'Only pending requisitions can be rejected.' });

    await safeTable(req.catalystApp, 'PRs').updateRow({ ROWID: req.params.id, Status: 'Rejected', CurrentApproverID: null });
    // Release any budget reservation (same department+property it reserved against).
    await releaseBudget(req, prRows[0].PRs.Department, Number(prRows[0].PRs.TotalAmount || 0), prRows[0].PRs.PropertyID);
    await audit(req, 'reject', 'PR', req.params.id, { reason: Reason });
    await approvalHistory(req, 'PR', req.params.id, 'rejected', Reason);
    fireWebhooks(req, 'pr.rejected', { id: req.params.id, reason: Reason });
    res.json({ message: 'Requisition rejected.' });
  } catch (err) { fail(res, err); }
});

// Recall a pending PR back to draft (submitter only).
app.post('/api/prs/:id/recall', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const prRows = await zcql.executeZCQLQuery(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'PR not found' });
    const pr = prRows[0].PRs;
    if (pr.Status !== 'Pending_Approval') return res.status(400).json({ error: 'Only pending requisitions can be recalled.' });
    if (String(pr.RequestorID) !== String(req.currentUser.ROWID)) return res.status(403).json({ error: 'Only the requester can recall this requisition.' });

    await safeTable(req.catalystApp, 'PRs').updateRow({ ROWID: req.params.id, Status: 'Draft', CurrentApproverID: null });
    await releaseBudget(req, pr.Department, Number(pr.TotalAmount || 0), pr.PropertyID);
    await approvalHistory(req, 'PR', req.params.id, 'recalled', '');
    res.json({ message: 'Requisition recalled to draft.' });
  } catch (err) { fail(res, err); }
});

// Resubmit a rejected/draft PR for approval.
app.post('/api/prs/:id/resubmit', requirePermission('create_pr'), async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const prRows = await zcql.executeZCQLQuery(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'PR not found' });
    const pr = prRows[0].PRs;
    if (!['Rejected', 'Draft'].includes(pr.Status)) return res.status(400).json({ error: 'Only rejected or draft requisitions can be resubmitted.' });

    const approvalResult = await runApprovalsEngine(req.catalystApp, req.orgId, 'PR', Number(pr.TotalAmount || 0), pr.RequestorID);
    // Re-reserve budget when routed for approval / approved.
    if (pr.Department) await reserveBudget(req, pr.Department, Number(pr.TotalAmount || 0), pr.PropertyID).catch(() => {});
    await safeTable(req.catalystApp, 'PRs').updateRow({
      ROWID: req.params.id,
      Status: approvalResult.status,
      ApprovalLevel: approvalResult.approvalLevel || null,
      CurrentApproverID: approvalResult.currentApproverID ? String(approvalResult.currentApproverID) : null
    });
    await approvalHistory(req, 'PR', req.params.id, 'resubmitted', '');
    res.json({ message: 'Requisition resubmitted.', status: approvalResult.status });
  } catch (err) { fail(res, err); }
});

// Approval history timeline for a record.
app.get('/api/approval-history/:type/:id', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM ApprovalHistory WHERE OrgID = '${zqRaw(req.orgId)}' AND RecordType = '${zqRaw(req.params.type)}' AND RecordID = '${zqRaw(req.params.id)}' ORDER BY CREATEDTIME ASC`
    );
    res.json(rows.map(r => r.ApprovalHistory));
  } catch (err) { res.json([]); }
});


// ==========================================
// 📡 REQUEST FOR QUOTES (RFQ) & BIDS
// ==========================================

// Get all RFQs
app.get('/api/rfqs', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM RFQs WHERE OrgID = '${zqRaw(req.orgId)}' ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.RFQs));
  } catch (err) {
    res.json([]); // Return empty if schema not fully deployed
  }
});

// Convert PR to RFQ. VendorIDs is the list of suppliers invited to bid — only
// those vendors will see this RFQ / be able to bid on it in the vendor portal.
app.post('/api/rfqs/convert/:prId', requirePermission('create_po'), async (req, res) => {
  try {
    const { Deadline, Notes, VendorIDs } = req.body;
    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    const prRows = await zcql.executeZCQLQuery(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(req.params.prId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'Purchase Requisition not found' });

    const pr = prRows[0].PRs;
    if (pr.Status !== 'Approved') {
      return res.status(400).json({ error: 'Only fully approved requisitions can be converted to RFQs.' });
    }

    const rfqNumber = `RFQ-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const rfqTable = safeTable(req.catalystApp, 'RFQs');
    const insertedRFQ = await rfqTable.insertRow({
      OrgID: req.orgId,
      RFQNumber: rfqNumber,
      PRID: String(req.params.prId),
      Status: 'Published',
      Deadline: Deadline || new Date(Date.now() + 7 * 86400000).toISOString(),
      Notes: Notes || ''
    });

    const vendorIds = Array.isArray(VendorIDs) ? VendorIDs.filter(Boolean) : [];
    if (vendorIds.length > 0) {
      await safeTable(req.catalystApp, 'RFQVendors').insertRows(vendorIds.map(vid => ({
        OrgID: req.orgId, RFQID: String(insertedRFQ.ROWID), VendorID: String(vid)
      })));
    }

    await safeTable(req.catalystApp, 'PRs').updateRow({
      ROWID: req.params.prId,
      Status: 'Converted_To_RFQ'
    });

    res.status(201).json({
      message: 'Requisition successfully promoted to RFQ',
      RFQID: insertedRFQ.ROWID,
      RFQNumber: rfqNumber
    });
  } catch (err) {
    fail(res, err);
  }
});

// Vendor Submit Bid
app.post('/api/rfqs/:rfqId/bids', async (req, res) => {
  try {
    const { VendorID, TotalBidAmount, ProposalNotes } = req.body;
    if (!VendorID || !TotalBidAmount) return res.status(400).json({ error: 'VendorID and TotalBidAmount required' });

    const datastore = req.catalystApp.datastore();
    const insertedBid = await safeTable(req.catalystApp, 'Bids').insertRow({
      OrgID: req.orgId,
      RFQID: String(req.params.rfqId),
      VendorID: String(VendorID),
      TotalBidAmount: Number(TotalBidAmount),
      ProposalNotes: ProposalNotes || '',
      Status: 'Submitted'
    });

    res.status(201).json({ message: 'Bid submitted successfully', BidID: insertedBid.ROWID });
  } catch (err) {
    fail(res, err);
  }
});

// List Bids for RFQ
// Single RFQ with the requested lines (inherited from its source requisition)
// and the invited vendor list — powers the record view and the printed RFQ.
app.get('/api/rfqs/:id', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM RFQs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const rfq = rows[0]?.RFQs;
    if (!rfq) return res.status(404).json({ error: 'RFQ not found.' });

    // An RFQ quotes the lines of the requisition it came from.
    let items = [];
    if (rfq.PRID) {
      const lineRows = await zcql.executeZCQLQuery(
        `SELECT * FROM PRItems WHERE PRID = '${zqRaw(rfq.PRID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
      items = lineRows.map(r => r.PRItems);
    }
    const vendorRows = await zcql.executeZCQLQuery(
      `SELECT VendorID FROM RFQVendors WHERE RFQID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    res.json({ rfq, items, vendorIds: vendorRows.map(r => String(r.RFQVendors.VendorID)) });
  } catch (err) { fail(res, err); }
});

app.get('/api/rfqs/:rfqId/bids', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Bids WHERE RFQID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.Bids));
  } catch (err) {
    res.json([]);
  }
});

// Vendors invited to bid on this RFQ (shown/edited on the admin RFQ detail view).
app.get('/api/rfqs/:rfqId/vendors', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT VendorID FROM RFQVendors WHERE RFQID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => String(r.RFQVendors.VendorID)));
  } catch (err) { res.json([]); }
});

app.post('/api/rfqs/:rfqId/vendors', requirePermission('create_po'), async (req, res) => {
  try {
    const { VendorIDs } = req.body;
    const ids = Array.isArray(VendorIDs) ? VendorIDs.filter(Boolean).map(String) : [];
    const zcql = req.catalystApp.zcql();
    const existing = await zcql.executeZCQLQuery(`SELECT VendorID FROM RFQVendors WHERE RFQID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const existingIds = new Set(existing.map(r => String(r.RFQVendors.VendorID)));
    const toAdd = ids.filter(id => !existingIds.has(id));
    if (toAdd.length > 0) {
      await safeTable(req.catalystApp, 'RFQVendors').insertRows(toAdd.map(vid => ({
        OrgID: req.orgId, RFQID: String(req.params.rfqId), VendorID: vid
      })));
    }
    res.json({ message: `${toAdd.length} vendor(s) invited.` });
  } catch (err) { fail(res, err); }
});

// ==========================================
// ✉️  SUPPLIER CORRESPONDENCE
// ==========================================
// The invitation, award and regret letters. These are drafted here and handed
// to the user to send: the group's procurement team signs its own supplier
// correspondence, so the system prepares the letter rather than mailing it
// unattended.

// The available templates, for a picker.
app.get('/api/correspondence/templates', (req, res) => {
  res.json(correspondence.list());
});

/**
 * Draft a letter against a real record, with every merge field this system
 * can resolve already filled in.
 *
 * Anything still unresolved comes back in `missing`, because a letter that
 * reaches a supplier with a literal {Award_Amount} in it damages the group's
 * standing far more than an extra confirmation step costs.
 */
app.post('/api/correspondence/draft', async (req, res) => {
  try {
    const { template, rfqId, bidId, poId, vendorId, values: overrides = {} } = req.body;
    if (!template) return res.status(400).json({ error: 'Pick a template to draft.' });

    const zcql = req.catalystApp.zcql();
    const org = zqRaw(req.orgId);
    const settings = safeParse(req.workspace?.Settings, {}) || {};
    const one = async (q) => { const r = await zcql.executeZCQLQuery(q).catch(() => []); return r[0] || null; };

    const values = {
      Company_Name: req.workspace?.Name || '',
      Currency: settings.currency || '',
      Sender_Name: `${req.authUser?.firstName || ''} ${req.authUser?.lastName || ''}`.trim()
                   || req.authUser?.email || '',
      Sender_Designation: 'Central Procurement',
      Procurement_Contact_Email: req.authUser?.email || '',
      System_Portal_URL: `${APP_ORIGIN}/app/vendor_portal.html`,
      Payment_Terms: (settings.paymentTerms || []).map(p => p.name).join(', ')
    };

    if (rfqId) {
      const row = await one(`SELECT * FROM RFQs WHERE ROWID = '${zqRaw(rfqId)}' AND OrgID = '${org}'`);
      if (row) {
        const rfq = row.RFQs;
        values.RFQ_Number = rfq.RFQNumber;
        values.RFP_Number = rfq.RFQNumber;
        values.Closing_Date = rfq.Deadline ? String(rfq.Deadline).slice(0, 10) : '';
        if (rfq.PRID) {
          const prRow = await one(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(rfq.PRID)}' AND OrgID = '${org}'`);
          if (prRow) {
            const pr = prRow.PRs;
            values.RFQ_Title = pr.Justification || pr.Department || 'Procurement requirement';
            values.RFP_Title = values.RFQ_Title;
            values.Project_or_Item_Title = values.RFQ_Title;
            values.Project_or_Contract_Title = values.RFQ_Title;
            values.Delivery_Location = pr.DeliveryAddress || '';
            values.Delivery_Date = pr.ExpectedDate ? String(pr.ExpectedDate).slice(0, 10) : '';

            const lineRows = await zcql.executeZCQLQuery(
              `SELECT * FROM PRItems WHERE PRID = '${zqRaw(rfq.PRID)}' AND OrgID = '${org}'`
            ).catch(() => []);
            const itemIds = [...new Set(lineRows.map(l => l.PRItems.ItemID).filter(Boolean))];
            const itemsById = {};
            for (const id of itemIds) {
              const it = await one(`SELECT ROWID, Name, Unit FROM Items WHERE ROWID = '${zqRaw(id)}' AND OrgID = '${org}'`);
              if (it) itemsById[id] = it.Items;
            }
            values.Line_Items = correspondence.formatLineItems(lineRows.map(l => ({
              description: itemsById[l.PRItems.ItemID]?.Name || '',
              quantity: l.PRItems.Quantity,
              uom: itemsById[l.PRItems.ItemID]?.Unit || '',
              requiredDate: values.Delivery_Date
            })));
          }
        }
      }
    }

    if (bidId) {
      const row = await one(`SELECT * FROM Bids WHERE ROWID = '${zqRaw(bidId)}' AND OrgID = '${org}'`);
      if (row) {
        values.Award_Amount = Number(row.Bids.TotalBidAmount || 0).toFixed(2);
        if (!vendorId && row.Bids.VendorID) req.body.vendorId = row.Bids.VendorID;
      }
    }

    if (poId) {
      const row = await one(`SELECT * FROM POs WHERE ROWID = '${zqRaw(poId)}' AND OrgID = '${org}'`);
      if (row) {
        values.PO_Number = row.POs.PONumber;
        values.Award_Amount = Number(row.POs.TotalAmount || 0).toFixed(2);
        values.Delivery_Date = row.POs.ExpectedDate ? String(row.POs.ExpectedDate).slice(0, 10) : values.Delivery_Date;
      }
    }

    const vid = vendorId || req.body.vendorId;
    if (vid) {
      const row = await one(`SELECT * FROM Suppliers WHERE ROWID = '${zqRaw(vid)}' AND OrgID = '${org}'`);
      if (row) {
        values.Supplier_Company_Name = row.Suppliers.Name;
        values.Recipient_Email = row.Suppliers.ContactEmail || '';
        const contact = await one(
          `SELECT Name, Email FROM VendorContacts WHERE VendorID = '${zqRaw(vid)}' AND OrgID = '${org}' LIMIT 1`
        );
        values.Supplier_Contact_Name = contact?.VendorContacts?.Name || row.Suppliers.Name;
        if (contact?.VendorContacts?.Email) values.Recipient_Email = contact.VendorContacts.Email;
      }
    }

    // Anything the caller typed wins over what we resolved.
    Object.assign(values, overrides);

    const draft = correspondence.render(template, values);
    res.json({ ...draft, recipient: values.Recipient_Email || '', values });
  } catch (err) { fail(res, err); }
});

// Award an RFQ to a winning bid — closes competitive sourcing and promotes the
// requisition into a Purchase Order for the chosen vendor at the bid price.
// Marks the winning Bid 'Awarded', the rest 'Rejected', and closes the RFQ.
app.post('/api/rfqs/:rfqId/award', requirePermission('create_po'), async (req, res) => {
  try {
    const { BidID } = req.body;
    if (!BidID) return res.status(400).json({ error: 'Select the winning bid to award.' });

    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    // 1. Load the RFQ (must be Published — not already awarded/closed).
    const rfqRows = await zcql.executeZCQLQuery(`SELECT * FROM RFQs WHERE ROWID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (rfqRows.length === 0) return res.status(404).json({ error: 'RFQ not found.' });
    const rfq = rfqRows[0].RFQs;
    if (rfq.Status !== 'Published') return res.status(400).json({ error: `This RFQ is ${rfq.Status} — only a Published RFQ can be awarded.` });

    // 2. Load the winning bid (must belong to this RFQ/org).
    const bidRows = await zcql.executeZCQLQuery(`SELECT * FROM Bids WHERE ROWID = '${zqRaw(BidID)}' AND RFQID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (bidRows.length === 0) return res.status(404).json({ error: 'That bid is not part of this RFQ.' });
    const winningBid = bidRows[0].Bids;
    const winnerVendorId = String(winningBid.VendorID);
    const awardedTotal = Number(winningBid.TotalBidAmount || 0);

    // 3. Confirm the winning vendor still exists.
    const supRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM Suppliers WHERE ROWID = '${zqRaw(winnerVendorId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (supRows.length === 0) return res.status(400).json({ error: 'The winning vendor no longer exists.' });

    // 4. Source the line items from the RFQ's originating PR (the RFQ carries PRID).
    const prId = rfq.PRID ? String(rfq.PRID) : '';
    const prItemsRows = prId
      ? await zcql.executeZCQLQuery(`SELECT * FROM PRItems WHERE PRID = '${zqRaw(prId)}' AND OrgID = '${zqRaw(req.orgId)}'`)
      : [];
    const prItems = prItemsRows.map(r => r.PRItems);

    // Re-price the PR lines to the awarded total: scale each line's estimated
    // price by (awardedTotal / estimatedTotal) so the PO sums to the bid amount.
    // Falls back to estimated prices if the estimate total is zero/absent.
    const estTotal = prItems.reduce((s, it) => s + Number(it.EstimatedPrice || 0) * Number(it.Quantity || 0), 0);
    const scale = estTotal > 0 && awardedTotal > 0 ? awardedTotal / estTotal : 1;

    // 5. Create the PO for the winning vendor.
    const poNumber = `PO-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const insertedPO = await safeTable(req.catalystApp, 'POs').insertRow({
      OrgID: req.orgId,
      PONumber: poNumber,
      PRID: prId || null,
      SupplierID: winnerVendorId,
      TotalAmount: awardedTotal || estTotal,
      Status: 'Sent_To_Supplier',
      Terms: (winningBid.ProposalNotes || '').slice(0, 2000) || 'Awarded via RFQ.',
      Notes: `Awarded from ${rfq.RFQNumber} (bid ${BidID}).`
    });
    const poId = insertedPO.ROWID;

    // 6. Create PO lines (re-priced to the award).
    if (prItems.length > 0) {
      await safeTable(req.catalystApp, 'POItems').insertRows(prItems.map(item => ({
        OrgID: req.orgId,
        POID: String(poId),
        ItemID: String(item.ItemID),
        Quantity: Number(item.Quantity),
        UnitPrice: Number((Number(item.EstimatedPrice || 0) * scale).toFixed(4))
      })));
    }

    // 7. Mark the winning bid Awarded, all sibling bids Rejected.
    await safeTable(req.catalystApp, 'Bids').updateRow({ ROWID: winningBid.ROWID, Status: 'Awarded' });
    const siblingBids = await zcql.executeZCQLQuery(`SELECT ROWID FROM Bids WHERE RFQID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    for (const b of siblingBids) {
      const id = b.Bids.ROWID;
      if (String(id) !== String(winningBid.ROWID)) {
        await safeTable(req.catalystApp, 'Bids').updateRow({ ROWID: id, Status: 'Rejected' });
      }
    }

    // 8. Close the RFQ and mark the source PR converted.
    await safeTable(req.catalystApp, 'RFQs').updateRow({ ROWID: String(req.params.rfqId), Status: 'Awarded' });
    if (prId) {
      await safeTable(req.catalystApp, 'PRs').updateRow({ ROWID: prId, Status: 'Converted_To_PO' }).catch(() => {});
    }

    fireWebhooks(req, 'po.created', { id: poId, number: poNumber, rfqId: String(req.params.rfqId), vendorId: winnerVendorId, total: awardedTotal });
    res.status(201).json({
      _audit: await audit(req, 'award', 'RFQ', req.params.rfqId, { bidId: BidID, vendorId: winnerVendorId, poId, total: awardedTotal }),
      message: 'RFQ awarded — purchase order created for the winning vendor.',
      POID: poId,
      PONumber: poNumber,
      TotalAmount: awardedTotal || estTotal
    });
  } catch (err) {
    console.error('[RFQ Award Error]:', err);
    fail(res, err);
  }
});


// ==========================================
// 🛒 PURCHASE ORDERS (PO)
// ==========================================

// Get all POs
app.get('/api/pos', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE OrgID = '${zqRaw(req.orgId)}' ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.POs));
  } catch (err) {
    fail(res, err);
  }
});

// Get single PO with items
app.get('/api/pos/:id', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const poRows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (poRows.length === 0) return res.status(404).json({ error: 'PO not found' });

    const itemRows = await zcql.executeZCQLQuery(`SELECT * FROM POItems WHERE POID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    
    res.json({
      po: poRows[0].POs,
      items: itemRows.map(r => r.POItems)
    });
  } catch (err) {
    fail(res, err);
  }
});

// Convert Approved Requisition to Purchase Order
app.post('/api/pos/convert/:prId', requirePermission('create_po'), async (req, res) => {
  try {
    const { SupplierID, Terms } = req.body;
    if (!SupplierID) return res.status(400).json({ error: 'SupplierID is required to convert a PR to a PO' });

    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    // 1. Verify PR status
    const prRows = await zcql.executeZCQLQuery(`SELECT * FROM PRs WHERE ROWID = '${zqRaw(req.params.prId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prRows.length === 0) return res.status(404).json({ error: 'Purchase Requisition not found' });

    const pr = prRows[0].PRs;
    if (pr.Status !== 'Approved') {
      return res.status(400).json({ error: `Only fully approved requisitions can be converted to POs. Current PR Status: ${pr.Status}` });
    }

    // 2. Fetch Supplier
    const supplierRows = await zcql.executeZCQLQuery(`SELECT * FROM Suppliers WHERE ROWID = '${zqRaw(SupplierID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (supplierRows.length === 0) {
      return res.status(400).json({ error: 'Selected supplier does not exist' });
    }

    // 3. Fetch Requisition Line Items
    const prItemsRows = await zcql.executeZCQLQuery(`SELECT * FROM PRItems WHERE PRID = '${zqRaw(req.params.prId)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (prItemsRows.length === 0) {
      return res.status(400).json({ error: 'Requisition contains no line items to convert' });
    }

    const prItems = prItemsRows.map(r => r.PRItems);

    // 4. Create PO contract
    const poNumber = `PO-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const poTable = safeTable(req.catalystApp, 'POs');
    const insertedPO = await poTable.insertRow({
      OrgID: req.orgId,
      PONumber: poNumber,
      PRID: String(req.params.prId),
      SupplierID: String(SupplierID),
      TotalAmount: pr.TotalAmount,
      Status: 'Sent_To_Supplier',
      Terms: Terms || 'Standard Net 30 payment terms.'
    });

    const poId = insertedPO.ROWID;

    // 5. Create PO lines
    const poItemsTable = safeTable(req.catalystApp, 'POItems');
    const poLines = prItems.map(item => ({
      OrgID: req.orgId,
      POID: String(poId),
      ItemID: String(item.ItemID),
      Quantity: Number(item.Quantity),
      UnitPrice: Number(item.EstimatedPrice)
    }));

    await poItemsTable.insertRows(poLines);

    // 6. Update PR status
    await safeTable(req.catalystApp, 'PRs').updateRow({
      ROWID: req.params.prId,
      Status: 'Converted_To_PO'
    });

    fireWebhooks(req, 'po.created', { id: poId, number: poNumber, prId: req.params.prId, total: Number(pr.TotalAmount || 0) });
    res.status(201).json({
      _audit: await audit(req, 'convert', 'PO', poId, { from: 'PR', prId: req.params.prId }),
      message: 'Requisition successfully promoted to Purchase Order',
      POID: poId,
      PONumber: poNumber,
      TotalAmount: pr.TotalAmount
    });
  } catch (err) {
    console.error('[PO Conversion Error]:', err);
    fail(res, err);
  }
});


// ==========================================
// 🚛 GOODS RECEIPT NOTES (GRN)
// ==========================================

// Get all GRNs
app.get('/api/grns', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM GRNs WHERE OrgID = '${zqRaw(req.orgId)}' ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.GRNs));
  } catch (err) {
    fail(res, err);
  }
});

// Single receipt with its lines — powers the record view and the printed GRN.
app.get('/api/grns/:id', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM GRNs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const grn = rows[0]?.GRNs;
    if (!grn) return res.status(404).json({ error: 'Goods receipt not found.' });
    const lineRows = await zcql.executeZCQLQuery(
      `SELECT * FROM GRNItems WHERE GRNID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    res.json({ grn, items: lineRows.map(r => r.GRNItems) });
  } catch (err) { fail(res, err); }
});

// Log new Goods Receipt Note
app.post('/api/grns', requirePermission('receive_grn'), async (req, res) => {
  try {
    const { POID, ReceivedByID, ReceivedDate, Items } = req.body;
    if (!POID || !Items || !Array.isArray(Items) || Items.length === 0) {
      return res.status(400).json({ error: 'POID and received line items are required' });
    }

    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    // 1. Verify PO exists
    const poRows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE ROWID = '${zqRaw(POID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (poRows.length === 0) return res.status(404).json({ error: 'Purchase Order not found' });
    if (poRows[0].POs.Status === 'Cancelled') return res.status(400).json({ error: 'Cannot receive against a cancelled PO.' });

    // 1a. INVARIANT: cumulative received (this GRN + prior GRNs) must not exceed
    // each PO line's ordered quantity. (Spec Part L rule 2 — over-receipt block.)
    const poLineRows = await zcql.executeZCQLQuery(`SELECT ItemID, Quantity FROM POItems WHERE POID = '${zqRaw(POID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const orderedByItem = {};
    poLineRows.forEach(r => { orderedByItem[r.POItems.ItemID] = (orderedByItem[r.POItems.ItemID] || 0) + Number(r.POItems.Quantity); });

    const priorGrnRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM GRNs WHERE POID = '${zqRaw(POID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const priorReceivedByItem = {};
    if (priorGrnRows.length > 0) {
      const ids = priorGrnRows.map(r => `'${zqRaw(r.GRNs.ROWID)}'`).join(',');
      const priorLines = await zcql.executeZCQLQuery(`SELECT ItemID, QuantityReceived FROM GRNItems WHERE GRNID IN (${ids}) AND OrgID = '${zqRaw(req.orgId)}'`);
      priorLines.forEach(r => { priorReceivedByItem[r.GRNItems.ItemID] = (priorReceivedByItem[r.GRNItems.ItemID] || 0) + Number(r.GRNItems.QuantityReceived); });
    }

    for (const line of Items) {
      const recv = Number(line.QuantityReceived || 0);
      const acc = Number(line.QuantityAccepted || 0);
      const rej = Number(line.QuantityRejected || 0);
      if (recv < 0 || acc < 0 || rej < 0) return res.status(400).json({ error: 'Quantities cannot be negative.' });
      if (acc + rej > recv) return res.status(400).json({ error: 'Accepted + rejected cannot exceed received quantity.' });
      const ordered = orderedByItem[line.ItemID] ?? Infinity;
      const already = priorReceivedByItem[line.ItemID] || 0;
      if (already + recv > ordered) {
        return res.status(400).json({ error: `Over-receipt blocked: item would receive ${already + recv} against an order of ${ordered}.` });
      }
    }

    // 2. Log main Goods Receipt record
    const grnNumber = `GRN-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const grnTable = safeTable(req.catalystApp, 'GRNs');
    const insertedGRN = await grnTable.insertRow({
      OrgID: req.orgId,
      GRNNumber: grnNumber,
      POID: String(POID),
      ReceivedByID: ReceivedByID ? String(ReceivedByID) : null,
      ReceivedDate: toCatalystDateTime(ReceivedDate)
    });

    const grnId = insertedGRN.ROWID;

    // 3. Record individual item accepted / rejected details
    const grnLines = Items.map(line => ({
      OrgID: req.orgId,
      GRNID: String(grnId),
      ItemID: String(line.ItemID),
      QuantityReceived: Number(line.QuantityReceived || 0),
      QuantityAccepted: Number(line.QuantityAccepted || 0),
      QuantityRejected: Number(line.QuantityRejected || 0)
    }));

    await safeTable(req.catalystApp, 'GRNItems').insertRows(grnLines);

    // 4. Update PO status to Fulfilled
    await safeTable(req.catalystApp, 'POs').updateRow({
      ROWID: String(POID),
      Status: 'Fulfilled'
    });

    fireWebhooks(req, 'grn.created', { id: grnId, number: GRNNumber, poId: POID });
    res.status(201).json({
      _audit: await audit(req, 'receive', 'GRN', grnId, { po: POID }),
      message: 'Goods Receipt Note logged successfully',
      GRNID: grnId,
      GRNNumber
    });
  } catch (err) {
    console.error('[GRN Logging Error]:', err);
    fail(res, err);
  }
});


// ==========================================
// 🛡️ INVOICES & 3-WAY MATCHING ENGINE
// ==========================================

// Get all Invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Invoices WHERE OrgID = '${zqRaw(req.orgId)}' ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.Invoices));
  } catch (err) {
    fail(res, err);
  }
});

// Helper Function: Execute the Core 3-Way Matching Logic
async function run3WayMatch(catalystApp, orgId, invoiceId) {
  const zcql = catalystApp.zcql();
  const datastore = catalystApp.datastore();

  // 1. Fetch Invoice
  const invRows = await zcql.executeZCQLQuery(`SELECT * FROM Invoices WHERE ROWID = '${zqRaw(invoiceId)}' AND OrgID = '${zqRaw(orgId)}'`);
  if (invRows.length === 0) return { error: 'Invoice not found' };
  const invoice = invRows[0].Invoices;

  const poId = invoice.POID;

  // 2. Fetch PO and its ordered items
  const poRows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE ROWID = '${zqRaw(poId)}' AND OrgID = '${zqRaw(orgId)}'`);
  if (poRows.length === 0) {
    return { status: 'Discrepancy', score: 'Discrepancy: Associated PO not found.' };
  }
  const po = poRows[0].POs;

  const poItemsRows = await zcql.executeZCQLQuery(`SELECT * FROM POItems WHERE POID = '${zqRaw(poId)}' AND OrgID = '${zqRaw(orgId)}'`);
  const poItems = poItemsRows.map(r => r.POItems);

  // 3. Fetch all GRNs & GRNItems for this PO to find received totals
  const grnRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM GRNs WHERE POID = '${zqRaw(poId)}' AND OrgID = '${zqRaw(orgId)}'`);
  const grnIds = grnRows.map(r => r.GRNs.ROWID);

  const receivedTotals = {}; // SKU or ItemID -> QuantityAccepted
  if (grnIds.length > 0) {
    const idsList = grnIds.map(id => `'${zqRaw(id)}'`).join(',');
    const grnItemsRows = await zcql.executeZCQLQuery(`SELECT * FROM GRNItems WHERE GRNID IN (${idsList}) AND OrgID = '${zqRaw(orgId)}'`);
    const grnItems = grnItemsRows.map(r => r.GRNItems);
    
    grnItems.forEach(line => {
      receivedTotals[line.ItemID] = (receivedTotals[line.ItemID] || 0) + Number(line.QuantityAccepted);
    });
  }

  // 4. Perform comparison matching
  let status = 'Matched';
  let matchScoreMessage = '100% (Perfect 3-Way Match Verified)';

  // Total invoice amount vs PO total amount check
  const invAmount = Number(invoice.Amount);
  const poAmount = Number(po.TotalAmount);
  const amountDiff = Math.abs(invAmount - poAmount);

  // Configurable match tolerance (Settings → Bills). Variances within tolerance
  // are FLAGGED for review, not hard-rejected — common with delivery breakage /
  // short-supply in hospitality. Default 2%.
  let tolerancePct = 2;
  try {
    const orgRows = await zcql.executeZCQLQuery(`SELECT Settings FROM Organizations WHERE ROWID = '${zqRaw(orgId)}'`);
    const s = JSON.parse(orgRows[0]?.Organizations?.Settings || '{}');
    const t = Number(s.modulePrefs?.invoices?.matchTolerancePct);
    if (!isNaN(t) && t >= 0) tolerancePct = t;
  } catch {}
  const toleranceAmt = poAmount * (tolerancePct / 100);

  // If there is no GRN associated with the PO yet
  if (grnIds.length === 0) {
    status = 'Unmatched';
    matchScoreMessage = 'Warning: No Goods Receipt (GRN) found on file for this Purchase Order.';
  } else {
    // Check line by line to detect price or quantity discrepancies
    for (const poLine of poItems) {
      const itemId = poLine.ItemID;
      const orderedQty = Number(poLine.Quantity);
      const poPrice = Number(poLine.UnitPrice);
      const acceptedQty = receivedTotals[itemId] || 0;

      // Fetch Item SKU
      // Escaped and tenant-scoped. ItemID arrives from a PO line we already
      // read under this org, so it is trusted today — but a lookup by bare
      // ROWID is one refactor away from being a cross-tenant read, and the
      // OrgID filter costs nothing.
      const itemRows = await zcql.executeZCQLQuery(
        `SELECT SKU FROM Items WHERE ROWID = '${zqRaw(itemId)}' AND OrgID = '${zqRaw(orgId)}' LIMIT 1`);
      const sku = itemRows.length > 0 ? itemRows[0].Items.SKU : `ID:${itemId}`;

      // Quantity comparison (Invoice implicitly bills for full PO amount or we evaluate totals)
      if (acceptedQty < orderedQty) {
        status = 'Discrepancy';
        matchScoreMessage = `Quantity Discrepancy on ${sku}: Ordered ${orderedQty}, but GRN Accepted only ${acceptedQty}`;
        break;
      }
    }
  }

  // Financial comparison with tolerance:
  //  ≤ $1 rounding    → still a perfect match
  //  ≤ tolerance      → Review (flagged, payment allowed after check)
  //  > tolerance      → Discrepancy (hard flag)
  if (status === 'Matched' && amountDiff > 1.00) {
    if (amountDiff <= Math.max(1.00, toleranceAmt)) {
      status = 'Review';
      matchScoreMessage = `Within tolerance (${tolerancePct}%): invoice ${invAmount.toFixed(2)} vs PO ${poAmount.toFixed(2)} (diff ${amountDiff.toFixed(2)}) — flagged for review.`;
    } else {
      status = 'Discrepancy';
      matchScoreMessage = `Financial Discrepancy: Invoice total is ${invAmount.toFixed(2)}, but PO total is ${poAmount.toFixed(2)} (exceeds ${tolerancePct}% tolerance).`;
    }
  }

  // 5. Commit match results to the Invoice record
  await safeTable(catalystApp, 'Invoices').updateRow({
    ROWID: String(invoiceId),
    Status: status,
    MatchScore: matchScoreMessage
  });

  return { status, score: matchScoreMessage };
}

// Create supplier Invoice and automatically trigger 3-Way Matching Engine
app.post('/api/invoices', requirePermission('match_invoice'), async (req, res) => {
  try {
    const { InvoiceNumber, POID, SupplierInvoiceDate, Amount } = req.body;
    if (!InvoiceNumber || !POID || Amount === undefined) {
      return res.status(400).json({ error: 'InvoiceNumber, POID, and Amount are required' });
    }
    if (Number(Amount) <= 0) return res.status(400).json({ error: 'Invoice amount must be positive.' });

    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    // Guard: PO must exist in this org, and not be duplicated by invoice number.
    const poCheck = await zcql.executeZCQLQuery(`SELECT ROWID FROM POs WHERE ROWID = '${zqRaw(POID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (poCheck.length === 0) return res.status(404).json({ error: 'Purchase Order not found in this organization.' });
    const dupCheck = await zcql.executeZCQLQuery(`SELECT ROWID FROM Invoices WHERE InvoiceNumber = '${zqRaw(InvoiceNumber)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (dupCheck.length > 0) return res.status(409).json({ error: `Invoice number "${InvoiceNumber}" already exists.` });

    // Insert Invoice in Unmatched state first
    const insertedInv = await safeTable(req.catalystApp, 'Invoices').insertRow({
      OrgID: req.orgId,
      InvoiceNumber,
      POID: String(POID),
      SupplierInvoiceDate: SupplierInvoiceDate || new Date().toISOString().slice(0, 10),
      Amount: Number(Amount),
      Status: 'Unmatched',
      MatchScore: 'Pending 3-Way Match execution...'
    });

    const invoiceId = insertedInv.ROWID;

    // Immediately trigger the 3-Way Matching Engine on-the-fly!
    const matchResult = await run3WayMatch(req.catalystApp, req.orgId, invoiceId);

    // Realize the spend against the budget: move this invoice's amount from the
    // PR's Committed reservation into actual Spent. Best-effort — a budget
    // mismatch must never block invoice logging.
    try {
      const scope = await budgetScopeForPO(req, POID);
      if (scope) await settleBudget(req, scope.department, Number(Amount), scope.propertyId);
    } catch (e) { console.warn('[Budget settle] failed:', e.message); }

    fireWebhooks(req, 'invoice.created', { id: invoiceId, number: InvoiceNumber, amount: Number(Amount), matchStatus: matchResult.status });
    res.status(201).json({
      _audit: await audit(req, 'create', 'Invoice', invoiceId, { number: InvoiceNumber, match: matchResult.status }),
      message: 'Invoice logged and matched successfully',
      InvoiceID: invoiceId,
      InvoiceNumber,
      MatchStatus: matchResult.status,
      MatchDetails: matchResult.score
    });
  } catch (err) {
    console.error('[Invoice Creation Error]:', err);
    fail(res, err);
  }
});

// Trigger a manual rematch for an existing Invoice
app.post('/api/invoices/:id/rematch', requirePermission('match_invoice'), async (req, res) => {
  try {
    const matchResult = await run3WayMatch(req.catalystApp, req.orgId, req.params.id);
    if (matchResult.error) return res.status(404).json({ error: matchResult.error });

    res.json({
      message: '3-Way matching recalculation complete',
      Status: matchResult.status,
      MatchScore: matchResult.score
    });
  } catch (err) {
    fail(res, err);
  }
});


// ==========================================
// 📊 BUDGETS & SPEND ANALYTICS
// ==========================================

// Get all Budgets
app.get('/api/budgets', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Budgets WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.Budgets));
  } catch (err) {
    console.warn('[Budgets API] Error fetching from datastore, returning sandbox placeholder:', err.message);
    // Return empty list so offline sandbox can serve dynamically
    res.json([]);
  }
});

// Create Budget
app.post('/api/budgets', requireAdmin, async (req, res) => {
  try {
    const { Department, Amount, FiscalYear } = req.body;
    if (!Department || Amount === undefined) {
      return res.status(400).json({ error: 'Department and Amount are required' });
    }

    const table = safeTable(req.catalystApp, 'Budgets');
    const newBudget = await table.insertRow({
      OrgID: req.orgId,
      Department,
      Amount: Number(Amount),
      FiscalYear: FiscalYear || new Date().getFullYear().toString(),
      Spent: 0.0,
      Status: 'Active'
    });

    res.status(201).json(newBudget);
  } catch (err) {
    fail(res, err);
  }
});

// Update Budget (e.g. adjust limits or record expenditures)
app.put('/api/budgets/:id', requireAdmin, async (req, res) => {
  try {
    const { Amount, Spent, Status } = req.body;
    const datastore = req.catalystApp.datastore();
    
    const updateData = { ROWID: req.params.id };
    if (Amount !== undefined) updateData.Amount = Number(Amount);
    if (Spent !== undefined) updateData.Spent = Number(Spent);
    if (Status) updateData.Status = Status;

    const updatedBudget = await safeTable(req.catalystApp, 'Budgets').updateRow(updateData);
    res.json(updatedBudget);
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/budgets/:id', requireAdmin, async (req, res) => {
  try {
    await safeTable(req.catalystApp, 'Budgets').deleteRow(req.params.id);
    await audit(req, 'delete', 'Budget', req.params.id, {});
    res.json({ message: 'Budget deleted' });
  } catch (err) { fail(res, err); }
});

// Get Spend Analytics Summary
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    
    const posRows = await zcql.executeZCQLQuery(`SELECT TotalAmount, Status FROM POs WHERE OrgID = '${zqRaw(req.orgId)}'`).catch(() => []);
    const prsRows = await zcql.executeZCQLQuery(`SELECT TotalAmount, Status FROM PRs WHERE OrgID = '${zqRaw(req.orgId)}'`).catch(() => []);
    const invRows = await zcql.executeZCQLQuery(`SELECT Amount, Status FROM Invoices WHERE OrgID = '${zqRaw(req.orgId)}'`).catch(() => []);

    const pos = posRows.map(r => r.POs || r);
    const prs = prsRows.map(r => r.PRs || r);
    const invoices = invRows.map(r => r.Invoices || r);

    let totalSpendApproved = 0;
    let totalSpendPending = 0;

    pos.forEach(po => {
      const amt = Number(po.TotalAmount || 0);
      if (po.Status === 'Fulfilled' || po.Status === 'Sent_To_Supplier') {
        totalSpendApproved += amt;
      } else {
        totalSpendPending += amt;
      }
    });

    res.json({
      totalSpendApproved,
      totalSpendPending,
      poCount: pos.length,
      prCount: prs.length,
      invoiceCount: invoices.length
    });
  } catch (err) {
    fail(res, err);
  }
});


// ==========================================
// 💳 PAYMENTS & BILLING
// ==========================================

// Get all payments
app.get('/api/payments', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Payments WHERE OrgID = '${zqRaw(req.orgId)}' ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.Payments));
  } catch (err) {
    res.json([]);
  }
});

// Record a Payment against an Invoice
app.post('/api/payments', perm('payments','create'), async (req, res) => {
  try {
    const { InvoiceID, AmountPaid, PaymentMode, ReferenceNumber } = req.body;
    if (!InvoiceID || AmountPaid === undefined) return res.status(400).json({ error: 'InvoiceID and AmountPaid are required' });
    if (Number(AmountPaid) <= 0) return res.status(400).json({ error: 'Payment amount must be positive.' });

    const zcql = req.catalystApp.zcql();
    const datastore = req.catalystApp.datastore();

    // 1. Fetch Invoice
    const invRows = await zcql.executeZCQLQuery(`SELECT * FROM Invoices WHERE ROWID = '${zqRaw(InvoiceID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (invRows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    if (invRows[0].Invoices.Status === 'Paid') return res.status(400).json({ error: 'This invoice is already fully paid.' });

    // INVARIANT: total payments must not exceed the invoice amount.
    const priorPays = await zcql.executeZCQLQuery(`SELECT AmountPaid FROM Payments WHERE InvoiceID = '${zqRaw(InvoiceID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    const alreadyPaid = priorPays.reduce((s, r) => s + Number(r.Payments.AmountPaid || 0), 0);
    const invoiceAmount = Number(invRows[0].Invoices.Amount || 0);
    if (alreadyPaid + Number(AmountPaid) > invoiceAmount + 0.01) {
      return res.status(400).json({ error: `Overpayment blocked: ${(alreadyPaid + Number(AmountPaid)).toFixed(2)} would exceed the invoice amount of ${invoiceAmount.toFixed(2)}.` });
    }

    // 2. Log Payment
    const paymentTable = safeTable(req.catalystApp, 'Payments');
    const insertedPayment = await paymentTable.insertRow({
      OrgID: req.orgId,
      InvoiceID: String(InvoiceID),
      AmountPaid: Number(AmountPaid),
      PaymentDate: new Date().toISOString(),
      PaymentMode: PaymentMode || 'Bank Transfer',
      ReferenceNumber: ReferenceNumber || `TXN-${Date.now().toString().slice(-6)}`
    });

    // 3. Update Invoice Status — only 'Paid' when cumulative payments actually
    // cover the invoice; a partial payment leaves it 'Partially_Paid' (which the
    // guard above still lets receive further payments). Previously this ALWAYS
    // set 'Paid' even for a partial payment, which then wrongly blocked the rest.
    const totalPaidNow = alreadyPaid + Number(AmountPaid);
    const fullyPaid = totalPaidNow >= invoiceAmount - 0.01;
    await safeTable(req.catalystApp, 'Invoices').updateRow({
      ROWID: String(InvoiceID),
      Status: fullyPaid ? 'Paid' : 'Partially_Paid'
    });

    fireWebhooks(req, 'payment.created', { id: insertedPayment.ROWID, invoiceId: String(InvoiceID), amount: Number(AmountPaid), mode: PaymentMode || 'Bank Transfer', fullyPaid });
    res.status(201).json({
      message: 'Payment recorded successfully',
      PaymentID: insertedPayment.ROWID
    });
  } catch (err) {
    fail(res, err);
  }
});


// ==========================================
// 🔄 RECURRING BILLS
// ==========================================
app.get('/api/recurring-bills', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM RecurringBills WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.RecurringBills));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/recurring-bills', perm('payments','create'), async (req, res) => {
  try {
    const { VendorID, Amount, Frequency, StartDate, EndDate } = req.body;
    const table = safeTable(req.catalystApp, 'RecurringBills');
    const newBill = await table.insertRow({
      OrgID: req.orgId,
      VendorID,
      Amount: Number(Amount),
      Frequency: Frequency || 'Monthly',
      StartDate,
      EndDate,
      Status: 'Active'
    });
    res.status(201).json(newBill);
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 💸 VENDOR CREDITS
// ==========================================
app.get('/api/vendor-credits', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM VendorCredits WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.VendorCredits));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/vendor-credits', perm('payments','create'), async (req, res) => {
  try {
    const { VendorID, CreditAmount, ReferenceNumber, Reason } = req.body;
    const table = safeTable(req.catalystApp, 'VendorCredits');
    const newCredit = await table.insertRow({
      OrgID: req.orgId,
      VendorID,
      CreditAmount: Number(CreditAmount),
      Balance: Number(CreditAmount),
      ReferenceNumber: ReferenceNumber || `CR-${Date.now().toString().slice(-6)}`,
      Reason,
      Status: 'Open'
    });
    res.status(201).json(newCredit);
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 🧩 CUSTOM MODULES BUILDER
// ==========================================
app.get('/api/custom-modules', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM CustomModules WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.CustomModules));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/custom-modules', requireAdmin, async (req, res) => {
  try {
    const { ModuleName, FieldsSchema } = req.body;
    const table = safeTable(req.catalystApp, 'CustomModules');
    const newModule = await table.insertRow({
      OrgID: req.orgId,
      ModuleName,
      FieldsSchema: typeof FieldsSchema === 'string' ? FieldsSchema : JSON.stringify(FieldsSchema),
      Status: 'Active'
    });
    res.status(201).json(newModule);
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 📊 ADVANCED ANALYTICS ENGINE
// ==========================================
app.get('/api/analytics/payables', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const invRows = await zcql.executeZCQLQuery(`SELECT * FROM Invoices WHERE OrgID = '${zqRaw(req.orgId)}'`);
    const invoices = invRows.map(r => r.Invoices);

    let aging = {
      'Current': 0,
      '1_15': 0,
      '16_30': 0,
      '31_plus': 0
    };

    // Payments already made, summed per invoice — so a Partially_Paid invoice
    // only ages its OUTSTANDING remainder, not its full amount.
    const payRows = await zcql.executeZCQLQuery(`SELECT InvoiceID, AmountPaid FROM Payments WHERE OrgID = '${zqRaw(req.orgId)}'`);
    const paidByInvoice = {};
    payRows.forEach(r => {
      const id = String(r.Payments.InvoiceID);
      paidByInvoice[id] = (paidByInvoice[id] || 0) + Number(r.Payments.AmountPaid || 0);
    });

    const now = new Date();
    invoices.forEach(inv => {
      if (inv.Status !== 'Paid') {
        const outstanding = Number(inv.Amount || 0) - (paidByInvoice[String(inv.ROWID)] || 0);
        if (outstanding <= 0) return; // fully covered by payments even if status lags
        // NOTE: the system column is CREATEDTIME (no underscore) — CREATED_TIME
        // was always undefined, making the date Invalid when SupplierInvoiceDate
        // was absent.
        const invDate = new Date(inv.SupplierInvoiceDate || inv.CREATEDTIME);
        const diffDays = Math.ceil((now - invDate) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) aging['Current'] += outstanding;
        else if (diffDays <= 15) aging['1_15'] += outstanding;
        else if (diffDays <= 30) aging['16_30'] += outstanding;
        else aging['31_plus'] += outstanding;
      }
    });

    res.json({ aging });
  } catch (err) {
    res.json({ aging: { 'Current': 0, '1_15': 0, '16_30': 0, '31_plus': 0 } });
  }
});

app.get('/api/analytics/purchases', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const poRows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE OrgID = '${zqRaw(req.orgId)}'`);
    const pos = poRows.map(r => r.POs);
    
    // Cycle time
    let totalCycleTime = 0;
    let count = 0;
    let maverickSpend = 0; // Simulated
    
    pos.forEach(po => {
      if(po.Status === 'Fulfilled') {
        // System columns are CREATEDTIME / MODIFIEDTIME (no underscore) — the
        // underscore variants were always undefined → NaN cycle time.
        const created = new Date(po.CREATEDTIME);
        const fulfilled = new Date(po.MODIFIEDTIME); // approximation
        if (isNaN(created) || isNaN(fulfilled)) return;
        totalCycleTime += (fulfilled - created) / (1000 * 60 * 60 * 24);
        count++;
      }
    });
    
    res.json({
      avgCycleTime: count > 0 ? (totalCycleTime / count).toFixed(1) : 0,
      maverickSpend: 5.4, // Simulation for UI
      savingsIdentified: 12500
    });
  } catch (err) {
    res.json({ avgCycleTime: 0, maverickSpend: 0, savingsIdentified: 0 });
  }
});

// ==========================================
// 🔌 INTEGRATIONS — Zoho Books sync + webhooks
// ==========================================
// Per-org integration configs live in the Integrations table (Provider = 'books', …).
// Secrets (client secret / refresh token) never leave the server — GET responses
// return a mask, and PUT keeps the stored value when the mask is sent back.

const SECRET_MASK = '••••••••';

async function getIntegrationRow(req, provider) {
  const zcql = req.catalystApp.zcql();
  const rows = await zcql.executeZCQLQuery(
    `SELECT * FROM Integrations WHERE OrgID = '${zqRaw(req.orgId)}' AND Provider = '${zqRaw(provider)}'`);
  return rows[0]?.Integrations || null;
}

// Client-facing view of the Books config. With the shared-app OAuth model the
// customer never sees/enters client credentials — only whether they've connected,
// which Books org they sync into, and their sync toggles.
function maskBooksConfig(cfg) {
  return {
    dc: cfg.dc || 'com',
    connected: !!cfg.refreshToken,
    booksOrgId: cfg.booksOrgId || '',
    booksOrgName: cfg.booksOrgName || '',
    sync: { vendors: true, items: true, bills: false, ...(cfg.sync || {}) }
  };
}

// Exchange an authorization CODE (from the consent redirect) for tokens. Returns
// { refreshToken, accessToken }. Uses the shared platform client credentials.
async function booksExchangeCode(code, dc) {
  if (!booksConfigured()) throw new AppError(BOOKS_NOT_CONFIGURED, { status: 503, code: 'BOOKS_NOT_CONFIGURED' });
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: BOOKS_OAUTH.clientId,
    client_secret: BOOKS_OAUTH.clientSecret,
    redirect_uri: BOOKS_REDIRECT_URI,
    code
  });
  const r = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15000)
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new AppError(j.error || 'Zoho did not return an access token for this authorization.', { status: 502 });
  return { refreshToken: j.refresh_token || '', accessToken: j.access_token };
}

// OAuth: exchange the customer's stored refresh token for a fresh access token,
// using the shared platform client credentials (NOT per-customer secrets).
async function booksAccessToken(cfg) {
  const dc = cfg.dc || 'com';
  if (!booksConfigured()) throw new AppError(BOOKS_NOT_CONFIGURED, { status: 503, code: 'BOOKS_NOT_CONFIGURED' });
  if (!cfg.refreshToken) throw new AppError('Zoho Books is not connected yet. Click “Connect to Zoho Books” to sign in.', { status: 409 });
  const params = new URLSearchParams({
    refresh_token: cfg.refreshToken,
    client_id: BOOKS_OAUTH.clientId,
    client_secret: BOOKS_OAUTH.clientSecret,
    grant_type: 'refresh_token'
  });
  const r = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15000)
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) {
    throw new AppError(j.error === 'invalid_code'
      ? 'Your Zoho Books connection has expired — please reconnect.'
      : (j.error || 'Could not obtain a Zoho Books access token.'), { status: 502 });
  }
  return j.access_token;
}

async function booksFetch(cfg, token, path, { method = 'GET', body } = {}) {
  const dc = cfg.dc || 'com';
  const sep = path.includes('?') ? '&' : '?';
  const orgParam = cfg.booksOrgId ? `${sep}organization_id=${encodeURIComponent(cfg.booksOrgId)}` : '';
  const r = await fetch(`https://www.zohoapis.${dc}/books/v3${path}${orgParam}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const j = await r.json().catch(() => ({}));
  // Books wraps every response with { code, message, ... }; code 0 = success.
  if (typeof j.code === 'number' && j.code !== 0) throw new AppError(j.message || `Books error ${j.code}`, { status: 502 });
  if (!r.ok) throw new AppError(j.message || `Books API HTTP ${r.status}`, { status: 502 });
  return j;
}

// List integration statuses for the hub cards (no secrets).
app.get('/api/integrations', requireAdmin, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT Provider, Status, LastSyncAt FROM Integrations WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => ({
      Provider: r.Integrations.Provider,
      Status: r.Integrations.Status || 'Configured',
      LastSyncAt: r.Integrations.LastSyncAt || ''
    })));
  } catch (err) { res.json([]); }
});

// Zoho Books config (masked) + last sync log.
app.get('/api/integrations/books', requireAdmin, async (req, res) => {
  try {
    const row = await getIntegrationRow(req, 'books');
    if (!row) return res.json({ connected: false, status: 'Not connected', config: maskBooksConfig({}), log: null, lastSyncAt: '' });
    const cfg = safeParse(row.ConfigJson, {});
    res.json({
      connected: row.Status === 'Connected',
      status: row.Status || 'Configured',
      config: maskBooksConfig(cfg),
      log: safeParse(row.LastLogJson, null),
      lastSyncAt: row.LastSyncAt || ''
    });
  } catch (err) { fail(res, err); }
});

// Save non-secret Books options (data center + which Books org + sync toggles).
// Credentials are NEVER entered here — connection happens via OAuth (connect).
app.put('/api/integrations/books', requireAdmin, async (req, res) => {
  try {
    const { dc, booksOrgId, booksOrgName, sync } = req.body || {};
    const row = await getIntegrationRow(req, 'books');
    const prev = row ? safeParse(row.ConfigJson, {}) : {};
    const cfg = {
      ...prev,
      dc: ['com', 'in', 'eu', 'com.au', 'jp', 'sa', 'ca'].includes(dc) ? dc : (prev.dc || 'com'),
      booksOrgId: booksOrgId !== undefined ? String(booksOrgId).trim() : (prev.booksOrgId || ''),
      booksOrgName: booksOrgName !== undefined ? String(booksOrgName).trim() : (prev.booksOrgName || ''),
      sync: { vendors: true, items: true, bills: false, ...(prev.sync || {}), ...(sync || {}) }
    };
    const table = safeTable(req.catalystApp, 'Integrations');
    if (row) {
      await table.updateRow({ ROWID: row.ROWID, ConfigJson: JSON.stringify(cfg), Status: cfg.refreshToken ? 'Connected' : 'Configured' });
    } else {
      await table.insertRow({ OrgID: req.orgId, Provider: 'books', ConfigJson: JSON.stringify(cfg), Status: 'Configured' });
    }
    await audit(req, 'configure', 'Integration', 'books', {});
    res.json({ message: 'Zoho Books settings saved.', config: maskBooksConfig(cfg) });
  } catch (err) { fail(res, err); }
});

// STEP 1 of OAuth — build the Zoho consent URL. The admin clicks it, signs into
// THEIR Zoho account, and grants POS & Procurement access to their Books org.
// We carry the orgId (+ a random nonce) in the `state` param so the callback
// knows which tenant to store the resulting token against.
app.get('/api/integrations/books/connect', requireAdmin, async (req, res) => {
  try {
    // Fail here rather than sending the admin to Zoho's consent screen and
    // letting the handshake die on the callback with an opaque error.
    if (!booksConfigured()) {
      return res.status(503).json({ error: BOOKS_NOT_CONFIGURED, code: 'BOOKS_NOT_CONFIGURED' });
    }
    const dc = ['com', 'in', 'eu', 'com.au', 'jp', 'sa', 'ca'].includes(String(req.query.dc)) ? String(req.query.dc) : 'com';
    // Persist the chosen DC now so the callback (which has no body) can read it.
    const row = await getIntegrationRow(req, 'books');
    const prev = row ? safeParse(row.ConfigJson, {}) : {};
    const cfg = { ...prev, dc, oauthNonce: randomToken(12) };
    const table = safeTable(req.catalystApp, 'Integrations');
    if (row) await table.updateRow({ ROWID: row.ROWID, ConfigJson: JSON.stringify(cfg) });
    else await table.insertRow({ OrgID: req.orgId, Provider: 'books', ConfigJson: JSON.stringify(cfg), Status: 'Configured' });

    const state = `${req.orgId}:${cfg.oauthNonce}:${dc}`;
    const authUrl = `https://accounts.zoho.${dc}/oauth/v2/auth?` + new URLSearchParams({
      response_type: 'code',
      client_id: BOOKS_OAUTH.clientId,
      scope: BOOKS_OAUTH.scope,
      redirect_uri: BOOKS_REDIRECT_URI,
      access_type: 'offline',
      prompt: 'consent',
      state
    }).toString();
    res.json({ authUrl });
  } catch (err) { fail(res, err); }
});

// STEP 2 of OAuth — Zoho redirects the browser here with ?code&state. This runs
// WITHOUT the normal app auth (the browser is coming from Zoho, not our SPA), so
// it lives on the AUTH_EXEMPT list. We validate `state` against the stored nonce,
// exchange the code for a refresh token, fetch the Books org list, persist, then
// bounce the admin back into the app.
app.get('/api/integrations/books/callback', async (req, res) => {
  const bounce = (msg, ok) => res.redirect(`${BOOKS_RETURN_URL}${BOOKS_RETURN_URL.includes('?') ? '&' : '?'}books=${ok ? 'connected' : 'error'}&msg=${encodeURIComponent(msg)}`);
  try {
    const { code, state, error } = req.query;
    if (error) return bounce(String(error), false);
    if (!code || !state) return bounce('Authorization was cancelled.', false);
    const [orgId, nonce, dcRaw] = String(state).split(':');
    const dc = ['com', 'in', 'eu', 'com.au', 'jp', 'sa', 'ca'].includes(dcRaw) ? dcRaw : 'com';
    if (!orgId || !nonce) return bounce('Invalid authorization state.', false);

    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Integrations WHERE OrgID = '${zqRaw(orgId)}' AND Provider = 'books'`);
    const row = rows[0]?.Integrations;
    const cfg = row ? safeParse(row.ConfigJson, {}) : {};
    if (!row || cfg.oauthNonce !== nonce) return bounce('This authorization link has expired — please try connecting again.', false);

    const { refreshToken } = await booksExchangeCode(String(code), dc);
    if (!refreshToken) return bounce('Zoho did not return a refresh token. Ensure the app requests offline access.', false);

    // Read their Books orgs so we can auto-select when there's exactly one.
    let booksOrgId = cfg.booksOrgId || '', booksOrgName = cfg.booksOrgName || '';
    try {
      const access = await booksAccessToken({ dc, refreshToken });
      const orgsResp = await booksFetch({ dc, booksOrgId: '' }, access, '/organizations');
      const orgs = (orgsResp.organizations || []).map(o => ({ id: String(o.organization_id), name: o.name }));
      if (orgs.length === 1) { booksOrgId = orgs[0].id; booksOrgName = orgs[0].name; }
    } catch { /* org list is best-effort; admin can pick later */ }

    const newCfg = { ...cfg, dc, refreshToken, booksOrgId, booksOrgName, oauthNonce: '' };
    await safeTable(req.catalystApp, 'Integrations').updateRow({
      ROWID: row.ROWID, ConfigJson: JSON.stringify(newCfg), Status: 'Connected', LastSyncAt: row.LastSyncAt || ''
    });
    return bounce(booksOrgName ? `Connected to ${booksOrgName}.` : 'Connected to Zoho Books.', true);
  } catch (err) {
    return bounce(err.message || 'Could not complete the Zoho Books connection.', false);
  }
});

// List the connected account's Books organizations (to pick which one to sync into).
app.post('/api/integrations/books/test', requireAdmin, async (req, res) => {
  try {
    const row = await getIntegrationRow(req, 'books');
    const cfg = row ? safeParse(row.ConfigJson, {}) : {};
    if (!cfg.refreshToken) return res.status(400).json({ error: 'Connect to Zoho Books first (click “Connect to Zoho Books”).' });
    const token = await booksAccessToken(cfg);
    const orgsResp = await booksFetch({ ...cfg, booksOrgId: '' }, token, '/organizations');
    const orgs = (orgsResp.organizations || []).map(o => ({ id: String(o.organization_id), name: o.name }));
    const matched = cfg.booksOrgId ? orgs.find(o => o.id === String(cfg.booksOrgId)) : null;
    res.json({
      message: matched
        ? `Connected — syncing into "${matched.name}".`
        : `Connected. ${orgs.length} Books organization(s) available${cfg.booksOrgId ? '' : ' — choose which one to sync into.'}`,
      organizations: orgs
    });
  } catch (err) { fail(res, err, 400); }
});

// Disconnect — wipe the stored refresh token so the customer can reconnect fresh.
app.post('/api/integrations/books/disconnect', requireAdmin, async (req, res) => {
  try {
    const row = await getIntegrationRow(req, 'books');
    if (!row) return res.json({ message: 'Already disconnected.' });
    const cfg = safeParse(row.ConfigJson, {});
    const cleared = { dc: cfg.dc || 'com', sync: cfg.sync || {}, mappings: cfg.mappings || {} };
    await safeTable(req.catalystApp, 'Integrations').updateRow({ ROWID: row.ROWID, ConfigJson: JSON.stringify(cleared), Status: 'Configured' });
    await audit(req, 'disconnect', 'Integration', 'books', {});
    res.json({ message: 'Disconnected from Zoho Books.' });
  } catch (err) { fail(res, err); }
});

// Push vendors → Books contacts, items → Books items, bills → Books bills.
// Record mappings (our ROWID → Books ID) persist in ConfigJson.mappings so
// repeat syncs skip already-pushed records.
app.post('/api/integrations/books/sync', requireAdmin, async (req, res) => {
  try {
    const row = await getIntegrationRow(req, 'books');
    const cfg = row ? safeParse(row.ConfigJson, {}) : {};
    if (!cfg.refreshToken) {
      return res.status(400).json({ error: 'Connect Zoho Books first (Settings → Integrations → Zoho Books).' });
    }
    if (!cfg.booksOrgId) return res.status(400).json({ error: 'Choose which Zoho Books organization to sync into first.' });

    const token = await booksAccessToken(cfg);
    const zcql = req.catalystApp.zcql();
    const sync = { vendors: true, items: true, bills: false, ...(cfg.sync || {}) };
    const mappings = cfg.mappings || {};
    mappings.suppliers = mappings.suppliers || {};
    mappings.items = mappings.items || {};
    mappings.invoices = mappings.invoices || {};

    const summary = {
      startedAt: new Date().toISOString(),
      vendors: { created: 0, skipped: 0, failed: 0 },
      items: { created: 0, skipped: 0, failed: 0 },
      bills: { created: 0, skipped: 0, failed: 0 },
      errors: []
    };
    const logError = (kind, name, msg) => {
      summary[kind].failed++;
      if (summary.errors.length < 40) summary.errors.push({ kind, name, error: String(msg).slice(0, 180) });
    };

    // 1. Vendors → Books contacts (contact_type: vendor)
    if (sync.vendors) {
      const sRows = await zcql.executeZCQLQuery(`SELECT * FROM Suppliers WHERE OrgID = '${zqRaw(req.orgId)}'`);
      for (const r of sRows) {
        const s = r.Suppliers;
        if (mappings.suppliers[s.ROWID]) { summary.vendors.skipped++; continue; }
        try {
          const resp = await booksFetch(cfg, token, '/contacts', {
            method: 'POST',
            body: {
              contact_name: s.Name,
              contact_type: 'vendor',
              ...(s.ContactEmail ? { contact_persons: [{ email: s.ContactEmail, is_primary_contact: true }] } : {})
            }
          });
          mappings.suppliers[s.ROWID] = String(resp.contact?.contact_id || '');
          summary.vendors.created++;
        } catch (e) { logError('vendors', s.Name, e.message); }
      }
    }

    // 2. Items → Books items
    if (sync.items) {
      const iRows = await zcql.executeZCQLQuery(`SELECT * FROM Items WHERE OrgID = '${zqRaw(req.orgId)}'`);
      for (const r of iRows) {
        const it = r.Items;
        if (mappings.items[it.ROWID]) { summary.items.skipped++; continue; }
        try {
          const resp = await booksFetch(cfg, token, '/items', {
            method: 'POST',
            body: {
              name: it.Name,
              rate: Number(it.UnitPrice || 0),
              ...(it.SKU ? { sku: it.SKU } : {}),
              product_type: it.ItemType === 'Service' ? 'service' : 'goods',
              ...(it.Description ? { description: String(it.Description).slice(0, 2000) } : {})
            }
          });
          mappings.items[it.ROWID] = String(resp.item?.item_id || '');
          summary.items.created++;
        } catch (e) { logError('items', it.Name, e.message); }
      }
    }

    // 3. Bills — our matched invoices become Books bills (vendor via the PO).
    if (sync.bills) {
      // A Books bill line needs an expense account; use the first one on the COA.
      let expenseAccountId = '';
      try {
        const coa = await booksFetch(cfg, token, '/chartofaccounts?filter_by=AccountType.Expense');
        expenseAccountId = String((coa.chartofaccounts || [])[0]?.account_id || '');
      } catch { /* fall through — bill creation will report the error */ }

      const invRows = await zcql.executeZCQLQuery(`SELECT * FROM Invoices WHERE OrgID = '${zqRaw(req.orgId)}'`);
      for (const r of invRows) {
        const inv = r.Invoices;
        if (mappings.invoices[inv.ROWID]) { summary.bills.skipped++; continue; }
        try {
          const poRows = await zcql.executeZCQLQuery(`SELECT SupplierID FROM POs WHERE ROWID = '${zqRaw(inv.POID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
          const vendorBooksId = mappings.suppliers[poRows[0]?.POs?.SupplierID];
          if (!vendorBooksId) throw new AppError('Vendor not synced yet — run a vendor sync first.', { status: 409 });
          const resp = await booksFetch(cfg, token, '/bills', {
            method: 'POST',
            body: {
              vendor_id: vendorBooksId,
              bill_number: inv.InvoiceNumber,
              date: String(inv.SupplierInvoiceDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
              line_items: [{
                name: `Procurement bill ${inv.InvoiceNumber}`,
                rate: Number(inv.Amount || 0),
                quantity: 1,
                ...(expenseAccountId ? { account_id: expenseAccountId } : {})
              }]
            }
          });
          mappings.invoices[inv.ROWID] = String(resp.bill?.bill_id || '');
          summary.bills.created++;
        } catch (e) { logError('bills', inv.InvoiceNumber, e.message); }
      }
    }

    summary.finishedAt = new Date().toISOString();
    cfg.mappings = mappings;
    await safeTable(req.catalystApp, 'Integrations').updateRow({
      ROWID: row.ROWID,
      ConfigJson: JSON.stringify(cfg).slice(0, 9900),
      Status: 'Connected',
      LastSyncAt: summary.finishedAt,
      LastLogJson: JSON.stringify(summary).slice(0, 9900)
    });
    await audit(req, 'sync', 'Integration', 'books', {
      vendors: summary.vendors, items: summary.items, bills: summary.bills
    });
    res.json({ message: 'Sync finished.', summary });
  } catch (err) { fail(res, err); }
});

// Send a sample payload to a webhook endpoint (server-side, avoids CORS).
app.post('/api/integrations/webhooks/test', requireAdmin, async (req, res) => {
  try {
    const { url, secret } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'A valid http(s) URL is required.' });
    const started = Date.now();
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Webhook-Secret': secret } : {}) },
      body: JSON.stringify({
        event: 'test.ping',
        orgId: req.orgId,
        at: new Date().toISOString(),
        actor: req.authUser?.email || 'system',
        data: { message: 'Webhook test from your Procurement workspace.' }
      }),
      signal: AbortSignal.timeout(8000)
    });
    res.json({ ok: r.ok, statusCode: r.status, ms: Date.now() - started });
  } catch (err) { res.status(400).json({ error: `Could not reach the endpoint: ${err.message}` }); }
});

// ==========================================
// 🛡️ PROFILES (permission matrices, Zoho-style)
// ==========================================
app.get('/api/profiles', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Profiles WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.Profiles));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/profiles', requireAdmin, async (req, res) => {
  try {
    const { ProfileName, Description, Permissions } = req.body;
    if (!ProfileName) return res.status(400).json({ error: 'ProfileName is required' });
    const created = await safeTable(req.catalystApp, 'Profiles').insertRow({
      OrgID: req.orgId,
      ProfileName,
      Description: Description || '',
      Permissions: typeof Permissions === 'string' ? Permissions : JSON.stringify(Permissions || {})
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err);
  }
});

app.put('/api/profiles/:id', requireAdmin, async (req, res) => {
  try {
    const { ProfileName, Description, Permissions } = req.body;
    const updateData = { ROWID: req.params.id };
    if (ProfileName !== undefined) updateData.ProfileName = ProfileName;
    if (Description !== undefined) updateData.Description = Description;
    if (Permissions !== undefined) {
      updateData.Permissions = typeof Permissions === 'string' ? Permissions : JSON.stringify(Permissions);
    }
    const updated = await safeTable(req.catalystApp, 'Profiles').updateRow(updateData);
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/profiles/:id', requireAdmin, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const inUse = await zcql.executeZCQLQuery(
      `SELECT ROWID FROM Users WHERE ProfileID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}' LIMIT 1`
    );
    if (inUse.length > 0) return res.status(400).json({ error: 'Profile is assigned to users — reassign them first.' });
    await safeTable(req.catalystApp, 'Profiles').deleteRow(req.params.id);
    res.json({ message: 'Profile deleted' });
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 🏷️ CUSTOM FIELDS for native modules
// ==========================================
app.get('/api/custom-fields', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const moduleFilter = req.query.module ? ` AND Module = '${zqRaw(req.query.module)}'` : '';
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM CustomFields WHERE OrgID = '${zqRaw(req.orgId)}' AND Status = 'Active'${moduleFilter}`
    );
    res.json(rows.map(r => r.CustomFields));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/custom-fields', requireAdmin, async (req, res) => {
  try {
    const { Module, FieldName, FieldType, Options } = req.body;
    if (!Module || !FieldName) return res.status(400).json({ error: 'Module and FieldName are required' });
    const created = await safeTable(req.catalystApp, 'CustomFields').insertRow({
      OrgID: req.orgId,
      Module,
      FieldName,
      FieldType: FieldType || 'text',
      Options: Array.isArray(Options) ? JSON.stringify(Options) : (Options || ''),
      Status: 'Active'
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/custom-fields/:id', requireAdmin, async (req, res) => {
  try {
    // Deactivate rather than hard-delete so historical records keep their values.
    const updated = await safeTable(req.catalystApp, 'CustomFields')
      .updateRow({ ROWID: req.params.id, Status: 'Inactive' });
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 📎 ATTACHMENTS — Catalyst Stratus (object storage), organization-wise keys.
// File Store is deprecated by Catalyst; new uploads go to the Stratus bucket
// under orgs/<OrgID>/... Legacy rows (FileID, no ObjectKey) still download
// from File Store, so nothing breaks during the transition.
// ==========================================
const MAX_ATTACHMENTS_PER_RECORD = 5;
const STRATUS_BUCKET = 'procurement-files';

// Cache the bucket availability so we don't head-check on every upload.
let stratusReady = null; // null = unknown, true/false = checked
async function getStratusBucket(catalystApp) {
  if (stratusReady === false) return null;
  try {
    const stratus = catalystApp.stratus();
    if (stratusReady === null) {
      stratusReady = await stratus.headBucket(STRATUS_BUCKET).catch(() => false);
      if (!stratusReady) console.warn(`[Stratus] Bucket "${STRATUS_BUCKET}" not available — falling back to File Store.`);
    }
    return stratusReady ? stratus.bucket(STRATUS_BUCKET) : null;
  } catch (e) {
    console.warn('[Stratus] init failed:', e.message);
    stratusReady = false;
    return null;
  }
}

// Object keys are org-scoped: orgs/<orgId>/<recordType>/<recordId>/<ts>-<name>
function stratusKey(orgId, recordType, recordId, fileName) {
  const safe = String(fileName).replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return `orgs/${orgId}/${recordType}/${recordId}/${Date.now()}-${safe}`;
}

app.get('/api/attachments', async (req, res) => {
  try {
    const { recordType, recordId } = req.query;
    if (!recordType || !recordId) return res.status(400).json({ error: 'recordType and recordId are required' });
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM Attachments WHERE OrgID = '${zqRaw(req.orgId)}' AND RecordType = '${zqRaw(recordType)}' AND RecordID = '${zqRaw(recordId)}'`
    );
    res.json(rows.map(r => r.Attachments));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/attachments', upload.single('file'), async (req, res) => {
  try {
    const { recordType, recordId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!recordType || !recordId) return res.status(400).json({ error: 'recordType and recordId are required' });

    const zcql = req.catalystApp.zcql();
    const existing = await zcql.executeZCQLQuery(
      `SELECT COUNT(ROWID) FROM Attachments WHERE OrgID = '${zqRaw(req.orgId)}' AND RecordType = '${zqRaw(recordType)}' AND RecordID = '${zqRaw(recordId)}'`
    );
    const countVal = Number(Object.values(existing[0]?.Attachments || {})[0] || 0);
    if (countVal >= MAX_ATTACHMENTS_PER_RECORD) {
      return res.status(400).json({ error: `Maximum ${MAX_ATTACHMENTS_PER_RECORD} attachments per record.` });
    }

    // Prefer Stratus (org-wise object keys); fall back to legacy File Store.
    let objectKey = null, fileId = '';
    const bucket = await getStratusBucket(req.catalystApp);
    if (bucket) {
      objectKey = stratusKey(req.orgId, recordType, recordId, req.file.originalname);
      await bucket.putObject(objectKey, req.file.buffer);
    } else {
      if (!ATTACHMENTS_FOLDER_ID) return res.status(503).json({ error: 'File storage is not configured. Create the Stratus bucket or set ATTACHMENTS_FOLDER_ID.' });
      const folder = req.catalystApp.filestore().folder(ATTACHMENTS_FOLDER_ID);
      const uploaded = await folder.uploadFile({
        code: Readable.from(req.file.buffer),
        name: `${req.orgId}_${recordType}_${recordId}_${req.file.originalname}`
      });
      fileId = String(uploaded.id);
    }

    const row = await safeTable(req.catalystApp, 'Attachments').insertRow({
      OrgID: req.orgId,
      RecordType: recordType,
      RecordID: String(recordId),
      FileID: fileId,
      ObjectKey: objectKey || '',
      FileName: req.file.originalname,
      FileSize: req.file.size,
      UploadedBy: req.authUser.email
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[Attachment Upload Error]:', err);
    fail(res, err);
  }
});

app.get('/api/attachments/:id/download', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM Attachments WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
    const att = rows[0].Attachments;

    res.setHeader('Content-Disposition', `attachment; filename="${att.FileName.replace(/"/g, '')}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    if (att.ObjectKey) {
      // Stratus object → stream straight to the client
      const bucket = await getStratusBucket(req.catalystApp);
      if (!bucket) return res.status(503).json({ error: 'Object storage unavailable' });
      const stream = await bucket.getObject(att.ObjectKey);
      stream.pipe(res);
    } else {
      // Legacy File Store attachment
      const folder = req.catalystApp.filestore().folder(ATTACHMENTS_FOLDER_ID);
      const buffer = await folder.downloadFile(att.FileID);
      res.send(buffer);
    }
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/attachments/:id', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM Attachments WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });

    const att = rows[0].Attachments;
    try {
      if (att.ObjectKey) {
        const bucket = await getStratusBucket(req.catalystApp);
        if (bucket) await bucket.deleteObject(att.ObjectKey);
      } else if (att.FileID) {
        await req.catalystApp.filestore().folder(ATTACHMENTS_FOLDER_ID).deleteFile(att.FileID);
      }
    } catch (e) {
      console.warn('Storage delete failed (row will still be removed):', e.message);
    }
    await safeTable(req.catalystApp, 'Attachments').deleteRow(req.params.id);
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 🧾 AUDIT LOG (admin-gated)
// ==========================================
app.get('/api/audit-log', requireAdmin, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT * FROM AuditLog WHERE OrgID = '${zqRaw(req.orgId)}' ORDER BY CREATEDTIME DESC LIMIT 200`
    );
    res.json(rows.map(r => r.AuditLog));
  } catch (err) {
    res.json([]);
  }
});

// The industry-pack list endpoint is gone: there is one pack, it is Hotel
// Management, and setup applies it without asking.

// ==========================================
// 📊 CAPEX / OPEX ANALYTICS
// ==========================================
app.get('/api/analytics/expense-split', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    // Sum PR line values grouped by expense type (approved/committed lines).
    const rows = await zcql.executeZCQLQuery(
      `SELECT PRItems.ExpenseType, PRItems.Quantity, PRItems.EstimatedPrice, PRs.Status
       FROM PRItems LEFT JOIN PRs ON PRItems.PRID = PRs.ROWID
       WHERE PRItems.OrgID = '${zqRaw(req.orgId)}'`
    ).catch(() => []);

    let capex = 0, opex = 0, capexPending = 0, opexPending = 0;
    rows.forEach(r => {
      const li = r.PRItems || {};
      const pr = r.PRs || {};
      const value = Number(li.Quantity || 0) * Number(li.EstimatedPrice || 0);
      const committed = ['Approved', 'Converted_To_PO', 'Converted_To_RFQ'].includes(pr.Status);
      if ((li.ExpenseType || 'OpEx') === 'CapEx') {
        if (committed) capex += value; else capexPending += value;
      } else {
        if (committed) opex += value; else opexPending += value;
      }
    });
    res.json({ capex, opex, capexPending, opexPending });
  } catch (err) {
    res.json({ capex: 0, opex: 0, capexPending: 0, opexPending: 0 });
  }
});

// The group matrix: every property, split by expenditure category, showing
// requisition counts, where approvals are sitting, and budget against actual.
//
// Head office reads this top-down (group → cluster → property); a property user
// sees only their own row, because propertyScopeClause() already limits which
// properties they can see at all.
app.get('/api/analytics/group-matrix', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const org = zqRaw(req.orgId);
    const pack = getPack('hotel');
    const EXP = pack.expenditureCategories;

    const [props, prs, budgets] = await Promise.all([
      zcql.executeZCQLQuery(
        `SELECT ROWID, Name, Location, Cluster, Status FROM Properties WHERE OrgID = '${org}'${propertyScopeClause(req, 'Properties.ROWID')}`
      ).catch(() => []),
      zcql.executeZCQLQuery(
        `SELECT ROWID, PropertyID, Status, TotalAmount, CustomFieldsJson, ApprovalLevel, CREATEDTIME
         FROM PRs WHERE OrgID = '${org}'${propertyScopeClause(req)}`
      ).catch(() => []),
      zcql.executeZCQLQuery(
        `SELECT PropertyID, Amount, Spent, Committed, ExpenseType FROM Budgets WHERE OrgID = '${org}'`
      ).catch(() => [])
    ]);

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // A requisition counts as spend once it is approved or beyond; before that
    // it is only a request and must not be reported as money committed.
    const COMMITTED = ['Approved', 'Converted_To_PO', 'Converted_To_RFQ', 'Fulfilled', 'Closed'];

    // Which role a pending requisition is waiting on. The workbook's dashboard
    // splits pending work three ways, so the route stage is mapped back to one
    // of those buckets.
    const bucketFor = (pr) => {
      const custom = safeParse(pr.CustomFieldsJson, {}) || {};
      const route = workflowFor(custom.budgetClass);
      const stage = route.stages.find(s => s.seq === Number(pr.ApprovalLevel || 0));
      const role = stage ? stage.role : '';
      if (role === 'Head of Finance') return 'pendingFinance';
      if (role === 'General Manager') return 'pendingGM';
      if (role === 'Procurement Committee' || role === 'Board of Directors'
          || role === 'VP operations / CEO' || role === 'Central Procurement') return 'pendingPCM';
      return 'pendingOther';
    };

    const blank = () => ({
      totalPRsYTD: 0, totalPRsMonth: 0,
      pendingFinance: 0, pendingGM: 0, pendingPCM: 0, pendingOther: 0,
      budget: 0, actual: 0, save: 0, savePct: 0
    });

    // Seed a cell for every property × expenditure category, so a property with
    // no activity still appears as a zero row rather than vanishing.
    const cells = {};
    const propRows = props.map(p => p.Properties);
    for (const p of propRows) {
      for (const e of EXP) cells[`${p.ROWID}|${e}`] = blank();
    }

    for (const r of prs) {
      const pr = r.PRs;
      const custom = safeParse(pr.CustomFieldsJson, {}) || {};
      const exp = EXP.includes(custom.expenditureCategory) ? custom.expenditureCategory : 'Opex';
      const key = `${pr.PropertyID}|${exp}`;
      const cell = cells[key] || (cells[key] = blank());

      const created = new Date(pr.CREATEDTIME);
      if (created >= yearStart) cell.totalPRsYTD++;
      if (created >= monthStart) cell.totalPRsMonth++;
      if (pr.Status === 'Pending_Approval') cell[bucketFor(pr)]++;
      if (COMMITTED.includes(pr.Status)) cell.actual += Number(pr.TotalAmount || 0);
    }

    // Budgets are held per property and expense type (CapEx/OpEx); Repair and
    // AMC draw on the operating budget, which is how the group accounts for them.
    const budgetKey = e => (e === 'Capex' ? 'CapEx' : 'OpEx');
    for (const b of budgets.map(x => x.Budgets)) {
      for (const e of EXP) {
        const cell = cells[`${b.PropertyID}|${e}`];
        if (cell && budgetKey(e) === (b.ExpenseType || 'OpEx')) cell.budget += Number(b.Amount || 0);
      }
    }

    const rows = [];
    for (const p of propRows) {
      for (const e of EXP) {
        const c = cells[`${p.ROWID}|${e}`] || blank();
        c.save = c.budget - c.actual;
        c.savePct = c.budget > 0 ? Math.round((c.save / c.budget) * 1000) / 10 : 0;
        rows.push({
          cluster: p.Cluster || '—', property: p.Name, propertyId: p.ROWID,
          expenditureCategory: e, ...c
        });
      }
    }

    // Group totals, so head office gets the headline without summing by eye.
    const totals = rows.reduce((t, r) => {
      t.totalPRsYTD += r.totalPRsYTD; t.totalPRsMonth += r.totalPRsMonth;
      t.pendingFinance += r.pendingFinance; t.pendingGM += r.pendingGM; t.pendingPCM += r.pendingPCM;
      t.budget += r.budget; t.actual += r.actual;
      return t;
    }, { totalPRsYTD: 0, totalPRsMonth: 0, pendingFinance: 0, pendingGM: 0, pendingPCM: 0, budget: 0, actual: 0 });
    totals.save = totals.budget - totals.actual;
    totals.savePct = totals.budget > 0 ? Math.round((totals.save / totals.budget) * 1000) / 10 : 0;

    res.json({ expenditureCategories: EXP, rows, totals });
  } catch (err) { fail(res, err); }
});

// ==========================================
// 📐 DASHBOARD CONFIGS (customizable, per role)
// ==========================================
app.get('/api/dashboards', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM DashboardConfigs WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => r.DashboardConfigs));
  } catch (err) {
    res.json([]);
  }
});

// The dashboard the CURRENT user should see: their role's dashboard if one
// exists, otherwise the org default.
app.get('/api/dashboards/mine', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM DashboardConfigs WHERE OrgID = '${zqRaw(req.orgId)}'`);
    const configs = rows.map(r => r.DashboardConfigs);
    const roleId = req.currentUser?.RoleID;
    const forRole = roleId ? configs.find(c => c.RoleID === roleId) : null;
    const dflt = configs.find(c => c.IsDefault === 'true') || configs.find(c => !c.RoleID);
    const chosen = forRole || dflt || null;
    res.json(chosen ? { ...chosen, widgets: safeParse(chosen.WidgetsJson, []) } : null);
  } catch (err) {
    res.json(null);
  }
});

app.post('/api/dashboards', requireAdmin, async (req, res) => {
  try {
    const { Name, RoleID, Widgets, IsDefault } = req.body;
    if (!Name) return res.status(400).json({ error: 'Name is required' });
    const created = await safeTable(req.catalystApp, 'DashboardConfigs').insertRow({
      OrgID: req.orgId,
      Name,
      RoleID: RoleID || null,
      ProfileID: null,
      WidgetsJson: JSON.stringify(Widgets || []),
      IsDefault: IsDefault ? 'true' : 'false'
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err);
  }
});

app.put('/api/dashboards/:id', requireAdmin, async (req, res) => {
  try {
    const { Name, RoleID, Widgets, IsDefault } = req.body;
    const updateData = { ROWID: req.params.id };
    if (Name !== undefined) updateData.Name = Name;
    if (RoleID !== undefined) updateData.RoleID = RoleID || null;
    if (Widgets !== undefined) updateData.WidgetsJson = JSON.stringify(Widgets);
    if (IsDefault !== undefined) updateData.IsDefault = IsDefault ? 'true' : 'false';
    const updated = await safeTable(req.catalystApp, 'DashboardConfigs').updateRow(updateData);
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/dashboards/:id', requireAdmin, async (req, res) => {
  try {
    await safeTable(req.catalystApp, 'DashboardConfigs').deleteRow(req.params.id);
    res.json({ message: 'Dashboard deleted' });
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 📄 PDF TEMPLATES (editable per module)
// ==========================================
app.get('/api/pdf-templates', async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const moduleFilter = req.query.module ? ` AND Module = '${zqRaw(req.query.module)}'` : '';
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM PdfTemplates WHERE OrgID = '${zqRaw(req.orgId)}'${moduleFilter}`);
    res.json(rows.map(r => r.PdfTemplates));
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/pdf-templates', requireAdmin, async (req, res) => {
  try {
    const { Module, TemplateName, Config, IsDefault } = req.body;
    if (!Module || !TemplateName) return res.status(400).json({ error: 'Module and TemplateName are required' });
    const datastore = req.catalystApp.datastore();
    const zcql = req.catalystApp.zcql();
    const existing = await zcql.executeZCQLQuery(`SELECT ROWID FROM PdfTemplates WHERE OrgID = '${zqRaw(req.orgId)}' AND Module = '${zqRaw(Module)}'`);
    // The first template for a document type becomes the default automatically;
    // otherwise only one default per module — demote any existing default.
    const makeDefault = existing.length === 0 || !!IsDefault;
    if (IsDefault) {
      for (const s of existing) await safeTable(req.catalystApp, 'PdfTemplates').updateRow({ ROWID: s.PdfTemplates.ROWID, IsDefault: 'false' });
    }
    const created = await safeTable(req.catalystApp, 'PdfTemplates').insertRow({
      OrgID: req.orgId,
      Module,
      TemplateName,
      ConfigJson: typeof Config === 'string' ? Config : JSON.stringify(Config || {}),
      IsDefault: makeDefault ? 'true' : 'false'
    });
    res.status(201).json(created);
  } catch (err) {
    fail(res, err);
  }
});

app.put('/api/pdf-templates/:id', requireAdmin, async (req, res) => {
  try {
    const { TemplateName, Config, IsDefault } = req.body;
    const updateData = { ROWID: req.params.id };
    if (TemplateName !== undefined) updateData.TemplateName = TemplateName;
    if (Config !== undefined) updateData.ConfigJson = typeof Config === 'string' ? Config : JSON.stringify(Config);
    if (IsDefault !== undefined) updateData.IsDefault = IsDefault ? 'true' : 'false';
    const datastore = req.catalystApp.datastore();
    // Only one default template per document type — unset any other default
    // in the same module before marking this one.
    if (IsDefault) {
      const zcql = req.catalystApp.zcql();
      const rows = await zcql.executeZCQLQuery(`SELECT ROWID, Module FROM PdfTemplates WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
      const module = rows[0]?.PdfTemplates?.Module;
      if (module) {
        const siblings = await zcql.executeZCQLQuery(
          `SELECT ROWID FROM PdfTemplates WHERE OrgID = '${zqRaw(req.orgId)}' AND Module = '${zqRaw(module)}' AND IsDefault = 'true' AND ROWID != '${zqRaw(req.params.id)}'`);
        for (const s of siblings) await safeTable(req.catalystApp, 'PdfTemplates').updateRow({ ROWID: s.PdfTemplates.ROWID, IsDefault: 'false' });
      }
    }
    const updated = await safeTable(req.catalystApp, 'PdfTemplates').updateRow(updateData);
    res.json(updated);
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/pdf-templates/:id', requireAdmin, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, IsDefault FROM PdfTemplates WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    if (rows[0].PdfTemplates.IsDefault === 'true') {
      return res.status(400).json({ error: 'This is the default template for its document type. Make another template default first.' });
    }
    await safeTable(req.catalystApp, 'PdfTemplates').deleteRow(req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// 🏢 VENDOR PORTAL — its own auth universe
// ==========================================
// Vendors have no Catalyst user account, so this whole surface is verified
// independently: a vendor's identity is a hashed access code (or, before
// first login, a one-time invite token) checked directly against the
// VendorPortalAccess table, and every authenticated call after login carries
// an opaque bearer token that is itself only a lookup key into VendorSessions
// — never a client-decodable credential, and never trusted at face value.
const VENDOR_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VENDOR_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }

// Opportunistically delete expired vendor sessions so the table doesn't grow
// without bound. Runs at most once/hour (piggybacks on the usage flush cycle,
// so there's no dedicated cron). Best-effort: any failure is swallowed.
let lastVendorSessionPurge = 0;
async function purgeExpiredVendorSessions(app) {
  if (!app || Date.now() - lastVendorSessionPurge < 60 * 60 * 1000) return;
  lastVendorSessionPurge = Date.now();
  try {
    const zcql = app.zcql();
    const nowIso = new Date().toISOString();
    const rows = await zcql.executeZCQLQuery(
      `SELECT ROWID FROM VendorSessions WHERE ExpiresAt < '${zqRaw(nowIso)}' LIMIT 200`);
    const table = app.datastore().table('VendorSessions');
    for (const r of rows) {
      try { await table.deleteRow(r.VendorSessions.ROWID); } catch { /* skip */ }
    }
  } catch { /* best-effort */ }
}

// Verifies the vendor session token against VendorSessions, and attaches
// req.vendor = { orgId, vendorId }. Every /api/vendor-portal/* route (other than
// login/accept-invite) requires this.
//
// IMPORTANT: the token is read from the custom `X-Vendor-Token` header, NOT the
// standard `Authorization: Bearer` header. The Catalyst gateway intercepts
// `Authorization: Bearer <x>` and tries to validate it as a Catalyst OAuth token
// BEFORE the request reaches this function — an opaque vendor-session token there
// gets rejected upstream with a raw {status:'failure', ...INVALID_TOKEN} 401 that
// this code never sees (and the browser can't read as our JSON). A custom header
// bypasses that gateway validation entirely. (Authorization is still honored as a
// fallback for any old client, but the portal now sends X-Vendor-Token.)
async function vendorAuth(req, res, next) {
  try {
    const custom = req.headers['x-vendor-token'] || '';
    const header = req.headers.authorization || '';
    const token = custom || (header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!token) return res.status(401).json({ error: 'Not signed in.', code: 'VENDOR_UNAUTHENTICATED' });
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM VendorSessions WHERE TokenHash = '${sha256(token)}'`);
    const session = rows[0]?.VendorSessions;
    if (!session || new Date(session.ExpiresAt) < new Date()) {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'VENDOR_UNAUTHENTICATED' });
    }
    req.vendor = { orgId: String(session.OrgID), vendorId: String(session.VendorID) };
    next();
  } catch (err) {
    fail(res, err);
  }
}

// Vendor Portal preferences live in the org's own Settings.vendorPortal, so
// they show up alongside every other org setting (no new table needed):
// { enabled, allowBidding, allowPOAcceptReject, allowInvoiceUpload,
//   notifyOnActivity, notifyVendorOnComment, bannerMessage }
function vendorPortalPrefs(orgSettings) {
  const p = orgSettings?.vendorPortal || {};
  return {
    enabled: p.enabled !== false,
    allowBidding: p.allowBidding !== false,
    allowPOAcceptReject: p.allowPOAcceptReject !== false,
    allowInvoiceUpload: !!p.allowInvoiceUpload,
    allowContactUpdate: !!p.allowContactUpdate,
    collectOrgDetailsOnSignup: !!p.collectOrgDetailsOnSignup,
    notifyOnActivity: p.notifyOnActivity !== false,
    notifyVendorOnComment: p.notifyVendorOnComment !== false,
    bannerMessage: p.bannerMessage || ''
  };
}

// ---- Admin-side: invite a vendor, view/revoke access, reissue codes ----
// (These run under the normal org-tenant middleware — an admin action.)
app.get('/api/vendor-portal/access', perm('masters', 'edit'), async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM VendorPortalAccess WHERE OrgID = '${zqRaw(req.orgId)}'`);
    res.json(rows.map(r => {
      const a = r.VendorPortalAccess;
      return { ROWID: a.ROWID, VendorID: a.VendorID, Email: a.Email, Status: a.Status, LastLoginAt: a.LastLoginAt || '' };
    }));
  } catch (err) { res.json([]); }
});

app.post('/api/vendor-portal/invite', perm('masters', 'edit'), async (req, res) => {
  try {
    const { VendorID } = req.body;
    if (!VendorID) return res.status(400).json({ error: 'VendorID is required.' });
    const zcql = req.catalystApp.zcql();
    const vRows = await zcql.executeZCQLQuery(`SELECT * FROM Suppliers WHERE ROWID = '${zqRaw(VendorID)}' AND OrgID = '${zqRaw(req.orgId)}'`);
    if (vRows.length === 0) return res.status(404).json({ error: 'Vendor not found.' });
    const vendor = vRows[0].Suppliers;
    if (!vendor.ContactEmail) return res.status(400).json({ error: 'This vendor has no email on file — add one first.' });

    const existing = await zcql.executeZCQLQuery(`SELECT * FROM VendorPortalAccess WHERE OrgID = '${zqRaw(req.orgId)}' AND VendorID = '${zqRaw(VendorID)}'`);
    const prior = existing[0]?.VendorPortalAccess;
    // Re-inviting an ALREADY-ACTIVE vendor must NOT wipe the access code they
    // already chose (that would silently lock them out). Only allow a re-invite
    // for an active vendor when the caller explicitly asks to reset access
    // (?reset=true / { reset:true }); otherwise refuse and tell the admin the
    // vendor is already set up. New/Invited/Revoked vendors get a fresh invite.
    const wantsReset = req.body.reset === true || String(req.query.reset) === 'true';
    if (prior && prior.Status === 'Active' && prior.CodeHash && !wantsReset) {
      return res.status(409).json({
        error: `${vendor.Name} already has active portal access. Use “Reset access” if they need a new invite link (this will replace their current access code).`,
        code: 'VENDOR_ALREADY_ACTIVE'
      });
    }

    const inviteToken = randomToken();
    const payload = {
      // Store the email lowercased/trimmed so it matches the login query, which
      // lowercases what the vendor types. Storing it as-entered (with any
      // uppercase) meant login could never find the row → "Invalid email or
      // access code" even with the right code.
      OrgID: req.orgId, VendorID: String(VendorID), Email: String(vendor.ContactEmail || '').trim().toLowerCase(),
      Status: 'Invited', InviteToken: sha256(inviteToken),
      InviteExpiresAt: new Date(Date.now() + VENDOR_INVITE_TTL_MS).toISOString(), CodeHash: ''
    };
    const table = safeTable(req.catalystApp, 'VendorPortalAccess');
    if (prior) {
      await table.updateRow({ ROWID: prior.ROWID, ...payload });
      // If we're replacing an active vendor's access, kill their live sessions
      // so the old code (now invalid) can't ride an existing session.
      if (prior.Status === 'Active') {
        const sessions = await zcql.executeZCQLQuery(`SELECT ROWID FROM VendorSessions WHERE OrgID = '${zqRaw(req.orgId)}' AND VendorID = '${zqRaw(VendorID)}'`);
        for (const s of sessions) await safeTable(req.catalystApp, 'VendorSessions').deleteRow(s.VendorSessions.ROWID);
      }
    } else {
      await table.insertRow(payload);
    }

    const wasReset = prior && prior.Status === 'Active';
    await audit(req, wasReset ? 'reset-access' : 'invite', 'VendorPortalAccess', VendorID, { email: vendor.ContactEmail });
    // The invite token an admin sends the vendor out-of-band (email/copy-paste).
    // It is returned once, in plaintext, only to the inviting admin — it is
    // never stored in plaintext and cannot be recovered after this response.
    // The client composes the final URL (it knows the real web-app origin/path).
    res.json({
      message: wasReset
        ? `Access reset for ${vendor.Name}. Their old code no longer works — share this new link (shown only once).`
        : `Invite created for ${vendor.Name}. Share this link with them — it's shown only once.`,
      inviteToken,
      vendorId: String(VendorID),
      reset: !!wasReset
    });
  } catch (err) { fail(res, err); }
});

app.post('/api/vendor-portal/revoke', perm('masters', 'edit'), async (req, res) => {
  try {
    const { VendorID } = req.body;
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID FROM VendorPortalAccess WHERE OrgID = '${zqRaw(req.orgId)}' AND VendorID = '${zqRaw(VendorID)}'`);
    if (rows.length === 0) return res.status(404).json({ error: 'This vendor has no portal access to revoke.' });
    await safeTable(req.catalystApp, 'VendorPortalAccess').updateRow({ ROWID: rows[0].VendorPortalAccess.ROWID, Status: 'Revoked', CodeHash: '' });
    // Invalidate any live sessions for this vendor.
    const sessions = await zcql.executeZCQLQuery(`SELECT ROWID FROM VendorSessions WHERE OrgID = '${zqRaw(req.orgId)}' AND VendorID = '${zqRaw(VendorID)}'`);
    for (const s of sessions) await safeTable(req.catalystApp, 'VendorSessions').deleteRow(s.VendorSessions.ROWID);
    await audit(req, 'revoke', 'VendorPortalAccess', VendorID, {});
    res.json({ message: 'Portal access revoked.' });
  } catch (err) { fail(res, err); }
});

// ---- Vendor-side: accept invite (sets their own access code), login, session ----
app.post('/api/vendor-portal/accept-invite', async (req, res) => {
  try {
    const { inviteToken, vendorId, accessCode } = req.body;
    if (!inviteToken || !vendorId || !accessCode || String(accessCode).length < 6) {
      return res.status(400).json({ error: 'Invite token, vendor and a 6+ character access code are required.' });
    }
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM VendorPortalAccess WHERE VendorID = '${zqRaw(vendorId)}' AND InviteToken = '${sha256(inviteToken)}'`);
    const access = rows[0]?.VendorPortalAccess;
    if (!access) return res.status(400).json({ error: 'This invite link is invalid.' });
    if (access.Status === 'Revoked') return res.status(403).json({ error: 'This invite has been revoked.' });
    if (new Date(access.InviteExpiresAt) < new Date()) return res.status(400).json({ error: 'This invite link has expired — ask your buyer to resend it.' });

    await safeTable(req.catalystApp, 'VendorPortalAccess').updateRow({
      ROWID: access.ROWID, Status: 'Active', CodeHash: sha256(accessCode), InviteToken: '', InviteExpiresAt: ''
    });
    res.json({ message: 'Access code set — you can now sign in.' });
  } catch (err) { fail(res, err); }
});

app.post('/api/vendor-portal/login', async (req, res) => {
  try {
    const { email, accessCode } = req.body;
    if (!email || !accessCode) return res.status(400).json({ error: 'Email and access code are required.' });
    const zcql = req.catalystApp.zcql();
    const wanted = String(email).trim().toLowerCase();
    // Match case-insensitively in JS so both canonical (lowercased) rows AND any
    // legacy rows stored with mixed-case email still resolve. Among matches,
    // prefer an Active one (the vendor may exist across orgs / re-invites).
    // ZCQL string comparison is case-insensitive (verified against live data),
    // so this single query already matches rows stored with any casing. The
    // JS filter below stays as a belt-and-braces exact match.
    //
    // There used to be a fallback here that scanned every Active row in the
    // table when this query came back empty. It could never find anything the
    // query above had missed, and it read every tenant's rows to do it — so
    // it was removed rather than left as an unbounded cross-tenant read on
    // the unauthenticated login path.
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM VendorPortalAccess WHERE Email = '${zqRaw(wanted)}'`);
    const candidates = rows.map(r => r.VendorPortalAccess)
      .filter(a => String(a.Email || '').trim().toLowerCase() === wanted);
    const access = candidates.find(a => a.Status === 'Active' && a.CodeHash) || candidates[0];
    // Uniform error whether the email is unknown or the code is wrong — never
    // reveal which one failed (prevents email enumeration).
    const fail = () => res.status(401).json({ error: 'Invalid email or access code.' });
    if (!access || access.Status !== 'Active' || !access.CodeHash) return fail();
    if (access.CodeHash !== sha256(accessCode)) return fail();

    const orgRows = await zcql.executeZCQLQuery(`SELECT Status FROM Organizations WHERE ROWID = '${zqRaw(access.OrgID)}'`);
    if (orgRows[0]?.Organizations?.Status === 'Suspended') return res.status(403).json({ error: 'This workspace is currently unavailable.' });
    const vRows = await zcql.executeZCQLQuery(
      `SELECT Name FROM Suppliers WHERE ROWID = '${zqRaw(access.VendorID)}' AND OrgID = '${zqRaw(access.OrgID)}'`);

    const token = randomToken();
    await safeTable(req.catalystApp, 'VendorSessions').insertRow({
      TokenHash: sha256(token), OrgID: access.OrgID, VendorID: access.VendorID,
      ExpiresAt: new Date(Date.now() + VENDOR_SESSION_TTL_MS).toISOString()
    });
    await safeTable(req.catalystApp, 'VendorPortalAccess').updateRow({ ROWID: access.ROWID, LastLoginAt: new Date().toISOString() });

    res.json({ token, vendorId: access.VendorID, name: vRows[0]?.Suppliers?.Name || 'Vendor' });
  } catch (err) { fail(res, err); }
});

app.post('/api/vendor-portal/logout', vendorAuth, async (req, res) => {
  try {
    // Token now arrives via the custom X-Vendor-Token header (Authorization is a
    // fallback) — must match how vendorAuth reads it, or logout wouldn't find the
    // session row to delete.
    const custom = req.headers['x-vendor-token'] || '';
    const header = req.headers.authorization || '';
    const token = custom || (header.startsWith('Bearer ') ? header.slice(7) : '');
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID FROM VendorSessions WHERE TokenHash = '${sha256(token)}'`);
    if (rows.length) await safeTable(req.catalystApp, 'VendorSessions').deleteRow(rows[0].VendorSessions.ROWID);
    res.json({ message: 'Signed out.' });
  } catch (err) { fail(res, err); }
});

// ---- Vendor-side: dashboard data, all scoped to req.vendor (never the client) ----
app.get('/api/vendor-portal/me', vendorAuth, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const [vRows, orgRows] = await Promise.all([
      zcql.executeZCQLQuery(`SELECT * FROM Suppliers WHERE ROWID = '${zqRaw(req.vendor.vendorId)}' AND OrgID = '${zqRaw(req.vendor.orgId)}'`),
      zcql.executeZCQLQuery(`SELECT Name, Settings FROM Organizations WHERE ROWID = '${zqRaw(req.vendor.orgId)}'`)
    ]);
    const settings = safeParse(orgRows[0]?.Organizations?.Settings, {});
    const prefs = vendorPortalPrefs(settings);
    if (!prefs.enabled) return res.status(403).json({ error: 'The vendor portal is currently disabled for this workspace.' });
    res.json({
      vendor: vRows[0]?.Suppliers || null,
      orgName: orgRows[0]?.Organizations?.Name || 'Workspace',
      prefs
    });
  } catch (err) { fail(res, err); }
});

app.get('/api/vendor-portal/rfqs', vendorAuth, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const invites = await zcql.executeZCQLQuery(`SELECT RFQID FROM RFQVendors WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND VendorID = '${zqRaw(req.vendor.vendorId)}'`);
    const rfqIds = invites.map(r => String(r.RFQVendors.RFQID));
    if (rfqIds.length === 0) return res.json([]);
    const idList = rfqIds.map(id => `'${zqRaw(id)}'`).join(', ');
    const rfqs = await zcql.executeZCQLQuery(`SELECT * FROM RFQs WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND ROWID IN (${idList})`);
    const bids = await zcql.executeZCQLQuery(`SELECT * FROM Bids WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND VendorID = '${zqRaw(req.vendor.vendorId)}'`);
    const bidByRfq = Object.fromEntries(bids.map(r => [String(r.Bids.RFQID), r.Bids]));
    res.json(rfqs.map(r => ({ ...r.RFQs, myBid: bidByRfq[String(r.RFQs.ROWID)] || null })));
  } catch (err) { res.json([]); }
});

app.post('/api/vendor-portal/rfqs/:rfqId/bid', vendorAuth, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const orgRows = await zcql.executeZCQLQuery(`SELECT Settings FROM Organizations WHERE ROWID = '${zqRaw(req.vendor.orgId)}'`);
    if (!vendorPortalPrefs(safeParse(orgRows[0]?.Organizations?.Settings, {})).allowBidding) {
      return res.status(403).json({ error: 'Bid submission is turned off for this workspace.' });
    }
    const invited = await zcql.executeZCQLQuery(`SELECT ROWID FROM RFQVendors WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND RFQID = '${zqRaw(req.params.rfqId)}' AND VendorID = '${zqRaw(req.vendor.vendorId)}'`);
    if (invited.length === 0) return res.status(403).json({ error: 'You were not invited to bid on this RFQ.' });
    const rfqRows = await zcql.executeZCQLQuery(`SELECT * FROM RFQs WHERE ROWID = '${zqRaw(req.params.rfqId)}' AND OrgID = '${zqRaw(req.vendor.orgId)}'`);
    const rfq = rfqRows[0]?.RFQs;
    if (!rfq) return res.status(404).json({ error: 'RFQ not found.' });
    if (rfq.Status !== 'Published') return res.status(400).json({ error: 'This RFQ is no longer accepting bids.' });
    if (rfq.Deadline && new Date(rfq.Deadline) < new Date()) return res.status(400).json({ error: 'The bid deadline has passed.' });

    const { TotalBidAmount, ProposalNotes } = req.body;
    if (!TotalBidAmount || Number(TotalBidAmount) <= 0) return res.status(400).json({ error: 'Enter a positive bid amount.' });

    const existing = await zcql.executeZCQLQuery(`SELECT ROWID FROM Bids WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND RFQID = '${zqRaw(req.params.rfqId)}' AND VendorID = '${zqRaw(req.vendor.vendorId)}'`);
    const table = safeTable(req.catalystApp, 'Bids');
    const payload = { TotalBidAmount: Number(TotalBidAmount), ProposalNotes: (ProposalNotes || '').slice(0, 2000), Status: 'Submitted' };
    if (existing.length > 0) await table.updateRow({ ROWID: existing[0].Bids.ROWID, ...payload });
    else await table.insertRow({ OrgID: req.vendor.orgId, RFQID: String(req.params.rfqId), VendorID: req.vendor.vendorId, ...payload });
    res.json({ message: 'Bid submitted.' });
  } catch (err) { fail(res, err); }
});

app.get('/api/vendor-portal/pos', vendorAuth, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND SupplierID = '${zqRaw(req.vendor.vendorId)}' ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.POs));
  } catch (err) { res.json([]); }
});

app.post('/api/vendor-portal/pos/:id/decision', vendorAuth, async (req, res) => {
  try {
    const { Decision, Note } = req.body;
    if (!['Accepted', 'Rejected'].includes(Decision)) return res.status(400).json({ error: 'Decision must be Accepted or Rejected.' });
    const zcql = req.catalystApp.zcql();
    const orgRows = await zcql.executeZCQLQuery(`SELECT Settings FROM Organizations WHERE ROWID = '${zqRaw(req.vendor.orgId)}'`);
    if (!vendorPortalPrefs(safeParse(orgRows[0]?.Organizations?.Settings, {})).allowPOAcceptReject) {
      return res.status(403).json({ error: 'Accepting/rejecting orders is turned off for this workspace.' });
    }
    const poRows = await zcql.executeZCQLQuery(`SELECT * FROM POs WHERE ROWID = '${zqRaw(req.params.id)}' AND OrgID = '${zqRaw(req.vendor.orgId)}' AND SupplierID = '${zqRaw(req.vendor.vendorId)}'`);
    if (poRows.length === 0) return res.status(404).json({ error: 'Purchase order not found.' });
    await safeTable(req.catalystApp, 'POs').updateRow({ ROWID: req.params.id, VendorDecision: Decision, VendorNote: (Note || '').slice(0, 2000) });
    res.json({ message: `Order marked ${Decision.toLowerCase()}.` });
  } catch (err) { fail(res, err); }
});

app.get('/api/vendor-portal/invoices', vendorAuth, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const poRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM POs WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND SupplierID = '${zqRaw(req.vendor.vendorId)}'`);
    const poIds = poRows.map(r => String(r.POs.ROWID));
    if (poIds.length === 0) return res.json([]);
    const idList = poIds.map(id => `'${zqRaw(id)}'`).join(', ');
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Invoices WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND POID IN (${idList}) ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.Invoices));
  } catch (err) { res.json([]); }
});

app.get('/api/vendor-portal/payments', vendorAuth, async (req, res) => {
  try {
    const zcql = req.catalystApp.zcql();
    const poRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM POs WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND SupplierID = '${zqRaw(req.vendor.vendorId)}'`);
    const poIds = poRows.map(r => String(r.POs.ROWID));
    if (poIds.length === 0) return res.json([]);
    const idList = poIds.map(id => `'${zqRaw(id)}'`).join(', ');
    const invRows = await zcql.executeZCQLQuery(`SELECT ROWID FROM Invoices WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND POID IN (${idList})`);
    const invIds = invRows.map(r => String(r.Invoices.ROWID));
    if (invIds.length === 0) return res.json([]);
    const invIdList = invIds.map(id => `'${zqRaw(id)}'`).join(', ');
    const rows = await zcql.executeZCQLQuery(`SELECT * FROM Payments WHERE OrgID = '${zqRaw(req.vendor.orgId)}' AND InvoiceID IN (${invIdList}) ORDER BY ROWID DESC`);
    res.json(rows.map(r => r.Payments));
  } catch (err) { res.json([]); }
});

// Export Express app to serve as Advanced I/O listener
module.exports = app;
