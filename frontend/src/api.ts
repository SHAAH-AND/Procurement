// ProcureFlow API client.
//
// Everything talks to the Catalyst function on this origin:
//   /server/procurement_api/api/v1/...   the surface this client is built for
//   /server/procurement_api/api/...      first-run setup (legacy path)
//
// Authentication is Catalyst hosted auth: the user signs in through the
// embedded Zoho Accounts widget (pages/SignIn.tsx) and every request carries
// the auth token the Catalyst web SDK mints for the session. There is no
// password handling in this code base at all.

const API_BASE = '/server/procurement_api/api/v1';
const LEGACY_BASE = '/server/procurement_api/api';

declare global {
  interface Window {
    catalyst?: {
      auth?: {
        signIn?: (containerId: string, opts?: Record<string, string>) => Promise<unknown> | void;
        signOut?: (redirect?: string) => void;
        isUserAuthenticated?: () => Promise<{ content?: Record<string, string> }>;
        generateAuthToken?: () => Promise<{ access_token?: string; content?: { access_token?: string } }>;
      };
    };
  }
}

// ── Catalyst auth token ──────────────────────────────────────────────────────
// generateAuthToken() has been observed to never settle; racing it against a
// timer turns that hang into a plain "no token", which the 401 path reports
// as a sign-in problem instead of an endless spinner.
const TOKEN_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 30000;
let authToken: string | null = null;
let tokenHung = false;

export function setToken(t: string | null) { authToken = t; }
export function getToken(): string | null { return authToken; }

async function getAuthToken(force = false): Promise<string | null> {
  if (authToken && !force) return authToken;
  if (tokenHung && !force) return null;
  const auth = window.catalyst?.auth;
  if (!auth || typeof auth.generateAuthToken !== 'function') return null;
  try {
    const res: any = await Promise.race([
      auth.generateAuthToken(), // as a method: the SDK relies on `this`
      new Promise((_, reject) => setTimeout(() => reject(new Error('token-timeout')), TOKEN_TIMEOUT_MS)),
    ]);
    authToken = res?.access_token || res?.content?.access_token || null;
    tokenHung = false;
  } catch (err: any) {
    if (err?.message === 'token-timeout') tokenHung = true;
    authToken = null;
  }
  return authToken;
}

// ── Session call log (Settings → Developer → API usage) ─────────────────────
export type ApiCall = { at: number; method: string; path: string; ok: boolean; status?: number };
const callLog: ApiCall[] = [];
export function apiCallLog(): ApiCall[] { return callLog; }
function logCall(method: string, path: string, ok: boolean, status?: number) {
  callLog.unshift({ at: Date.now(), method, path, ok, status });
  if (callLog.length > 200) callLog.length = 200;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  body: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

type RequestOptions = RequestInit & { noAuth?: boolean };

async function requestWithBase(base: string, path: string, options: RequestOptions = {}, retried = false): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  const token = options.noAuth ? null : await getAuthToken();
  if (token) headers['Authorization'] = token;
  const method = (options.method || 'GET').toUpperCase();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    const { noAuth: _noAuth, ...init } = options;
    res = await fetch(`${base}${path}`, { ...init, headers, credentials: 'include', signal: ctrl.signal });
  } catch (err: any) {
    logCall(method, `${base}${path}`, false);
    if (err?.name === 'AbortError') throw new ApiError('The server did not respond in time. Please try again.', 0);
    throw new ApiError('Network request failed. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
  logCall(method, `${base}${path}`, res.ok, res.status);

  if (res.status === 401) {
    if (!retried && !options.noAuth) {
      await getAuthToken(true);
      return requestWithBase(base, path, options, true);
    }
    window.dispatchEvent(new CustomEvent('procureflow:auth-required'));
    throw new ApiError('Your session could not be verified. Please sign in again.', 401);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body?.message || body?.error || `Request failed (${res.status})`, res.status, body);
  }
  return body;
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  return requestWithBase(API_BASE, path, options);
}
const json = (method: string, body: any): RequestInit => ({ method, body: JSON.stringify(body ?? {}) });

// ── Boot / session ───────────────────────────────────────────────────────────
export async function healthCheck() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal, credentials: 'include', cache: 'no-store' });
    if (!res.ok) return { ok: false, reason: `Server responded ${res.status}.`, version: '' };
    const body = await res.json();
    return { ok: !!body.ok, version: body.version as string, reason: '' };
  } catch (e: any) {
    return { ok: false, version: '', reason: e?.name === 'AbortError' ? 'The server did not respond in time.' : 'Network request failed.' };
  } finally {
    clearTimeout(t);
  }
}

