import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getItems, createItem } from '../../../api';

function useCreateInitial(): boolean {
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => searchParams.get('new') === '1');
  return initial;
}

type FetchFn = () => Promise<any>;

function useFetch(fn: FetchFn) {
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

const ITEM_CATEGORIES = ['Other', 'Food & Beverage', 'Housekeeping', 'Engineering', 'Office Supplies', 'Linen & Laundry', 'Kitchen Equipment', 'SPA & Amenities'] as const;
const ITEM_UNITS = ['PCS', 'KG', 'L', 'BOX', 'SET', 'M', 'PCS/KG', 'Other'] as const;

type Toast = { msg: string; type: 'success' | 'error' } | null;

export function ItemsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const fetchItems = useMemo(() => () => getItems(), [reloadKey]);
  const { data, loading, setData } = useFetch(fetchItems);
  const [showCreate, setShowCreate] = useState(useCreateInitial());
  const [toast, setToast] = useState<Toast>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: 'Other' as string,
    unit: 'PCS' as string,
    costPrice: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<'name' | 'purchaseDescription' | 'purchaseRate' | 'usageUnit'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!moreOpen && !viewOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen, viewOpen]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) next.name = 'Name is required';
    else if (name.length > 50) next.name = 'Max 50 characters';
    if (form.sku.trim().length > 30) next.sku = 'SKU max 30 characters';
    if (form.costPrice !== '') {
      const n = Number(form.costPrice);
      if (Number.isNaN(n)) next.costPrice = 'Must be a number';
      else if (n < 0) next.costPrice = 'Must be ≥ 0';
    }
    if (form.description.length > 500) next.description = 'Max 500 characters';
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.values(next)[0];
      setToast({ msg: first, type: 'error' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        category: form.category,
        unit: form.unit,
        costPrice: form.costPrice === '' ? 0 : Number(form.costPrice),
        description: form.description.trim() || undefined,
      };
      const raw: any = await createItem(payload);
      const created = raw?.data ?? raw?.item ?? raw;
      const row = {
        id: created?.id || created?.ROWID || `tmp-${Date.now()}`,
        name: created?.name || created?.Name || payload.name,
        sku: created?.sku || created?.SKU || payload.sku,
        category: created?.category || created?.Category || payload.category,
        unit: created?.unit || created?.Unit || payload.unit,
        costPrice: created?.costPrice ?? created?.UnitPrice ?? payload.costPrice,
        description: created?.description || created?.Description || payload.description,
        status: created?.status || created?.Status || 'active',
        createdAt: created?.createdAt || new Date().toISOString(),
        _local: !created?.id && !created?.ROWID,
      };
      setData((d) => [row, ...d]);
      setToast({ msg: 'Item created', type: 'success' });
      setForm({ name: '', sku: '', category: 'Other', unit: 'PCS', costPrice: '', description: '' });
      setErrors({});
      setShowCreate(false);
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to create item', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSort = (key: 'name' | 'purchaseDescription' | 'purchaseRate' | 'usageUnit') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case 'name': aVal = (a.name || a.Name || '').toLowerCase(); bVal = (b.name || b.Name || '').toLowerCase(); break;
        case 'purchaseDescription': aVal = (a.description || a.Description || '').toLowerCase(); bVal = (b.description || b.Description || '').toLowerCase(); break;
        case 'purchaseRate': aVal = Number(a.costPrice ?? a.UnitPrice ?? 0); bVal = Number(b.costPrice ?? b.UnitPrice ?? 0); break;
        case 'usageUnit': aVal = (a.unit || a.Unit || '').toLowerCase(); bVal = (b.unit || b.Unit || '').toLowerCase(); break;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  const visibleData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedData;
    return sortedData.filter((r: any) =>
      `${r.name || r.Name || ''} ${r.sku || r.SKU || ''} ${r.description || r.Description || ''}`.toLowerCase().includes(q),
    );
  }, [sortedData, query]);

  return (
    <div className="flex flex-col h-full">
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium border shadow-sm ${
            toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
          role="alert"
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
          </div>
        </div>
      )}

      {/* Title band — Zoho flat style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3">
        <div className="relative" ref={viewRef}>
          <button onClick={() => setViewOpen((v) => !v)} className="flex items-center gap-1.5 text-[20px] font-bold text-[#07175A] leading-tight">
            All Items
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {viewOpen && (
            <div className="absolute left-0 top-full mt-1 w-52 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-30">
              <button onClick={() => setViewOpen(false)} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                All Items
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] flex items-center gap-1.5 shadow-sm"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            New
          </button>
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen((v) => !v)} className="w-9 h-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500" aria-label="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-30">
                <button onClick={() => { setReloadKey((k) => k + 1); setMoreOpen(false); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50">Refresh List</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Column header — single row, Zoho style */}
      <div className="px-1">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
          <div className="col-span-1 flex items-center gap-3">
            <span className="text-[#2084FA] flex items-center" title="Filters">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /><circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth={1.8} /><circle cx="10" cy="17" r="2" stroke="currentColor" strokeWidth={1.8} /></svg>
            </span>
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" aria-label="Select all" />
          </div>
          <button onClick={() => handleSort('name')} className="col-span-3 flex items-center gap-1 hover:text-slate-700 text-left group">
            Name
          </button>
          <button onClick={() => handleSort('purchaseDescription')} className="col-span-4 flex items-center gap-1 hover:text-slate-700 text-left group">
            Purchase Description
          </button>
          <button onClick={() => handleSort('purchaseRate')} className="col-span-2 flex items-center gap-1 hover:text-slate-700 text-left group">
            Purchase Rate
          </button>
          <button onClick={() => handleSort('usageUnit')} className="col-span-1 flex items-center gap-1 hover:text-slate-700 text-left group">
            Usage Unit
          </button>
          <div className="col-span-1 flex justify-end">
            <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search items">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="py-2">
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items"
              className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
            />
          </div>
        )}
      </div>

      {/* Rows — flat, Zoho list style */}
      <div className="flex-1 overflow-auto px-1">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading items…</div>
        ) : visibleData.length === 0 ? (
          <div className="py-16 text-center text-[15px] text-slate-500">{query ? 'No Records Found' : 'Goods and Services, if they have a price tag, put them here.'}</div>
        ) : (
          <div>
            {visibleData.slice(0, 20).map((row: any, i: number) => (
              <div key={row.id || row.ROWID || i} className="grid grid-cols-12 items-center gap-2 px-3 py-3 border-b border-slate-100 text-[13px] hover:bg-slate-50/60 transition-colors">
                <div className="col-span-1">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" aria-label={`Select ${row.name || row.Name || 'item'}`} />
                </div>
                <span className="col-span-3 font-medium text-slate-900 truncate">{row.name || row.Name || `Item ${i + 1}`}</span>
                <span className="col-span-4 text-slate-600 truncate">{row.description || row.Description || '—'}</span>
                <span className="col-span-2 text-slate-900 tabular-nums">
                  {row.costPrice != null || row.UnitPrice != null ? `LKR ${Number(row.costPrice ?? row.UnitPrice).toFixed(2)}` : '—'}
                </span>
                <span className="col-span-1 text-slate-600">{row.unit || row.Unit || '—'}</span>
                <span className="col-span-1" />
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-900">New Item</h3>
            <button type="button" onClick={() => { setShowCreate(false); setErrors({}); }} className="text-slate-400 hover:text-slate-600">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Arabica Coffee Beans"
                className={`mt-1 w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.name ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'}`}
              />
              {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">SKU</label>
              <input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="Optional"
                className={`mt-1 w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.sku ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'}`}
              />
              {errors.sku && <p className="text-xs text-rose-600 mt-1">{errors.sku}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Unit</label>
              <select
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {ITEM_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Cost Price</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                placeholder="0.00"
                className={`mt-1 w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.costPrice ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'}`}
              />
              {errors.costPrice && <p className="text-xs text-rose-600 mt-1">{errors.costPrice}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Purchase Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Optional details"
                className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none ${errors.description ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'}`}
              />
              {errors.description && <p className="text-xs text-rose-600 mt-1">{errors.description}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{form.description.length}/500</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setErrors({}); }}
              className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm min-w-[110px]"
            >
              {submitting ? 'Creating…' : 'Create Item'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}