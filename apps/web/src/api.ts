// ProcureFlow API client — tries local Nest backend first (where demo lives), falls back to Catalyst
const LOCAL_BASE = '/api/v1';
const CATALYST_BASE = '/server/procurement_api/api/v1';

let token: string | null = null;

export function setToken(t: string | null) { token = t; }
export function getToken(): string | null { return token; }

async function requestWithBase(base: string, path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (res.status === 401) throw new Error('Session expired — please sign in again.');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message || (body as any).error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Auth hits local (demo/local DB) first; procurement data hits Catalyst first (real hotel data)
  const isAuth = path.startsWith('/auth');
  const primary = isAuth ? LOCAL_BASE : CATALYST_BASE;
  const fallback = isAuth ? CATALYST_BASE : LOCAL_BASE;
  try {
    return await requestWithBase(primary, path, options);
  } catch (e: any) {
    const isNetwork = e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError');
    // For data: if Catalyst is down, try local. For auth: if local is down, try Catalyst.
    // Also for auth: if local returns 401, still try Catalyst (covers Zoho/Catalyst users)
    const shouldFallback = isNetwork || (isAuth && e.message?.includes('Invalid credentials'));
    if (shouldFallback) {
      return requestWithBase(fallback, path, options);
    }
    // For procurement data: if local stub returns [] empty, try Catalyst for real data
    throw e;
  }
}

// Helper for procurement data that prefers Catalyst but shows local [] as empty state, not error
async function procurementRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    const res = await requestWithBase(CATALYST_BASE, path, options);
    // If Catalyst returns empty and local is reachable, local also empty — fine
    return res;
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      return requestWithBase(LOCAL_BASE, path, options);
    }
    throw e;
  }
}

export async function healthCheck() {
  try {
    const h = await request('/health');
    return h;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function signup(email: string, password: string, orgName: string) {
  return request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, orgName }),
  });
}

export async function getMe() {
  return request('/auth/me');
}

export async function getOrders() { return procurementRequest('/orders'); }
export async function getApprovals() { return procurementRequest('/approvals'); }
export async function getItems() { return procurementRequest('/items'); }
export async function getVendors() { return procurementRequest('/vendors'); }
export async function getProperties() { return procurementRequest('/properties'); }

export type CreateItemPayload = {
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  costPrice?: number;
  description?: string;
};
export type CreateVendorPayload = {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  category?: string;
  paymentTerms?: string;
  address?: string;
};