export type MeResponse = {
  setupRequired?: boolean;
  id?: string; email: string; name?: string | null; department?: string | null; status?: string;
  orgName?: string; tenantId?: string; roles?: string[]; permissions?: string[];
  orgSettings?: { currency?: string; timezone?: string | null; multiProperty?: boolean };
  version?: string; notice?: string | null;
};
export async function getMe(): Promise<MeResponse> { return request('/auth/me'); }
export async function logoutSession() { return request('/auth/logout', json('POST', {})).catch(() => ({})); }

export type SetupPayload = {
  orgName: string; currency: string; country: string; address?: string; phone?: string;
  fiscalYearStart: string; timezone: string; adminName: string; adminApprovalLimit: number; domain: string;
  properties: { Name: string; Location: string; Cluster: string }[];
};
export async function setupWorkspace(payload: SetupPayload) {
  return requestWithBase(LEGACY_BASE, '/setup', json('POST', payload));
}

// ── Masters ──────────────────────────────────────────────────────────────────
export async function getOrders() { return request('/orders'); }
export async function getApprovals() { return request('/approvals'); }
export async function getItems() { return request('/items'); }
export async function getVendors() { return request('/vendors'); }
export async function getProperties() { return request('/properties'); }

export type CreateItemPayload = { name: string; sku?: string; category?: string; unit?: string; costPrice?: number; description?: string };
export type CreateVendorPayload = { name: string; contactPerson?: string; email?: string; phone?: string; category?: string; paymentTerms?: string; address?: string };
export async function createItem(payload: CreateItemPayload) { return request('/items', json('POST', payload)); }
export async function createVendor(payload: CreateVendorPayload) { return request('/vendors', json('POST', payload)); }

// ── Purchase requests ────────────────────────────────────────────────────────
export type PrLinePayload = { itemId?: string; itemName: string; category?: string; description?: string; preferredVendor?: string; quantity?: number; estimatedRate?: number; discount?: number };
export type CreatePrPayload = { expectedDate?: string; deliveryAddress?: string; reason?: string; notes?: string; reference?: string; lines: PrLinePayload[] };

export async function getMyPrs() { return request('/prs/mine'); }
export async function getAllPrs() { return request('/prs'); }
export async function getPendingPrs() { return request('/prs/pending'); }
export async function getPr(id: string) { return request(`/prs/${id}`); }
export async function createPr(payload: CreatePrPayload) { return request('/prs', json('POST', payload)); }
export async function updatePr(id: string, payload: Partial<CreatePrPayload>) { return request(`/prs/${id}`, json('PATCH', payload)); }
export async function prAction(id: string, action: 'submit' | 'approve' | 'reject' | 'recall' | 'cancel' | 'process', body: any = {}) {
  return request(`/prs/${id}/${action}`, json('POST', body));
}

// ── Procure-to-pay: POs, receives, bills, credits, payments ─────────────────
export async function getPos() { return request('/pos'); }
export async function getPo(id: string) { return request(`/pos/${id}`); }
export async function createPo(payload: any) { return request('/pos', json('POST', payload)); }
export async function createPoFromPr(payload: { prId: string; lineIds?: string[]; vendorId?: string; vendorName?: string }) { return request('/pos/from-pr', json('POST', payload)); }
export async function poAction(id: string, action: string) { return request(`/pos/${id}/${action}`, json('POST', {})); }
export async function deletePo(id: string) { return request(`/pos/${id}`, { method: 'DELETE' }); }

export async function getReceives() { return request('/receives'); }
export async function getReceive(id: string) { return request(`/receives/${id}`); }
export async function createReceiveFromPo(payload: { poId: string; lines: { poLineId: string; quantity: number }[]; notes?: string; tracking?: string; trackingUrl?: string; receivedAt?: string; documents?: string }) {
  return request('/receives/from-po', json('POST', payload));
}
export async function receiveAction(id: string, action: string) { return request(`/receives/${id}/${action}`, json('POST', {})); }

export async function getBills() { return request('/bills'); }
export async function getBill(id: string) { return request(`/bills/${id}`); }
export async function createBill(payload: any) { return request('/bills', json('POST', payload)); }
export async function updateBill(id: string, payload: any) { return request(`/bills/${id}`, json('PATCH', payload)); }
export async function deleteBill(id: string) { return request(`/bills/${id}`, { method: 'DELETE' }); }
export async function billAction(id: string, action: string) { return request(`/bills/${id}/${action}`, json('POST', {})); }
export async function payBill(id: string, payload: { amount: number; method?: string; reference?: string }) { return request(`/bills/${id}/pay`, json('POST', payload)); }
export async function getBillMatch(id: string) { return request(`/bills/${id}/match`); }

