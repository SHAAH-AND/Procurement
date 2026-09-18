import { useState, useEffect } from 'react';
import { getSettings as apiGet, updateSettings as apiSet } from '../../api';

// ── Settings service: cached access to the tenant settings store ──

let cache: Record<string, any> | null = null;
let inflight: Promise<Record<string, any>> | null = null;

export const DEFAULTS: Record<string, any> = {
  'org.profile': { name: '', industry: 'Hospitality', email: '', phone: '', address: '' },
  'org.branding': { tagline: 'Smarter Procurement. Simplified.', primary: '#2084FA' },
  'org.locations': [],
  'org.departments': [{ name: 'Food & Beverage' }, { name: 'Housekeeping' }, { name: 'Front Office' }, { name: 'Engineering' }, { name: 'Finance' }],
  'org.ai': { enabled: false, provider: '', apiKey: '' },
  'setup.general': { dateFormat: 'dd MMM yyyy', timezone: 'Asia/Colombo', weekStart: 'Monday' },
  'setup.currencies': {
    base: 'LKR',
    list: [
      { code: 'LKR', symbol: 'Rs', rate: 1 },
      { code: 'USD', symbol: '$', rate: 300 },
      { code: 'EUR', symbol: '€', rate: 325 },
      { code: 'GBP', symbol: '£', rate: 380 },
    ],
  },
  'setup.paymentTerms': [{ name: 'Due on Receipt' }, { name: 'Net 15' }, { name: 'Net 30' }, { name: 'Net 45' }, { name: 'Net 60' }, { name: 'Advance' }, { name: 'COD' }],
  'setup.taxes': [
    { name: 'No Tax', rate: 0, code: 'NO-TAX' },
    { name: 'VAT 18%', rate: 18, code: 'VAT18' },
    { name: 'SSCL 2.5%', rate: 2.5, code: 'SSCL' },
  ],
  'setup.accounts': [
    { name: 'Cost of Goods Sold' }, { name: 'Office Supplies Expense' }, { name: 'Raw Materials' },
    { name: 'Services Expense' }, { name: 'Maintenance Expense' }, { name: 'Rent Expense' }, { name: 'Other' },
  ],
  'setup.projects': [],
  'setup.customers': [],
  'setup.portal': { enabled: false, url: '', allowQuotes: true },
  'setup.punchout': { enabled: false, supplier: '', url: '' },
  'custom.numbering': { bills: { prefix: 'BILL', next: '' }, pos: { prefix: 'PO', next: '' } },
  'custom.pdf': { template: 'Standard Template' },
  'custom.notifications': {
    billSubmitted: true, billApproved: true, billOverdue: true,
    paymentMade: true, poIssued: false, creditApplied: false, batchProcessed: true,
  },
  'custom.tags': [],
  'custom.webtabs': [],
  'auto.rules': [],
  'auto.logs': [],
  'auto.actions': { block: true, notify: true },
  'dev.webhooks': [],
  'dev.connections': [],
  'dev.integrations': { zoho: { enabled: false, clientId: '', clientSecret: '' } },
  'dev.features': { widgets: false, signals: false, deluge: false, webforms: false, datamgmt: false },
  // ── Access control (Zoho-style users → roles → module grants + scopes) ──
  'access.customRoles': [],
  'access.assignments': {},
  'access.scopes': {},
  // ── Custom module builder (Zoho CRM modules + Creator lookup fields) ──
  'custom.modules': [],
};

export async function getSettings(force = false): Promise<Record<string, any>> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  const run: Promise<Record<string, any>> = apiGet().then((r: any) => {
    const next: Record<string, any> = { ...(r?.data ?? r ?? {}) };
    cache = next;
    return next;
  }).catch(() => {
    if (!cache) cache = {};
    return cache;
  }).finally(() => { inflight = null; });
  inflight = run;
  return run;
}

export function getCached<T>(key: string, fallback: T): T {
  if (cache && cache[key] !== undefined) return cache[key] as T;
  return (DEFAULTS[key] !== undefined ? DEFAULTS[key] : fallback) as T;
}

export async function saveSettings(patch: Record<string, any>): Promise<Record<string, any>> {
  const r: any = await apiSet(patch);
  cache = { ...(r?.data ?? r ?? {}), ...cache, ...patch };
  // backend echoes full store; prefer it when present
  const fresh = r?.data ?? r;
  if (fresh && typeof fresh === 'object' && Object.keys(fresh).length) cache = fresh;
  return cache!;
}

export function useSettingKey<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => getCached(key, fallback));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getSettings().then((s) => {
      setValue(s[key] !== undefined ? s[key] : (DEFAULTS[key] !== undefined ? DEFAULTS[key] : fallback));
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { value, setValue, loading };
}

export async function appendLog(text: string) {
  try {
    const s = await getSettings();
    const logs = Array.isArray(s['auto.logs']) ? s['auto.logs'] : [];
    const next = [{ at: new Date().toISOString(), text }, ...logs].slice(0, 200);
    await saveSettings({ 'auto.logs': next });
  } catch { /* logging must never break the flow */ }
}
