import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useQueryFilter<T>(data: T[], keys: string[] = ['name', 'Name', 'title', 'vendorName', 'number', 'status', 'Status']): T[] {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  return useMemo(() => {
    if (!q) return data;
    return data.filter((row: any) => keys.some(k => String(row[k] ?? '').toLowerCase().includes(q)));
  }, [data, q, keys.join(',')]);
}

export function useCreateInitial(): boolean {
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => searchParams.get('new') === '1');
  return initial;
}

export type FetchFn = () => Promise<any>;

export function useFetch(fn: FetchFn) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fn().then((r) => {
      const arr = Array.isArray(r) ? r : r?.data || r?.items || [];
      setData(Array.isArray(arr) ? arr : []);
    }).catch(() => setData([])).finally(() => setLoading(false));
  }, [fn]);
  return { data, loading, setData };
}

export type Toast = { msg: string; type: 'success' | 'error' } | null;

export const ITEM_CATEGORIES = ['Other', 'Food & Beverage', 'Housekeeping', 'Engineering', 'Office Supplies', 'Linen & Laundry', 'Kitchen Equipment', 'SPA & Amenities'] as const;
export const ITEM_UNITS = ['PCS', 'KG', 'L', 'BOX', 'SET', 'M', 'PCS/KG', 'Other'] as const;
export const VENDOR_CATEGORIES = ['General', 'Food Supplier', 'Beverage', 'Housekeeping', 'Maintenance', 'Logistics', 'Services', 'Office Supplies'] as const;
export const VENDOR_PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Advance', 'COD'] as const;

export const PR_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  awaiting: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  processed: 'bg-blue-50 text-blue-800 border-blue-200',
  cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
  onhold: 'bg-purple-50 text-purple-800 border-purple-200',
};

export function PrStatusPill({ status }: { status: string }) {
  const label = status === 'awaiting' ? 'Awaiting Approval' : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${PR_STATUS_STYLE[status] || PR_STATUS_STYLE.draft}`}>
      {label}
    </span>
  );
}

export function prTotal(pr: any): number {
  return (pr.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.estimatedRate || 0) * (1 - (l.discount || 0) / 100), 0);
}

export type PrLineForm = { itemName: string; category: string; quantity: string; estimatedRate: string; discount: string; preferredVendor: string; description: string };

export const EMPTY_LINE: PrLineForm = { itemName: '', category: 'Other', quantity: '1', estimatedRate: '', discount: '', preferredVendor: '', description: '' };

export const PR_CATEGORIES = ['Other', 'Food & Beverage', 'Housekeeping', 'Engineering', 'Office Supplies', 'Linen & Laundry', 'Kitchen Equipment', 'SPA & Amenities'];

export const DOC_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  awaiting: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  issued: 'bg-blue-50 text-blue-800 border-blue-200',
  partially_received: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  received: 'bg-blue-50 text-blue-800 border-blue-200',
  partially_billed: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  billed: 'bg-violet-50 text-violet-800 border-violet-200',
  partially_processed: 'bg-amber-50 text-amber-800 border-amber-200',
  failed: 'bg-rose-50 text-rose-800 border-rose-200',
  open: 'bg-blue-50 text-blue-800 border-blue-200',
  partially_paid: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-blue-50 text-blue-800 border-blue-200',
  overdue: 'bg-rose-50 text-rose-800 border-rose-200',
  completed: 'bg-blue-50 text-blue-800 border-blue-200',
  processed: 'bg-blue-50 text-blue-800 border-blue-200',
  closed: 'bg-slate-200 text-slate-700 border-slate-300',
  void: 'bg-slate-100 text-slate-400 border-slate-200',
  cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
  consumed: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function DocStatusPill({ status }: { status: string }) {
  const label = status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${DOC_STATUS_STYLE[status] || DOC_STATUS_STYLE.draft}`}>
      {label}
    </span>
  );
}

export function docTotal(lines: any[], rateKey = 'rate'): number {
  return (lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l[rateKey] ?? l.estimatedRate ?? 0), 0);
}

export function useDocList(fetchFn: FetchFn) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true);
    fetchFn().then((r) => setData(Array.isArray(r) ? r : r?.data || [])).catch((e: any) => setError(e?.message || 'Failed to load')).finally(() => setLoading(false));
  };
  useEffect(load, [fetchFn]);
  return { data, setData, loading, error, setError, load };
}

export function ErrorBar({ error, clear }: { error: string; clear: () => void }) {
  if (!error) return null;
  return (
    <div className="rounded-lg px-4 py-3 text-sm font-medium border shadow-sm bg-rose-50 border-rose-200 text-rose-800" role="alert">
      <div className="flex items-center justify-between gap-3">
        <span>{error}</span>
        <button onClick={clear} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
      </div>
    </div>
  );
}
