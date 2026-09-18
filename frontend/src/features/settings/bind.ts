import { useState, useEffect } from 'react';
import { getSettings, getCached, appendLog } from './service';

// ── Bindings: settings values consumed across procurement forms ──

const DEFAULT_ACCOUNTS = [
  'Cost of Goods Sold', 'Office Supplies Expense', 'Raw Materials',
  'Services Expense', 'Maintenance Expense', 'Rent Expense', 'Other',
];

const DEFAULT_TAXES = [
  { id: 'none', label: 'Select a Tax', rate: 0 },
  { id: 'vat0', label: 'No Tax', rate: 0 },
  { id: 'vat18', label: 'VAT 18%', rate: 0.18 },
  { id: 'sscl', label: 'SSCL 2.5%', rate: 0.025 },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tax';

function useSettingsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getSettings().then(() => setReady(true)).catch(() => setReady(true));
  }, []);
  return ready;
}

export function useAccounts(): string[] {
  useSettingsReady();
  const list = getCached<any[]>('setup.accounts', DEFAULT_ACCOUNTS.map((name) => ({ name })));
  const names = (Array.isArray(list) ? list : []).map((a: any) => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  return names.length ? names : [...DEFAULT_ACCOUNTS];
}

export function useTaxes(): { id: string; label: string; rate: number }[] {
  useSettingsReady();
  const list = getCached<any[]>('setup.taxes', DEFAULT_TAXES);
  if (!Array.isArray(list) || !list.length) return DEFAULT_TAXES;
  const mapped = list.map((t: any) =>
    typeof t === 'string'
      ? { id: slug(t), label: t, rate: 0 }
      : { id: t.code ? slug(String(t.code)) : slug(String(t.name || 'tax')), label: String(t.name || 'Tax'), rate: (Number(t.rate) || 0) / 100 },
  );
  return [{ id: 'none', label: 'Select a Tax', rate: 0 }, ...mapped.filter((t) => t.id !== 'none')];
}

export function taxIdForTaxes(taxes: { id: string; label: string }[], stored: any): string {
  if (!stored) return 'none';
  const hit = taxes.find((t) => t.label === stored || t.id === stored);
  return hit ? hit.id : 'none';
}

export function useTermsDefault(): string {
  useSettingsReady();
  const mod = getCached<any>('modules.bills', {});
  return typeof mod?.terms === 'string' && mod.terms ? mod.terms : 'Due on Receipt';
}

export function usePdfTemplate(): string {
  useSettingsReady();
  const pdf = getCached<any>('custom.pdf', {});
  return typeof pdf?.template === 'string' && pdf.template ? pdf.template : 'Standard Template';
}

export function useLocations(): string[] {
  useSettingsReady();
  const list = getCached<any[]>('org.locations', []);
  return (Array.isArray(list) ? list : []).map((l: any) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
}

export function useTags(): string[] {
  useSettingsReady();
  const list = getCached<any[]>('custom.tags', []);
  return (Array.isArray(list) ? list : []).map((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
}

export function useWebTabs(): { label: string; url: string }[] {
  const [tabs, setTabs] = useState<{ label: string; url: string }[]>([]);
  useEffect(() => {
    getSettings().then((s) => {
      const list = Array.isArray(s['custom.webtabs']) ? s['custom.webtabs'] : [];
      setTabs(list.filter((t: any) => t?.label && t?.url).map((t: any) => ({ label: String(t.label), url: String(t.url) })));
    }).catch(() => {});
  }, []);
  return tabs;
}

// ── Workflow guard: enforced on bill submit + payment record ──

export async function evaluateRules(
  event: 'bill.submit' | 'payment.record',
  total: number,
): Promise<{ blocked: string; notices: string[] }> {
  const res = { blocked: '', notices: [] as string[] };
  try {
    const s = await getSettings();
    const actions = s['auto.actions'] ?? { block: true, notify: true };
    const rules = Array.isArray(s['auto.rules']) ? s['auto.rules'] : [];
    const fmt = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    for (const r of rules) {
      if (!r?.enabled || r.trigger !== event) continue;
      if (!(Number(r.threshold) > 0) || !(total > Number(r.threshold))) continue;
      if (r.action === 'block' && actions.block && event === 'bill.submit') {
        res.blocked = `Blocked by workflow rule "${r.name}": bills over ${Number(r.threshold).toLocaleString()} cannot be opened.`;
        await appendLog(`Blocked bill submit (${fmt}) — rule "${r.name}".`);
        break;
      }
      if (r.action === 'notify' && actions.notify) {
        res.notices.push(`Rule "${r.name}": notice queued (in-app only).`);
        await appendLog(`Notice queued by rule "${r.name}" on ${event} (${fmt}).`);
      }
    }
  } catch { /* automation must never break the flow */ }
  return res;
}