export async function getCredits() { return request('/credits'); }
export async function createCredit(payload: { vendorName: string; amount: number; source?: string; notes?: string }) { return request('/credits', json('POST', payload)); }
export async function applyCredit(id: string, payload: { billId: string; amount: number }) { return request(`/credits/${id}/apply`, json('POST', payload)); }
export async function getPayments() { return request('/payments'); }
export async function updatePayment(id: string, payload: { method?: string; reference?: string; paidAt?: string }) { return request(`/payments/${id}`, json('PATCH', payload)); }
export async function deletePayment(id: string) { return request(`/payments/${id}`, { method: 'DELETE' }); }
export async function getDashboard(period = 'year') { return request(`/dashboard/summary?period=${encodeURIComponent(period)}`); }

// ── Settings, users, roles ───────────────────────────────────────────────────
export async function getSettings() { return request('/settings'); }
export async function updateSettings(patch: Record<string, any>) { return request('/settings', json('PATCH', { settings: patch })); }
export async function getTenantUsers() { return request('/users'); }
export async function inviteUser(payload: { email: string; name?: string; department?: string; role?: string }) { return request('/users', json('POST', payload)); }
export async function updateTenantUser(id: string, payload: { name?: string; department?: string | null; status?: string; role?: string | null }) { return request(`/users/${id}`, json('PATCH', payload)); }
export async function getRoles() { return request('/roles'); }

export async function getBudgets() { return request('/budgets'); }
export async function getBudget(id: string) { return request(`/budgets/${id}`); }
export async function createBudget(payload: any) { return request('/budgets', json('POST', payload)); }
export async function updateBudget(id: string, payload: any) { return request(`/budgets/${id}`, json('PATCH', payload)); }
export async function deleteBudget(id: string) { return request(`/budgets/${id}`, { method: 'DELETE' }); }

// ── RFQ, vendor portal, awards ───────────────────────────────────────────────
export async function getRfqs() { return request('/rfqs'); }
export async function getRfq(id: string) { return request(`/rfqs/${id}`); }
export async function createRfq(payload: any) { return request('/rfqs', json('POST', payload)); }
export async function rfqAction(id: string, action: string) { return request(`/rfqs/${id}/${action}`, json('POST', {})); }
export async function getRfqCompare(id: string) { return request(`/rfqs/${id}/compare`); }
// The portal is opened from an emailed link by a supplier with no account:
// the token is the credential, so these two calls carry no session at all.
export async function portalView(token: string) { return requestWithBase(API_BASE, `/portal/rfqs/${token}`, { noAuth: true }); }
export async function portalQuote(token: string, payload: any) { return requestWithBase(API_BASE, `/portal/rfqs/${token}/quotes`, { ...json('POST', payload), noAuth: true }); }
export async function awardFromBid(payload: { bidId: string; lines: { bidLineId: string; quantity: number }[]; reason?: string }) { return request('/awards/from-bid', json('POST', payload)); }
export async function awardToPo(id: string) { return request(`/awards/${id}/purchase-order`, json('POST', {})); }

// ── Recurring bills, batches, multi-pay ──────────────────────────────────────
export async function getRecurrences() { return request('/recurrence'); }
export async function getRecurrence(id: string) { return request(`/recurrence/${id}`); }
export async function updateRecurrence(id: string, payload: any) { return request(`/recurrence/${id}`, json('PATCH', payload)); }
export async function deleteRecurrence(id: string) { return request(`/recurrence/${id}`, { method: 'DELETE' }); }
export async function createRecurrence(payload: any) { return request('/recurrence', json('POST', payload)); }
export async function runRecurrence(id: string) { return request(`/recurrence/${id}/run`, json('POST', {})); }
export async function disableRecurrence(id: string) { return request(`/recurrence/${id}/disable`, json('POST', {})); }
export async function getBatches() { return request('/batches'); }
export async function getBatch(id: string) { return request(`/batches/${id}`); }
export async function updateBatch(id: string, payload: any) { return request(`/batches/${id}`, json('PATCH', payload)); }
export async function deleteBatch(id: string) { return request(`/batches/${id}`, { method: 'DELETE' }); }
export async function createBatch(payload: any) { return request('/batches', json('POST', payload)); }
export async function batchAction(id: string, action: string) { return request(`/batches/${id}/${action}`, json('POST', {})); }
export async function multiPay(payload: { vendorName?: string; method?: string; reference?: string; paidAt?: string; lines: { billId: string; amount: number }[] }) {
  return request('/payments/multi', json('POST', payload));
}