export async function createItem(payload: CreateItemPayload) {
  return procurementRequest('/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function createVendor(payload: CreateVendorPayload) {
  return procurementRequest('/vendors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Purchase Requests (local Nest backend, tenant-scoped) ──
export type PrLinePayload = {
  itemId?: string;
  itemName: string;
  category?: string;
  description?: string;
  preferredVendor?: string;
  quantity?: number;
  estimatedRate?: number;
  discount?: number;
};
export type CreatePrPayload = {
  expectedDate?: string;
  deliveryAddress?: string;
  reason?: string;
  notes?: string;
  reference?: string;
  lines: PrLinePayload[];
};

async function prRequest(path: string, options: RequestInit = {}) {
  return requestWithBase(LOCAL_BASE, `/prs${path}`, options);
}

export async function getMyPrs() { return prRequest('/mine'); }
export async function getAllPrs() { return prRequest(''); }
export async function getPendingPrs() { return prRequest('/pending'); }
export async function getPr(id: string) { return prRequest(`/${id}`); }
export async function createPr(payload: CreatePrPayload) {
  return prRequest('', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updatePr(id: string, payload: Partial<CreatePrPayload>) {
  return prRequest(`/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function prAction(id: string, action: 'submit' | 'approve' | 'reject' | 'recall' | 'cancel' | 'process', body: any = {}) {
  return prRequest(`/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
}

// ── Procure-to-pay: POs, Receives, Bills, Credits, Payments (ERPNext-aligned) ──
async function docRequest(doc: string, path: string, options: RequestInit = {}) {
  return requestWithBase(LOCAL_BASE, `/${doc}${path}`, options);
}
export async function getPos() { return docRequest('pos', ''); }
export async function getPo(id: string) { return docRequest('pos', `/${id}`); }
export async function createPo(payload: any) { return docRequest('pos', '', { method: 'POST', body: JSON.stringify(payload) }); }
export async function createPoFromPr(payload: { prId: string; lineIds?: string[]; vendorId?: string; vendorName?: string }) {
  return docRequest('pos', '/from-pr', { method: 'POST', body: JSON.stringify(payload) });
}
export async function poAction(id: string, action: string) { return docRequest('pos', `/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }); }

export async function getReceives() { return docRequest('receives', ''); }
export async function getReceive(id: string) { return docRequest('receives', `/${id}`); }
export async function createReceiveFromPo(payload: { poId: string; lines: { poLineId: string; quantity: number }[]; notes?: string }) {
  return docRequest('receives', '/from-po', { method: 'POST', body: JSON.stringify(payload) });
}
export async function receiveAction(id: string, action: string) { return docRequest('receives', `/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }); }

export async function getBills() { return docRequest('bills', ''); }
export async function getBill(id: string) { return docRequest('bills', `/${id}`); }
export async function createBill(payload: any) { return docRequest('bills', '', { method: 'POST', body: JSON.stringify(payload) }); }
export async function billAction(id: string, action: string) { return docRequest('bills', `/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }); }
export async function payBill(id: string, payload: { amount: number; method?: string; reference?: string }) {
  return docRequest('bills', `/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) });
}
export async function getBillMatch(id: string) { return docRequest('bills', `/${id}/match`); }

export async function getCredits() { return docRequest('credits', ''); }
export async function createCredit(payload: { vendorName: string; amount: number; source?: string; notes?: string }) {
  return docRequest('credits', '', { method: 'POST', body: JSON.stringify(payload) });
}
export async function applyCredit(id: string, payload: { billId: string; amount: number }) {
  return docRequest('credits', `/${id}/apply`, { method: 'POST', body: JSON.stringify(payload) });
}
export async function getPayments() { return docRequest('payments', ''); }
export async function getDashboard(period = 'year') {
  return docRequest('dashboard', `/summary?period=${encodeURIComponent(period)}`);
}

// ── Phase 3: RFQ + portal + awards ──
export async function getRfqs() { return docRequest('rfqs', ''); }
export async function getRfq(id: string) { return docRequest('rfqs', `/${id}`); }
export async function createRfq(payload: any) { return docRequest('rfqs', '', { method: 'POST', body: JSON.stringify(payload) }); }
export async function rfqAction(id: string, action: string) { return docRequest('rfqs', `/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }); }
export async function getRfqCompare(id: string) { return docRequest('rfqs', `/${id}/compare`); }
export async function portalView(token: string) { return docRequest('portal', `/rfqs/${token}`); }
export async function portalQuote(token: string, payload: any) {
  return docRequest('portal', `/rfqs/${token}/quotes`, { method: 'POST', body: JSON.stringify(payload) });
}
export async function awardFromBid(payload: { bidId: string; lines: { bidLineId: string; quantity: number }[]; reason?: string }) {
  return docRequest('awards', '/from-bid', { method: 'POST', body: JSON.stringify(payload) });
}
export async function awardToPo(id: string) { return docRequest('awards', `/${id}/purchase-order`, { method: 'POST', body: JSON.stringify({}) }); }

// ── Phase 4: recurrence + batches + multi-pay ──
export async function getRecurrences() { return docRequest('recurrence', ''); }
export async function createRecurrence(payload: any) {
  return docRequest('recurrence', '', { method: 'POST', body: JSON.stringify(payload) });
}
export async function runRecurrence(id: string) { return docRequest('recurrence', `/${id}/run`, { method: 'POST', body: JSON.stringify({}) }); }
export async function disableRecurrence(id: string) { return docRequest('recurrence', `/${id}/disable`, { method: 'POST', body: JSON.stringify({}) }); }
export async function getBatches() { return docRequest('batches', ''); }
export async function createBatch(payload: any) { return docRequest('batches', '', { method: 'POST', body: JSON.stringify(payload) }); }
export async function batchAction(id: string, action: string) { return docRequest('batches', `/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) }); }
export async function multiPay(payload: { vendorName?: string; method?: string; reference?: string; lines: { billId: string; amount: number }[] }) {
  return docRequest('payments', '/multi', { method: 'POST', body: JSON.stringify(payload) });
}
