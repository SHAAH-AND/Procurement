import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

function useQueryFilter<T>(data: T[], keys: string[] = ['name','Name','title','vendorName','number','status','Status']): T[] {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  return useMemo(() => {
    if (!q) return data;
    return data.filter((row: any) => keys.some(k => String(row[k] ?? '').toLowerCase().includes(q)));
  }, [data, q, keys.join(',')]);
}
import { getOrders, getItems, getVendors, createItem, createVendor, getMyPrs, getAllPrs, getPendingPrs, createPr, updatePr, prAction, getPos, createPoFromPr, poAction, getReceives, createReceiveFromPo, receiveAction, getBills, createBill, billAction, payBill, getBillMatch, getCredits, createCredit, applyCredit, getPayments, getRfqs, createRfq, rfqAction, getRfqCompare, portalView, portalQuote, awardFromBid, awardToPo, getRecurrences, createRecurrence, runRecurrence, disableRecurrence, getBatches, createBatch, batchAction, multiPay } from '../../api';

// Opens the inline create form when landing with ?new=1 (sidebar quick-add)
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
      // Catalyst wraps as {data: []} or plain []
      const arr = Array.isArray(r) ? r : r?.data || r?.items || [];
      setData(Array.isArray(arr) ? arr : []);
    }).catch(() => setData([])).finally(() => setLoading(false));
  }, [fn]);
  return { data, loading, setData };
}

function ListPage({ title, fetchFn, columns = ['Name', 'Status'], hint }: { title: string; fetchFn: FetchFn; columns?: string[]; hint?: string }) {
  const { data, loading, setData } = useFetch(fetchFn);
  const filtered = useQueryFilter(data);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Optimistic local create — proves flow before Stitch/DB persistence
    setData((d) => [{ id: `tmp-${Date.now()}`, name: name.trim(), status: 'Active', _local: true }, ...d]);
    setName('');
    setShowCreate(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{hint || `${filtered.length}${filtered.length !== data.length ? ` / ${data.length} filtered` : ''} records • connected to backend`}</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
          + New {title.replace(/s$/, '')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl bg-white border border-slate-200 p-4 flex gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${title.toLowerCase()} name`} className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          <button type="submit" className="px-4 h-9 rounded-lg bg-slate-900 text-white text-sm font-semibold">Create</button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-3 h-9 rounded-lg bg-slate-100 text-slate-600 text-sm">Cancel</button>
        </form>
      )}

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {columns.map((c) => <span key={c} className="flex-1">{c}</span>)}
          <span className="w-24 text-right">Action</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading {title.toLowerCase()}…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm font-medium text-slate-700">No {title.toLowerCase()} yet</div>
            <div className="text-xs text-slate-500 mt-1">Create one to see it here — this proves end-to-end (frontend → backend) works before you paste Stitch.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.slice(0, 20).map((row: any, i: number) => (
              <div key={row.id || row.ROWID || i} className="px-4 py-3 flex items-center gap-4 text-sm">
                <span className="flex-1 font-medium text-slate-900 truncate">{row.name || row.Name || row.title || row.vendorName || row.number || `Row ${i + 1}`}</span>
                <span className="flex-1 text-slate-500 truncate">{row.status || row.Status || row.state || '—'}</span>
                <span className="w-24 text-right"><button className="text-xs font-semibold text-blue-700 hover:underline">View</button></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        Stitch-ready: replace this table with your Stitch markup. Data is live via <code className="bg-white px-1 py-0.5 rounded border">src/api.ts</code>.
      </div>
    </div>
  );
}

// ── shared constants (hospitality-simple) ──
const ITEM_CATEGORIES = ['Other', 'Food & Beverage', 'Housekeeping', 'Engineering', 'Office Supplies', 'Linen & Laundry', 'Kitchen Equipment', 'SPA & Amenities'] as const;
const ITEM_UNITS = ['PCS', 'KG', 'L', 'BOX', 'SET', 'M', 'PCS/KG', 'Other'] as const;
const VENDOR_CATEGORIES = ['General', 'Food Supplier', 'Beverage', 'Housekeeping', 'Maintenance', 'Logistics', 'Services', 'Office Supplies'] as const;
const VENDOR_PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Advance', 'COD'] as const;

type Toast = { msg: string; type: 'success' | 'error' } | null;

// ── ItemsPage — real API create ──
export function ItemsPage() {
  const { data, loading, setData } = useFetch(getItems);
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
      // normalize for list display
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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Items</h2>
          <p className="text-sm text-slate-500 mt-1">{data.length} items • connected to backend</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
        >
          + New Item
        </button>
      </div>

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

      {showCreate && (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
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
              <label className="text-xs font-semibold text-slate-700">Description</label>
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
              onClick={() => {
                setShowCreate(false);
                setErrors({});
              }}
              className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm min-w-[110px]"
            >
              {submitting ? 'Creating…' : 'Create Item'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <span className="flex-[2]">Item</span>
          <span className="flex-1 hidden sm:block">Category</span>
          <span className="w-20 hidden sm:block">Unit</span>
          <span className="w-24 text-right">Cost</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading items…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm font-medium text-slate-700">No items yet</div>
            <div className="text-xs text-slate-500 mt-1">Create one to see it here — wired to POST /api/v1/items.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.slice(0, 20).map((row: any, i: number) => (
              <div key={row.id || row.ROWID || i} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="flex-[2] min-w-0">
                  <div className="font-medium text-slate-900 truncate">{row.name || row.Name || `Row ${i + 1}`}</div>
                  <div className="text-xs text-slate-500 truncate">{row.sku || row.SKU ? `SKU: ${row.sku || row.SKU}` : row.description || row.Description || ''}</div>
                </div>
                <span className="flex-1 hidden sm:block text-slate-600 truncate">{row.category || row.Category || '—'}</span>
                <span className="w-20 hidden sm:block text-slate-600">{row.unit || row.Unit || '—'}</span>
                <span className="w-24 text-right font-medium text-slate-900">
                  {row.costPrice != null || row.UnitPrice != null ? `LKR ${Number(row.costPrice ?? row.UnitPrice).toFixed(2)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        Stitch-ready: replace this table with your Stitch markup. Data is live via <code className="bg-white px-1 py-0.5 rounded border">src/api.ts</code>.
      </div>
    </div>
  );
}

// ── VendorsPage — real API create ──
export function VendorsPage() {
  const { data, loading, setData } = useFetch(getVendors);
  const [showCreate, setShowCreate] = useState(useCreateInitial());
  const [toast, setToast] = useState<Toast>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    category: 'General' as string,
    paymentTerms: 'Net 15' as string,
    address: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) next.name = 'Name is required';
    else if (name.length > 120) next.name = 'Max 120 characters';
    const email = form.email.trim();
    if (email) {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(email)) next.email = 'Invalid email format';
    }
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
        contactPerson: form.contactPerson.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        category: form.category,
        paymentTerms: form.paymentTerms,
        address: form.address.trim() || undefined,
      };
      const raw: any = await createVendor(payload);
      const created = raw?.data ?? raw?.vendor ?? raw;
      const row = {
        id: created?.id || created?.ROWID || `tmp-${Date.now()}`,
        name: created?.name || created?.Name || payload.name,
        contactPerson: created?.contactPerson || created?.ContactPerson || payload.contactPerson,
        email: created?.email || created?.Email || created?.ContactEmail || payload.email,
        phone: created?.phone || created?.Phone || payload.phone,
        category: created?.category || created?.Category || payload.category,
        paymentTerms: created?.paymentTerms || created?.PaymentTerms || payload.paymentTerms,
        address: created?.address || created?.Address || payload.address,
        status: created?.status || created?.Status || 'active',
        createdAt: created?.createdAt || new Date().toISOString(),
      };
      setData((d) => [row, ...d]);
      setToast({ msg: 'Vendor created', type: 'success' });
      setForm({ name: '', contactPerson: '', email: '', phone: '', category: 'General', paymentTerms: 'Net 15', address: '' });
      setErrors({});
      setShowCreate(false);
    } catch (err: any) {
      setToast({ msg: err?.message || 'Failed to create vendor', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Vendors</h2>
          <p className="text-sm text-slate-500 mt-1">{data.length} vendors • connected to backend</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm"
        >
          + New Vendor
        </button>
      </div>

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

      {showCreate && (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Vendor Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Serendib Suppliers"
                className={`mt-1 w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.name ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'}`}
              />
              {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Contact Person</label>
              <input
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="e.g. A. Perera"
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="vendor@example.com"
                className={`mt-1 w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.email ? 'border-rose-300 bg-rose-50/30' : 'border-slate-300'}`}
              />
              {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+94 7x xxx xxxx"
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Payment Terms</label>
              <select
                value={form.paymentTerms}
                onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {VENDOR_PAYMENT_TERMS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={2}
                placeholder="Street, city, district"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setErrors({});
              }}
              className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm min-w-[120px]"
            >
              {submitting ? 'Creating…' : 'Create Vendor'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <span className="flex-[2]">Vendor</span>
          <span className="flex-1 hidden sm:block">Contact</span>
          <span className="flex-1 hidden md:block">Payment</span>
          <span className="w-20 text-right">Status</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading vendors…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm font-medium text-slate-700">No vendors yet</div>
            <div className="text-xs text-slate-500 mt-1">Create one to see it here — wired to POST /api/v1/vendors.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.slice(0, 20).map((row: any, i: number) => (
              <div key={row.id || row.ROWID || i} className="px-4 py-3 flex items-center gap-3 text-sm">
                <div className="flex-[2] min-w-0">
                  <div className="font-medium text-slate-900 truncate">{row.name || row.Name || `Row ${i + 1}`}</div>
                  <div className="text-xs text-slate-500 truncate">{row.email || row.Email || row.ContactEmail || row.phone || row.Phone || row.category || row.Category || ''}</div>
                </div>
                <span className="flex-1 hidden sm:block text-slate-600 truncate">{row.contactPerson || row.ContactPerson || row.email || row.Email || '—'}</span>
                <span className="flex-1 hidden md:block text-slate-600 truncate">{row.paymentTerms || row.PaymentTerms || '—'}</span>
                <span className="w-20 text-right">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                    {row.status || row.Status || 'Active'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        Stitch-ready: replace this table with your Stitch markup. Data is live via <code className="bg-white px-1 py-0.5 rounded border">src/api.ts</code>.
      </div>
    </div>
  );
}

// ── RFQ + bidding + awards (ERPNext RFQ/SQ, OpenProcurement-lite) ──
export function RfqPage() {
  const { data, setData, loading, error, setError, load } = useDocList(getRfqs);
  const [prs, setPrs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selPr, setSelPr] = useState('');
  const [manItems, setManItems] = useState([{ itemName: '', quantity: '1' }]);
  const [invVendors, setInvVendors] = useState([{ vendorName: '', contactEmail: '' }]);
  const [dueDate, setDueDate] = useState('');
  const [message, setMessage] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [compare, setCompare] = useState<any>(null);
  const [awardBid, setAwardBid] = useState('');
  const [awardQty, setAwardQty] = useState<Record<string, string>>({});
  const [awardReason, setAwardReason] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getAllPrs().then((r: any) => setPrs(Array.isArray(r) ? r : [])).catch(() => {});
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const create = async () => {
    setActing(true);
    try {
      let items: any[] = [];
      let prId: string | undefined;
      if (selPr) {
        const pr = prs.find((p: any) => p.id === selPr);
        if (!pr) throw new Error('Pick a purchase request');
        prId = pr.id;
        items = (pr.lines || []).map((l: any) => ({ itemName: l.itemName, quantity: l.quantity, unit: 'PCS' }));
      } else {
        items = manItems.filter((l) => l.itemName.trim()).map((l) => ({ itemName: l.itemName.trim(), quantity: Number(l.quantity) || 1, unit: 'PCS' }));
      }
      if (!items.length) throw new Error('Add at least one item');
      const vs = invVendors.filter((v) => v.vendorName.trim());
      if (!vs.length) throw new Error('Invite at least one vendor');
      const created = await createRfq({
        prId, items,
        vendors: vs.map((v) => {
          const known = vendors.find((x: any) => (x.name || x.Name) === v.vendorName.trim());
          return { vendorId: known?.id, vendorName: v.vendorName.trim(), contactEmail: v.contactEmail.trim() || undefined };
        }),
        dueDate: dueDate || undefined, message: message.trim() || undefined,
      });
      setData((ds) => [created, ...ds]);
      setShowNew(false); setSelPr(''); setManItems([{ itemName: '', quantity: '1' }]);
      setInvVendors([{ vendorName: '', contactEmail: '' }]); setDueDate(''); setMessage('');
    } catch (e: any) { setError(e?.message || 'Failed to create RFQ'); } finally { setActing(false); }
  };

  const act = async (id: string, action: string) => {
    setActing(true);
    try {
      const updated = await rfqAction(id, action);
      setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const showCompare = async (id: string) => {
    try { setCompare(await getRfqCompare(id)); setAwardBid(''); setAwardQty({}); } catch (e: any) { setError(e?.message || 'Compare failed'); }
  };

  const award = async () => {
    const bidLines = Object.entries(awardQty).filter(([, q]) => Number(q) > 0).map(([bidLineId, q]) => ({ bidLineId, quantity: Number(q) }));
    if (!awardBid || !bidLines.length) { setError('Pick a bid and award quantities'); return; }
    setActing(true);
    try {
      await awardFromBid({ bidId: awardBid, lines: bidLines, reason: awardReason.trim() || undefined });
      const fresh: any = await getRfqs();
      setData(Array.isArray(fresh) ? fresh : []);
      setCompare(null); setAwardBid(''); setAwardQty({}); setAwardReason('');
      load();
    } catch (e: any) { setError(e?.message || 'Award failed'); } finally { setActing(false); }
  };

  const toPo = async (awardId: string) => {
    setActing(true);
    try {
      const pos: any = await awardToPo(awardId);
      setError('');
      alert(`Created ${(Array.isArray(pos) ? pos.length : 0)} purchase order(s) — see Purchase Orders.`);
    } catch (e: any) { setError(e?.message || 'PO conversion failed'); } finally { setActing(false); }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/rfq/${token}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    alert(`Vendor portal link copied:\n${url}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Request for Quotes</h2>
          <p className="text-sm text-slate-500 mt-1">Invite vendors, compare bids, award, convert to PO</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New RFQ</button>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div>
            <label className="text-xs font-semibold text-slate-700">From Purchase Request (optional)</label>
            <select value={selPr} onChange={(e) => setSelPr(e.target.value)} className={`${INPUT} mt-1 bg-white w-full`}>
              <option value="">Manual items…</option>
              {prs.filter((p: any) => ['approved', 'processed'].includes(p.status)).map((p: any) => <option key={p.id} value={p.id}>{p.prNumber} — {p.reason || `${p.lines?.length} lines`}</option>)}
            </select>
          </div>
          {!selPr && manItems.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input value={l.itemName} onChange={(e) => setManItems((ls) => ls.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} placeholder="Item *" className={`${INPUT} col-span-8`} />
              <input value={l.quantity} onChange={(e) => setManItems((ls) => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} type="number" min={0} placeholder="Qty" className={`${INPUT} col-span-4`} />
            </div>
          ))}
          {!selPr && <button onClick={() => setManItems((ls) => [...ls, { itemName: '', quantity: '1' }])} className="text-xs font-semibold text-blue-700 hover:underline">+ Add item</button>}
          <div className="text-xs font-semibold text-slate-700 pt-1">Invite vendors</div>
          {invVendors.map((v, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input value={v.vendorName} onChange={(e) => setInvVendors((ls) => ls.map((x, j) => j === i ? { ...x, vendorName: e.target.value } : x))} list="rfq-vendors" placeholder="Vendor *" className={`${INPUT} col-span-6`} />
              <input value={v.contactEmail} onChange={(e) => setInvVendors((ls) => ls.map((x, j) => j === i ? { ...x, contactEmail: e.target.value } : x))} placeholder="Contact email" className={`${INPUT} col-span-6`} />
            </div>
          ))}
          <datalist id="rfq-vendors">{vendors.map((v: any, i: number) => <option key={v.id || i} value={v.name || v.Name} />)}</datalist>
          <button onClick={() => setInvVendors((ls) => [...ls, { vendorName: '', contactEmail: '' }])} className="text-xs font-semibold text-blue-700 hover:underline">+ Add vendor</button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Bidding closes</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Message to vendors</label>
              <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Delivery terms, etc." className={`${INPUT} mt-1 w-full`} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Create RFQ</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No RFQs yet.</div>
          : data.map((rfq: any) => (
            <div key={rfq.id}>
              <button onClick={() => { setOpenId(openId === rfq.id ? null : rfq.id); setCompare(null); }} className="w-full px-4 py-3 flex items-center gap-4 text-sm rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)] hover:border-slate-300 text-left">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{rfq.rfqNumber}</span>
                <span className="flex-1 font-medium text-slate-700 truncate">{(rfq.lines || []).map((l: any) => l.itemName).join(', ')}</span>
                <span className="hidden sm:block text-slate-500 text-xs">{(rfq.bids || []).length} bids</span>
                <DocStatusPill status={rfq.status} />
              </button>
              {openId === rfq.id && (
                <div className="mt-2 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 text-xs text-slate-600">
                    Vendors: {(rfq.vendors || []).map((v: any) => (
                      <span key={v.id} className="inline-flex items-center gap-1 mr-3">
                        {v.vendorName} ({v.quoteStatus})
                        {v.inviteToken && <button onClick={() => copyLink(v.inviteToken)} className="font-semibold text-blue-700 hover:underline">Copy portal link</button>}
                      </span>
                    ))}
                  </div>
                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex gap-2 flex-wrap">
                    {rfq.status === 'draft' && <button onClick={() => act(rfq.id, 'submit')} disabled={acting} className={BTN_P}>Publish & Invite</button>}
                    {['submitted', 'awarded_partial'].includes(rfq.status) && <button onClick={() => showCompare(rfq.id)} disabled={acting} className={BTN_S}>Compare Bids</button>}
                    {!['awarded', 'cancelled'].includes(rfq.status) && <button onClick={() => { if (window.confirm(`Cancel ${rfq.rfqNumber}?`)) act(rfq.id, 'cancel'); }} disabled={acting} className="px-4 h-9 text-sm text-slate-500 hover:text-rose-600">Cancel</button>}
                  </div>
                  {compare?.rfqId === rfq.id && (
                    <div className="px-5 py-4 space-y-4">
                      {compare.matrix.map((m: any) => (
                        <div key={m.rfqLineId} className="text-sm">
                          <div className="font-semibold text-slate-900">{m.itemName} × {m.quantity} <span className="text-slate-400 font-normal">(open {m.openQty})</span></div>
                          {m.quotes.length === 0 ? <div className="text-xs text-slate-400 mt-1">No bids yet.</div> :
                            <div className="mt-1 divide-y divide-slate-100">
                              {m.quotes.map((q: any) => (
                                <div key={q.bidLineId} className="py-1.5 flex items-center gap-3 text-xs">
                                  <input type="radio" name={`bid-${m.rfqLineId}`} checked={awardBid === q.bidId} onChange={() => setAwardBid(q.bidId)} title="Award this bid" />
                                  <span className="flex-1 text-slate-700">{q.vendorName} — LKR {Number(q.unitPrice).toFixed(2)} {q.leadDays != null ? `· ${q.leadDays}d lead` : ''}</span>
                                  {q.isBest && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">BEST</span>}
                                  <input value={awardQty[q.bidLineId] || ''} onChange={(e) => setAwardQty((a) => ({ ...a, [q.bidLineId]: e.target.value }))} type="number" min={0} max={m.openQty} placeholder="Award qty" className="h-7 w-24 px-2 rounded border border-slate-300 text-xs" />
                                </div>
                              ))}
                            </div>}
                        </div>
                      ))}
                      <div className="flex gap-2 items-center flex-wrap">
                        <input value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder="Award reason (optional)" className={`${INPUT} flex-1 min-w-40`} />
                        <button onClick={() => award()} disabled={acting} className={BTN_P}>Award Selected</button>
                      </div>
                    </div>
                  )}
                  {(rfq.awards || []).length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 text-xs space-y-1">
                      {(rfq.awards || []).map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3">
                          <DocStatusPill status={a.status} />
                          <span className="text-slate-600">{(a.lines || []).length} line(s) {a.reason ? `· ${a.reason}` : ''}</span>
                          {a.status === 'active' && <button onClick={() => toPo(a.id)} disabled={acting} className="font-semibold text-blue-700 hover:underline">Convert to PO</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Public vendor portal (magic link, no login) ──
export function PortalRfqPage() {
  const { token } = useParams();
  const [rfq, setRfq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lead, setLead] = useState<Record<string, string>>({});
  const [validTill, setValidTill] = useState('');
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    portalView(token).then(setRfq).catch((e: any) => setError(e?.message || 'Invalid link')).finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!token) return;
    const lines = Object.entries(prices).filter(([, p]) => Number(p) >= 0 && p !== '').map(([rfqLineId, p]) => ({
      rfqLineId, quantity: Number((rfq.lines as any[]).find((l) => l.rfqLineId === rfqLineId)?.quantity || 0),
      unitPrice: Number(p), leadDays: lead[rfqLineId] ? Number(lead[rfqLineId]) : undefined,
    }));
    if (!lines.length) { setError('Enter at least one price'); return; }
    setSending(true);
    try {
      await portalQuote(token, { lines, validTill: validTill || undefined });
      setDone(true);
    } catch (e: any) { setError(e?.message || 'Submit failed'); } finally { setSending(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (error && !rfq) return <div className="min-h-screen flex items-center justify-center text-sm text-rose-700">{error}</div>;

  return (
    <div className="min-h-screen bg-[#E7EDF9] px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pf-pattern-bg opacity-70 pointer-events-none select-none" aria-hidden="true" />
      <div className="max-w-2xl mx-auto relative z-10">
        <div className="flex justify-center mb-5">
          <img src="/img/procureflow-logo-full.png" alt="ProcureFlow — Smarter Procurement. Simplified." className="h-12 w-auto object-contain" />
        </div>
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#2084FA] to-[#7F3EDD]" />
          <div className="p-6 space-y-4">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendor Quotation</div>
          <h1 className="text-lg font-bold text-slate-900 mt-1">{rfq.rfqNumber}</h1>
          <p className="text-sm text-slate-500">Hello {rfq.vendorName} — submit your best prices below.</p>
        </div>
        {rfq.message && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{rfq.message}</div>}
        {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
        {done ? (
          <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-4 font-medium">Quotation submitted. We will notify you of the outcome.</div>
        ) : (
          <>
            {(rfq.lines || []).map((l: any) => (
              <div key={l.rfqLineId} className="grid grid-cols-12 gap-2 items-center text-sm">
                <span className="col-span-5 font-medium text-slate-900">{l.itemName} <span className="text-slate-400">× {l.quantity}</span></span>
                <input value={prices[l.rfqLineId] || ''} onChange={(e) => setPrices((p) => ({ ...p, [l.rfqLineId]: e.target.value }))} type="number" min={0} step="0.01" placeholder="Unit price" className={`${INPUT} col-span-4`} />
                <input value={lead[l.rfqLineId] || ''} onChange={(e) => setLead((p) => ({ ...p, [l.rfqLineId]: e.target.value }))} type="number" min={0} placeholder="Lead days" className={`${INPUT} col-span-3`} />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold text-slate-700">Quote valid till</label>
              <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
            <button onClick={submit} disabled={sending} className="w-full py-3 rounded-xl bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">Submit Quotation</button>
          </>
        )}
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-400">
            Secured by ProcureFlow · Smarter Procurement. Simplified.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Procure-to-pay pages (ERPNext-aligned: PO → Receive → Bill → Payment) ──

const DOC_STATUS_STYLE: Record<string, string> = {
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

function DocStatusPill({ status }: { status: string }) {
  const label = status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap ${DOC_STATUS_STYLE[status] || DOC_STATUS_STYLE.draft}`}>
      {label}
    </span>
  );
}

function docTotal(lines: any[], rateKey = 'rate'): number {
  return (lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l[rateKey] ?? l.estimatedRate ?? 0), 0);
}

function useDocList(fetchFn: FetchFn) {
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

function ErrorBar({ error, clear }: { error: string; clear: () => void }) {
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

const BTN = 'px-4 h-9 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60';
const BTN_P = `${BTN} bg-[#2084FA] text-white hover:bg-blue-700`;
const BTN_S = `${BTN} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`;
const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

// ── Purchase Orders ──
export function PoPage() {
  const { data, setData, loading, error, setError, load } = useDocList(getPos);
  const [vendors, setVendors] = useState<any[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [showFromPr, setShowFromPr] = useState(false);
  const [selPr, setSelPr] = useState('');
  const [selLines, setSelLines] = useState<string[]>([]);
  const [vendor, setVendor] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
    getAllPrs().then((r: any) => setPrs((Array.isArray(r) ? r : []).filter((p: any) => p.status === 'approved'))).catch(() => {});
  }, []);

  const act = async (id: string, action: string) => {
    setActing(true);
    try {
      const updated = await poAction(id, action);
      setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const createFromPr = async () => {
    if (!selPr) return;
    setActing(true);
    try {
      const v = vendors.find((x: any) => (x.name || x.Name) === vendor);
      const created = await createPoFromPr({ prId: selPr, lineIds: selLines, vendorId: v?.id, vendorName: vendor || undefined });
      setData((ds) => [created, ...ds]);
      setShowFromPr(false); setSelPr(''); setSelLines([]); setVendor('');
      load();
    } catch (e: any) { setError(e?.message || 'Failed to create PO'); } finally { setActing(false); }
  };

  const prLines = prs.find((p: any) => p.id === selPr)?.lines || [];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Purchase Orders</h2>
          <p className="text-sm text-slate-500 mt-1">{data.length} orders · convert approved PRs, issue to vendors</p>
        </div>
        <button onClick={() => setShowFromPr((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ From Approved PR</button>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      {showFromPr && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Approved PR</label>
              <select value={selPr} onChange={(e) => { setSelPr(e.target.value); setSelLines([]); }} className={`${INPUT} mt-1 bg-white w-full`}>
                <option value="">Select…</option>
                {prs.map((p: any) => <option key={p.id} value={p.id}>{p.prNumber} — {p.reason || `${p.lines?.length} lines`}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Vendor</label>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} list="po-vendors" placeholder="Vendor to issue to" className={`${INPUT} mt-1 w-full`} />
              <datalist id="po-vendors">{vendors.map((v: any, i: number) => <option key={v.id || i} value={v.name || v.Name} />)}</datalist>
            </div>
          </div>
          {prLines.length > 0 && (
            <div className="space-y-1">
              {prLines.map((l: any) => (
                <label key={l.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={selLines.includes(l.id)} onChange={(e) => setSelLines((s) => e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id))} className="w-4 h-4" />
                  {l.itemName} × {l.quantity} @ LKR {Number(l.estimatedRate || 0).toFixed(2)}
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowFromPr(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={createFromPr} disabled={acting || !selPr} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Create PO</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No purchase orders yet — convert an approved PR.</div>
          : data.map((po: any) => (
            <div key={po.id}>
              <button onClick={() => setOpenId(openId === po.id ? null : po.id)} className="w-full px-4 py-3 flex items-center gap-4 text-sm rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)] hover:border-slate-300 text-left">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{po.poNumber}</span>
                <span className="flex-1 font-medium text-slate-700 truncate">{po.vendorName || 'No vendor'}</span>
                <span className="hidden sm:block text-slate-500 w-24 text-right">LKR {docTotal(po.lines).toFixed(2)}</span>
                <DocStatusPill status={po.status} />
              </button>
              {openId === po.id && (
                <div className="mt-2 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {(po.lines || []).map((l: any) => (
                      <div key={l.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                        <div className="flex-[2] min-w-0">
                          <div className="font-medium text-slate-900 truncate">{l.itemName}</div>
                          <div className="text-xs text-slate-500">Recv {l.receivedQty || 0}/{l.quantity} · Billed {l.billedQty || 0}/{l.quantity}</div>
                        </div>
                        <span className="w-16 text-right text-slate-600">× {l.quantity}</span>
                        <span className="w-28 text-right font-medium text-slate-900">LKR {(l.quantity * l.rate).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap">
                    {po.status === 'draft' && <button onClick={() => act(po.id, 'submit')} disabled={acting} className={BTN_P}>Submit</button>}
                    {po.status === 'pending' && <button onClick={() => act(po.id, 'approve')} disabled={acting} className={BTN_P}>Approve</button>}
                    {['approved', 'draft'].includes(po.status) && <button onClick={() => act(po.id, 'issue')} disabled={acting} className={BTN_P}>Issue to Vendor</button>}
                    {!['cancelled', 'closed', 'billed'].includes(po.status) && <button onClick={() => act(po.id, 'close')} disabled={acting} className={BTN_S}>Close</button>}
                    {!['billed', 'closed', 'cancelled'].includes(po.status) && <button onClick={() => { if (window.confirm(`Cancel ${po.poNumber}?`)) act(po.id, 'cancel'); }} disabled={acting} className="px-4 h-9 text-sm text-slate-500 hover:text-rose-600">Cancel</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Purchase Receives ──
export function ReceivesPage() {
  const { data, setData, loading, error, setError } = useDocList(getReceives);
  const [pos, setPos] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selPo, setSelPo] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getPos().then((r: any) => setPos(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const po = pos.find((p: any) => p.id === selPo);
  const create = async () => {
    const lines = Object.entries(qtys).filter(([, q]) => Number(q) > 0).map(([poLineId, q]) => ({ poLineId, quantity: Number(q) }));
    if (!selPo || !lines.length) { setError('Pick a PO and enter received quantities'); return; }
    setActing(true);
    try {
      const created = await createReceiveFromPo({ poId: selPo, lines });
      setData((ds) => [created, ...ds]);
      setShowNew(false); setSelPo(''); setQtys({});
    } catch (e: any) { setError(e?.message || 'Failed to create receive'); } finally { setActing(false); }
  };

  const act = async (id: string, action: string) => {
    setActing(true);
    try {
      const updated = await receiveAction(id, action);
      setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Purchase Receives</h2>
          <p className="text-sm text-slate-500 mt-1">GRNs recorded against issued orders</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Receive</button>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div>
            <label className="text-xs font-semibold text-slate-700">Purchase Order</label>
            <select value={selPo} onChange={(e) => { setSelPo(e.target.value); setQtys({}); }} className={`${INPUT} mt-1 bg-white w-full`}>
              <option value="">Select…</option>
              {pos.filter((p: any) => ['issued', 'approved', 'partially_received', 'partially_billed'].includes(p.status)).map((p: any) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendorName}</option>)}
            </select>
          </div>
          {(po?.lines || []).map((l: any) => {
            const remaining = (l.quantity || 0) - (l.receivedQty || 0);
            return (
              <div key={l.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-slate-700 truncate">{l.itemName} <span className="text-slate-400">(open: {remaining})</span></span>
                <input type="number" min={0} max={remaining} step="any" value={qtys[l.id] || ''} onChange={(e) => setQtys((q) => ({ ...q, [l.id]: e.target.value }))} placeholder="0" className={`${INPUT} w-24`} />
              </div>
            );
          })}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Save Draft GRN</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No receives yet.</div>
          : data.map((r: any) => (
            <div key={r.id} className="px-4 py-3 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{r.grnNumber}</span>
                <span className="flex-1 text-slate-700 truncate">{(r.lines || []).map((l: any) => `${l.itemName} ×${l.quantity}`).join(', ')}</span>
                <DocStatusPill status={r.status} />
                {r.status === 'draft' && (
                  <>
                    <button onClick={() => act(r.id, 'complete')} disabled={acting} className="text-xs font-semibold text-blue-700 hover:underline">Complete</button>
                    <button onClick={() => act(r.id, 'cancel')} disabled={acting} className="text-xs text-slate-400 hover:text-rose-600">Cancel</button>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1">PO {r.po?.poNumber || ''} · {new Date(r.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Bills ──
export function BillsPage() {
  const { data, setData, loading, error, setError } = useDocList(getBills);
  const [pos, setPos] = useState<any[]>([]);
  const [receives, setReceives] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [mode, setMode] = useState<'po' | 'receive' | 'manual'>('po');
  const [showNew, setShowNew] = useState(false);
  const [selDoc, setSelDoc] = useState('');
  const [vendor, setVendor] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [manLines, setManLines] = useState([{ itemName: '', quantity: '1', rate: '' }]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [match, setMatch] = useState<any>(null);
  const [payAmt, setPayAmt] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getPos().then((r: any) => setPos(Array.isArray(r) ? r : [])).catch(() => {});
    getReceives().then((r: any) => setReceives(Array.isArray(r) ? r : [])).catch(() => {});
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const create = async () => {
    setActing(true);
    try {
      let payload: any = { dueDate: dueDate || undefined };
      if (mode === 'po') { if (!selDoc) throw new Error('Pick a purchase order'); payload.poId = selDoc; }
      else if (mode === 'receive') { if (!selDoc) throw new Error('Pick a receive'); payload.receiveId = selDoc; }
      else {
        if (!vendor.trim()) throw new Error('Vendor is required');
        const lines = manLines.filter((l) => l.itemName.trim());
        if (!lines.length) throw new Error('Add at least one line');
        payload = { ...payload, vendorName: vendor.trim(), lines: lines.map((l) => ({ itemName: l.itemName.trim(), quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0 })) };
      }
      const created = await createBill(payload);
      setData((ds) => [created, ...ds]);
      setShowNew(false); setSelDoc(''); setVendor(''); setDueDate(''); setManLines([{ itemName: '', quantity: '1', rate: '' }]);
    } catch (e: any) { setError(e?.message || 'Failed to create bill'); } finally { setActing(false); }
  };

  const act = async (id: string, action: string) => {
    setActing(true);
    try {
      const updated = await billAction(id, action);
      setData((ds) => ds.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const pay = async (id: string) => {
    if (!(Number(payAmt) > 0)) { setError('Enter an amount'); return; }
    setActing(true);
    try {
      const res: any = await payBill(id, { amount: Number(payAmt) });
      setData((ds) => ds.map((d) => (d.id === id ? { ...d, ...res.bill } : d)));
      setPayAmt('');
      if (res.excess > 0) setError('');
    } catch (e: any) { setError(e?.message || 'Payment failed'); } finally { setActing(false); }
  };

  const showMatch = async (id: string) => {
    try { setMatch(await getBillMatch(id)); } catch (e: any) { setError(e?.message || 'Match check failed'); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bills</h2>
          <p className="text-sm text-slate-500 mt-1">Vendor bills with 3-way matching and payments</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Bill</button>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="flex gap-2 text-sm">
            {(['po', 'receive', 'manual'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setSelDoc(''); }} className={`px-3 h-8 rounded-lg font-medium ${mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {m === 'po' ? 'From PO' : m === 'receive' ? 'From Receive' : 'Manual'}
              </button>
            ))}
          </div>
          {mode === 'po' && (
            <select value={selDoc} onChange={(e) => setSelDoc(e.target.value)} className={`${INPUT} bg-white w-full`}>
              <option value="">Select PO…</option>
              {pos.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendorName} ({p.status})</option>)}
            </select>
          )}
          {mode === 'receive' && (
            <select value={selDoc} onChange={(e) => setSelDoc(e.target.value)} className={`${INPUT} bg-white w-full`}>
              <option value="">Select receive…</option>
              {receives.filter((r: any) => r.status === 'completed').map((r: any) => <option key={r.id} value={r.id}>{r.grnNumber} — PO {r.po?.poNumber}</option>)}
            </select>
          )}
          {mode === 'manual' && (
            <>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} list="bill-vendors" placeholder="Vendor *" className={`${INPUT} w-full`} />
              <datalist id="bill-vendors">{vendors.map((v: any, i: number) => <option key={v.id || i} value={v.name || v.Name} />)}</datalist>
              {manLines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input value={l.itemName} onChange={(e) => setManLines((ls) => ls.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} placeholder="Item *" className={`${INPUT} col-span-6`} />
                  <input value={l.quantity} onChange={(e) => setManLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} type="number" min={0} placeholder="Qty" className={`${INPUT} col-span-3`} />
                  <input value={l.rate} onChange={(e) => setManLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} type="number" min={0} placeholder="Rate" className={`${INPUT} col-span-3`} />
                </div>
              ))}
              <button onClick={() => setManLines((ls) => [...ls, { itemName: '', quantity: '1', rate: '' }])} className="text-xs font-semibold text-blue-700 hover:underline">+ Add line</button>
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-700">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${INPUT} mt-1 w-full`} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Create Bill</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No bills yet — create one from a PO or receive.</div>
          : data.map((b: any) => (
            <div key={b.id}>
              <button onClick={() => { setOpenId(openId === b.id ? null : b.id); setMatch(null); }} className="w-full px-4 py-3 flex items-center gap-4 text-sm rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)] hover:border-slate-300 text-left">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{b.billNumber}</span>
                <span className="flex-1 font-medium text-slate-700 truncate">{b.vendorName}</span>
                <span className="hidden sm:block text-slate-500 w-28 text-right">Bal LKR {Number(b.balance ?? 0).toFixed(2)}</span>
                <DocStatusPill status={b.status} />
              </button>
              {openId === b.id && (
                <div className="mt-2 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {(b.lines || []).map((l: any) => (
                      <div key={l.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                        <span className="flex-[2] font-medium text-slate-900 truncate">{l.itemName}</span>
                        <span className="w-16 text-right text-slate-600">× {l.quantity}</span>
                        <span className="w-28 text-right font-medium text-slate-900">LKR {(l.quantity * l.rate).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex gap-4 flex-wrap">
                    <span>PO: <strong>{b.poId ? b.poId.slice(0, 8) : '—'}</strong></span>
                    <span>Due: <strong>{b.dueDate ? String(b.dueDate).slice(0, 10) : '—'}</strong></span>
                    <span>Paid: <strong>LKR {Number(b.amountPaid || 0).toFixed(2)}</strong></span>
                    <button onClick={() => showMatch(b.id)} className="font-semibold text-blue-700 hover:underline">Check 3-way match</button>
                  </div>
                  {match?.billId === b.id && (
                    <div className="px-5 py-3 border-t border-slate-100 text-xs">
                      <div className="font-bold text-slate-900 mb-2">Match: {match.matchPct}%</div>
                      {match.lines.map((l: any, i: number) => (
                        <div key={i} className="flex justify-between py-1 border-b border-slate-50 last:border-0">
                          <span className="text-slate-700">{l.itemName}</span>
                          <span className={l.matched ? 'text-blue-700 font-semibold' : l.matched === null ? 'text-slate-400' : 'text-rose-700 font-semibold'}>{l.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap items-center">
                    {b.status === 'draft' && <button onClick={() => act(b.id, 'submit')} disabled={acting} className={BTN_P}>Submit</button>}
                    {b.status === 'pending' && <button onClick={() => act(b.id, 'approve')} disabled={acting} className={BTN_P}>Approve</button>}
                    {['draft', 'open'].includes(b.status) && <button onClick={() => { if (window.confirm(`Void ${b.billNumber}?`)) act(b.id, 'void'); }} disabled={acting} className="px-4 h-9 text-sm text-slate-500 hover:text-rose-600">Void</button>}
                    {['open', 'overdue', 'partially_paid'].includes(b.status) && (
                      <span className="flex items-center gap-2 ml-auto">
                        <input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} type="number" min={0} step="0.01" placeholder="Amount" className={`${INPUT} w-32`} />
                        <button onClick={() => pay(b.id)} disabled={acting} className={BTN_P}>Record Payment</button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Payments + Credits ──
export function PaymentsPage() {
  const { data: payments, loading, error, setError } = useDocList(getPayments);
  const [credits, setCredits] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [vName, setVName] = useState('');
  const [vAmt, setVAmt] = useState('');
  const [acting, setActing] = useState(false);
  const [applyFor, setApplyFor] = useState<string | null>(null);
  const [applyBill, setApplyBill] = useState('');
  const [applyAmt, setApplyAmt] = useState('');
  const [multiAmts, setMultiAmts] = useState<Record<string, string>>({});
  const [multiMethod, setMultiMethod] = useState('');
  const [showMulti, setShowMulti] = useState(false);

  useEffect(() => {
    getCredits().then((r: any) => setCredits(Array.isArray(r) ? r : [])).catch(() => {});
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const recordCredit = async () => {
    if (!vName.trim() || !(Number(vAmt) > 0)) { setError('Vendor + amount required'); return; }
    setActing(true);
    try {
      const c = await createCredit({ vendorName: vName.trim(), amount: Number(vAmt), source: 'return' });
      setCredits((cs) => [c, ...cs]);
      setVName(''); setVAmt('');
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  const apply = async (id: string) => {
    if (!applyBill || !(Number(applyAmt) > 0)) { setError('Pick a bill + amount'); return; }
    setActing(true);
    try {
      await applyCredit(id, { billId: applyBill, amount: Number(applyAmt) });
      const fresh: any = await getCredits();
      setCredits(Array.isArray(fresh) ? fresh : []);
      setApplyFor(null); setApplyBill(''); setApplyAmt('');
    } catch (e: any) { setError(e?.message || 'Apply failed'); } finally { setActing(false); }
  };

  const openBills = bills.filter((b: any) => ['open', 'overdue', 'partially_paid'].includes(b.status));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Payments Made</h2>
        <p className="text-sm text-slate-500 mt-1">Every recorded payment, plus vendor credits</p>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <button onClick={() => setShowMulti((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-900">
          Pay multiple bills (one tender, split across bills)
          <span className="text-blue-700">{showMulti ? '−' : '+'}</span>
        </button>
        {showMulti && (
          <div className="p-4 border-t border-slate-100 space-y-2">
            <div className="flex gap-2">
              <input value={multiMethod} onChange={(e) => setMultiMethod(e.target.value)} placeholder="Method (Bank transfer, Cash…)" className={`${INPUT} flex-1`} />
            </div>
            {openBills.length === 0 ? <div className="text-xs text-slate-400">No open bills.</div> :
              openBills.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-slate-700 truncate">{b.billNumber} — {b.vendorName} <span className="text-slate-400">(bal LKR {Number(b.balance ?? 0).toFixed(2)})</span></span>
                  <input value={multiAmts[b.id] || ''} onChange={(e) => setMultiAmts((a) => ({ ...a, [b.id]: e.target.value }))} type="number" min={0} placeholder="0" className={`${INPUT} w-28`} />
                </div>
              ))}
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  const lines = Object.entries(multiAmts).filter(([, a]) => Number(a) > 0).map(([billId, a]) => ({ billId, amount: Number(a) }));
                  if (!lines.length) { setError('Enter amounts'); return; }
                  setActing(true);
                  try {
                    await multiPay({ method: multiMethod.trim() || undefined, lines });
                    setMultiAmts({}); setMultiMethod(''); setShowMulti(false);
                  } catch (e: any) { setError(e?.message || 'Multi-pay failed'); } finally { setActing(false); }
                }}
                disabled={acting}
                className={BTN_P}
              >
                Pay Selected
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor Credits</div>
        <div className="p-4 flex gap-2 flex-wrap items-center border-b border-slate-100">
          <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Vendor" className={`${INPUT} w-44`} />
          <input value={vAmt} onChange={(e) => setVAmt(e.target.value)} type="number" min={0} placeholder="Amount" className={`${INPUT} w-32`} />
          <button onClick={recordCredit} disabled={acting} className={BTN_S}>+ Return / Advance</button>
        </div>
        <div className="divide-y divide-slate-100">
          {credits.length === 0 ? <div className="p-4 text-sm text-slate-400">No credits.</div> :
            credits.map((c: any) => (
              <div key={c.id} className="px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-medium text-slate-900">{c.vendorName} <span className="text-slate-400 font-normal">· {c.source}</span></span>
                  <span className="text-slate-600">LKR {Number(c.remaining).toFixed(2)} / {Number(c.amount).toFixed(2)}</span>
                  <DocStatusPill status={c.status} />
                  {c.status === 'open' && <button onClick={() => setApplyFor(applyFor === c.id ? null : c.id)} className="text-xs font-semibold text-blue-700 hover:underline">Apply</button>}
                </div>
                {applyFor === c.id && (
                  <div className="flex gap-2 mt-2">
                    <select value={applyBill} onChange={(e) => setApplyBill(e.target.value)} className={`${INPUT} bg-white flex-1`}>
                      <option value="">Pick bill…</option>
                      {openBills.filter((b: any) => b.vendorName === c.vendorName).map((b: any) => <option key={b.id} value={b.id}>{b.billNumber} — bal LKR {Number(b.balance ?? 0).toFixed(2)}</option>)}
                    </select>
                    <input value={applyAmt} onChange={(e) => setApplyAmt(e.target.value)} type="number" min={0} placeholder="Amt" className={`${INPUT} w-28`} />
                    <button onClick={() => apply(c.id)} disabled={acting} className={BTN_P}>Apply</button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment History</div>
        {loading ? <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
          : payments.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No payments recorded yet — pay from a bill.</div>
          : <div className="divide-y divide-slate-100">
            {payments.slice(0, 30).map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="flex-1 font-medium text-slate-900 truncate">{p.vendorName} <span className="text-slate-400 font-normal">· {p.method || '—'} {p.reference ? `· ${p.reference}` : ''}</span></span>
                <span className="text-slate-500 text-xs">{new Date(p.paidAt || p.createdAt).toLocaleDateString()}</span>
                <span className="w-28 text-right font-bold text-slate-900">LKR {Number(p.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>}
      </div>
    </div>
  );
}
// ── Recurring bills (ERPNext auto_repeat-lite) ──
export function RecurringBillsPage() {
  const { data, setData, loading, error, setError } = useDocList(getRecurrences);
  const [bills, setBills] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [tpl, setTpl] = useState('');
  const [profile, setProfile] = useState('');
  const [freq, setFreq] = useState('monthly');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!tpl || !profile.trim()) { setError('Pick a template bill + profile name'); return; }
    setActing(true);
    try {
      const rec = await createRecurrence({ templateBillId: tpl, profileName: profile.trim(), frequency: freq, startDate: start || undefined, endDate: end || undefined });
      setData((ds) => [rec, ...ds]);
      setShowNew(false); setTpl(''); setProfile(''); setStart(''); setEnd('');
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  const run = async (id: string, action: 'run' | 'disable') => {
    setActing(true);
    try {
      const fn = action === 'run' ? runRecurrence : disableRecurrence;
      const updated = await fn(id);
      if (updated?.id) setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
      else {
        const fresh: any = await getRecurrences();
        setData(Array.isArray(fresh) ? fresh : []);
      }
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Recurring Bills</h2>
          <p className="text-sm text-slate-500 mt-1">Automate regular vendor spend — child bills generate on schedule</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Profile</button>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Profile name *" className={`${INPUT} w-full`} />
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={`${INPUT} bg-white w-full`}>
            <option value="">Template bill…</option>
            {bills.map((b: any) => <option key={b.id} value={b.id}>{b.billNumber} — {b.vendorName}</option>)}
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Repeat every</label>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className={`${INPUT} mt-1 bg-white w-full`}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Starts on</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Ends on (blank = never)</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Save Profile</button>
          </div>
        </div>
      )}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden divide-y divide-slate-100">
        {loading ? <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
          : data.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No recurring profiles yet.</div>
          : data.map((r: any) => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm flex-wrap">
              <span className="flex-1 font-medium text-slate-900 min-w-32">{r.profileName} <span className="text-slate-400 font-normal">· {r.frequency} · next {String(r.nextRunDate).slice(0, 10)}</span></span>
              <DocStatusPill status={r.status} />
              {r.status === 'active' && <button onClick={() => run(r.id, 'run')} disabled={acting} className="text-xs font-semibold text-blue-700 hover:underline">Generate due bill</button>}
              {r.status === 'active' && <button onClick={() => run(r.id, 'disable')} disabled={acting} className="text-xs text-slate-400 hover:text-rose-600">Disable</button>}
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Batch payments (multi-vendor, export + process) ──
export function BatchPaymentsPage() {
  const { data, setData, loading, error, setError } = useDocList(getBatches);
  const [bills, setBills] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [paidThrough, setPaidThrough] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const openBills = bills.filter((b: any) => ['open', 'overdue', 'partially_paid'].includes(b.status));

  const create = async () => {
    const lines = Object.entries(amounts).filter(([, a]) => Number(a) > 0).map(([billId, a]) => ({ billId, amount: Number(a) }));
    if (!lines.length) { setError('Enter amounts for at least one bill'); return; }
    setActing(true);
    try {
      const batch = await createBatch({ batchName: name.trim() || undefined, paidThrough: paidThrough.trim() || undefined, lines });
      setData((ds) => [batch, ...ds]);
      setShowNew(false); setName(''); setPaidThrough(''); setAmounts({});
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  const act = async (id: string, action: string) => {
    setActing(true);
    try {
      const updated = await batchAction(id, action);
      setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Batch Payments</h2>
          <p className="text-sm text-slate-500 mt-1">Pay multiple vendors in one run, then mark processed</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Batch</button>
      </div>
      <ErrorBar error={error} clear={() => setError('')} />
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Batch name" className={INPUT} />
            <input value={paidThrough} onChange={(e) => setPaidThrough(e.target.value)} placeholder="Paid through (bank)" className={INPUT} />
          </div>
          {openBills.map((b: any) => (
            <div key={b.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 text-slate-700 truncate">{b.billNumber} — {b.vendorName} <span className="text-slate-400">(bal LKR {Number(b.balance ?? 0).toFixed(2)})</span></span>
              <input value={amounts[b.id] || ''} onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: e.target.value }))} type="number" min={0} placeholder="0" className={`${INPUT} w-28`} />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Save Draft</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No batches yet.</div>
          : data.map((t: any) => (
            <div key={t.id} className="px-4 py-3 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <span className="font-bold text-slate-900">{t.batchNumber}</span>
                <span className="flex-1 text-slate-600">{t.batchName || ''} · {(t.lines || []).length} bills · LKR {(t.lines || []).reduce((s: number, l: any) => s + l.amount, 0).toFixed(2)}</span>
                <DocStatusPill status={t.status} />
                {['draft', 'partially_processed', 'failed'].includes(t.status) && (
                  <>
                    <button onClick={() => act(t.id, 'process')} disabled={acting} className="text-xs font-semibold text-blue-700 hover:underline">{t.status === 'draft' ? 'Mark as Processed' : 'Retry Failed'}</button>
                    {t.status === 'draft' && <button onClick={() => act(t.id, 'cancel')} disabled={acting} className="text-xs text-slate-400 hover:text-rose-600">Cancel</button>}
                  </>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1">{(t.lines || []).map((l: any) => `${l.billId.slice(0, 8)}: ${l.status}`).join(' · ')}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
export function RequestsPage() { return <PrListPage title="My Requests" fetchFn={getMyPrs} scope="mine" hint="PRs you raised — draft, submit, recall, and track them here." />; }
export function ApprovalsPage() { return <ApprovalsInbox />; }
export function PrPage() { return <PrListPage title="Purchase Requests" fetchFn={getAllPrs} scope="all" hint="All requests in your organization." />; }
export function BudgetsPage() { return <ListPage title="Budgets" fetchFn={getOrders} hint="Cost centres and department budgets live here." />; }
export function AnalyticsPage() { return <ListPage title="Analytics" fetchFn={getOrders} hint="Spend reports and procurement analytics live here." />; }

// ── Purchase Requests — real lifecycle (Zoho report §2–3) ──

const PR_STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  awaiting: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-blue-50 text-blue-800 border-blue-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  processed: 'bg-blue-50 text-blue-800 border-blue-200',
  cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
  onhold: 'bg-purple-50 text-purple-800 border-purple-200',
};

function PrStatusPill({ status }: { status: string }) {
  const label = status === 'awaiting' ? 'Awaiting Approval' : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${PR_STATUS_STYLE[status] || PR_STATUS_STYLE.draft}`}>
      {label}
    </span>
  );
}

function prTotal(pr: any): number {
  return (pr.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.estimatedRate || 0) * (1 - (l.discount || 0) / 100), 0);
}

type PrLineForm = { itemName: string; category: string; quantity: string; estimatedRate: string; discount: string; preferredVendor: string; description: string };

const EMPTY_LINE: PrLineForm = { itemName: '', category: 'Other', quantity: '1', estimatedRate: '', discount: '', preferredVendor: '', description: '' };

const PR_CATEGORIES = ['Other', 'Food & Beverage', 'Housekeeping', 'Engineering', 'Office Supplies', 'Linen & Laundry', 'Kitchen Equipment', 'SPA & Amenities'];

function PrForm({ initial, submitting, onSubmit, onCancel }: {
  initial?: any; submitting: boolean;
  onSubmit: (payload: { expectedDate?: string; deliveryAddress?: string; reason?: string; notes?: string; reference?: string; lines: any[] }) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(initial?.reason || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [reference, setReference] = useState(initial?.reference || '');
  const [deliveryAddress, setDeliveryAddress] = useState(initial?.deliveryAddress || '');
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ? String(initial.expectedDate).slice(0, 10) : '');
  const [lines, setLines] = useState<PrLineForm[]>(
    initial?.lines?.length
      ? initial.lines.map((l: any) => ({ itemName: l.itemName || '', category: l.category || 'Other', quantity: String(l.quantity ?? 1), estimatedRate: l.estimatedRate != null ? String(l.estimatedRate) : '', discount: l.discount ? String(l.discount) : '', preferredVendor: l.preferredVendor || '', description: l.description || '' }))
      : [{ ...EMPTY_LINE }],
  );
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  useEffect(() => {
    getItems().then((r: any) => setCatalog(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const setLine = (i: number, patch: Partial<PrLineForm>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lines.filter((l) => l.itemName.trim());
    if (!clean.length) { setError('Add at least one line item'); return; }
    for (const l of clean) {
      if (Number(l.quantity) <= 0) { setError('Quantity must be greater than 0'); return; }
      if (l.estimatedRate !== '' && Number(l.estimatedRate) < 0) { setError('Rate cannot be negative'); return; }
      if (l.discount !== '' && (Number(l.discount) < 0 || Number(l.discount) > 100)) { setError('Discount must be 0–100'); return; }
    }
    setError('');
    onSubmit({
      expectedDate: expectedDate || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      reason: reason.trim() || undefined,
      notes: notes.trim() || undefined,
      reference: reference.trim() || undefined,
      lines: clean.map((l) => ({
        itemName: l.itemName.trim(),
        category: l.category || 'Other',
        quantity: Number(l.quantity) || 1,
        estimatedRate: l.estimatedRate === '' ? 0 : Number(l.estimatedRate),
        discount: l.discount === '' ? 0 : Number(l.discount),
        preferredVendor: l.preferredVendor.trim() || undefined,
        description: l.description.trim() || undefined,
      })),
    });
  };

  const input = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full';
  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this needed?" className={`${input} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Reference #</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className={`${input} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Expected Date</label>
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={`${input} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Delivery Address</label>
          <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Where should it be delivered?" className={`${input} mt-1`} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-700">Notes to Approver</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Context for the approver" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-700">Line Items</div>
        <datalist id="pr-catalog">
          {catalog.map((c: any, i: number) => <option key={c.id || i} value={c.name || c.Name} />)}
        </datalist>
        {lines.map((l, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/50">
            <div className="grid grid-cols-12 gap-2 items-center">
              <input value={l.itemName} onChange={(e) => setLine(i, { itemName: e.target.value })} placeholder="Item name * (type or pick from catalog)" list="pr-catalog" className={`${input} col-span-5`} />
              <input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} type="number" min={0} step="any" placeholder="Qty" title="Quantity" className={`${input} col-span-2`} />
              <input value={l.estimatedRate} onChange={(e) => setLine(i, { estimatedRate: e.target.value })} type="number" min={0} step="0.01" placeholder="Est. rate" title="Estimated rate" className={`${input} col-span-2`} />
              <input value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} type="number" min={0} max={100} step="any" placeholder="Disc %" title="Discount %" className={`${input} col-span-2`} />
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className="col-span-1 h-9 text-slate-400 hover:text-rose-600 disabled:opacity-30 text-lg leading-none" title="Remove line">×</button>
            </div>
            <div className="grid grid-cols-12 gap-2 items-center">
              <select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} className={`${input} col-span-3 bg-white`} title="Category">
                {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={l.preferredVendor} onChange={(e) => setLine(i, { preferredVendor: e.target.value })} placeholder="Preferred vendor" className={`${input} col-span-4`} />
              <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description (optional)" className={`${input} col-span-5`} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])} className="text-xs font-semibold text-blue-700 hover:underline">+ Add Another Line</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium" role="alert">{error}</div>}
      <div className="flex gap-3 justify-end pt-1">
        <button type="button" onClick={onCancel} disabled={submitting} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">Cancel</button>
        <button type="submit" disabled={submitting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm min-w-[110px]">
          {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Save as Draft'}
        </button>
      </div>
    </form>
  );
}

function PrDetail({ pr, onAction, acting, showApprove = false }: {
  pr: any; acting: boolean; showApprove?: boolean;
  onAction: (action: 'submit' | 'approve' | 'reject' | 'recall' | 'cancel' | 'process', body?: any) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const btn = 'px-4 h-9 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60';
  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        <div>
          <div className="font-bold text-slate-900">{pr.prNumber}</div>
          <div className="text-xs text-slate-500">{pr.reason || 'No reason given'} · {new Date(pr.createdAt).toLocaleDateString()}</div>
        </div>
        <PrStatusPill status={pr.status} />
        <div className="ml-auto text-sm font-bold text-slate-900">LKR {prTotal(pr).toFixed(2)}</div>
      </div>
      {(pr.expectedDate || pr.deliveryAddress || pr.reference || pr.notes) && (
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {pr.expectedDate && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Expected</div><div className="text-slate-700 mt-0.5">{String(pr.expectedDate).slice(0, 10)}</div></div>}
          {pr.deliveryAddress && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Deliver To</div><div className="text-slate-700 mt-0.5">{pr.deliveryAddress}</div></div>}
          {pr.reference && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Reference</div><div className="text-slate-700 mt-0.5">{pr.reference}</div></div>}
          {pr.notes && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Notes</div><div className="text-slate-700 mt-0.5">{pr.notes}</div></div>}
        </div>
      )}
      {pr.status === 'rejected' && pr.rejectReason && (
        <div className="px-5 py-3 bg-rose-50/60 border-b border-rose-100 text-xs text-rose-800">
          <span className="font-semibold">Rejection reason: </span>{pr.rejectReason}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {(pr.lines || []).map((l: any) => (
          <div key={l.id} className="px-5 py-3 flex items-center gap-3 text-sm">
            <div className="flex-[2] min-w-0">
              <div className="font-medium text-slate-900 truncate">{l.itemName}</div>
              <div className="text-xs text-slate-500 truncate">{l.preferredVendor ? `Pref: ${l.preferredVendor}` : l.description || l.category}</div>
            </div>
            <span className="w-20 text-right text-slate-600">× {l.quantity}</span>
            <span className="w-28 text-right font-medium text-slate-900">LKR {(l.quantity * l.estimatedRate * (1 - (l.discount || 0) / 100)).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap">
        {(pr.status === 'draft' || pr.status === 'rejected') && (
          <button onClick={() => onAction('submit')} disabled={acting} className={`${btn} bg-[#2084FA] text-white hover:bg-blue-700`}>Submit for Approval</button>
        )}
        {pr.status === 'awaiting' && (
          <>
            {showApprove && (
              <>
                <button onClick={() => { if (window.confirm(`Approve ${pr.prNumber}?`)) onAction('approve'); }} disabled={acting} className={`${btn} bg-[#2084FA] text-white hover:bg-blue-700`}>Approve</button>
                <button onClick={() => setRejecting((v) => !v)} disabled={acting} className={`${btn} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}>Reject</button>
              </>
            )}
            <button onClick={() => onAction('recall')} disabled={acting} className={`${btn} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}>Recall</button>
          </>
        )}
        {pr.status === 'approved' && (
          <button onClick={() => onAction('process')} disabled={acting} className={`${btn} bg-slate-900 text-white hover:bg-slate-800`}>Mark as Processed</button>
        )}
        {['draft', 'awaiting', 'rejected'].includes(pr.status) && (
          <button onClick={() => { if (window.confirm('Cancel this request?')) onAction('cancel'); }} disabled={acting} className="px-4 h-9 rounded-lg text-sm font-medium text-slate-500 hover:text-rose-600">Cancel request</button>
        )}
        {pr.status === 'approved' && (
          <span className="text-xs text-slate-500 self-center ml-auto">Approved — PO conversion lands in Phase 2.</span>
        )}
      </div>
      {rejecting && (
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (required)" className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400" />
          <button
            onClick={() => { if (rejectReason.trim()) { onAction('reject', { reason: rejectReason.trim() }); setRejecting(false); setRejectReason(''); } }}
            disabled={acting || !rejectReason.trim()}
            className="px-4 h-9 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60"
          >
            Confirm Reject
          </button>
        </div>
      )}
    </div>
  );
}

function PrListPage({ title, fetchFn, scope, hint }: { title: string; fetchFn: FetchFn; scope: 'mine' | 'all'; hint?: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    setLoading(true);
    fetchFn()
      .then((r) => setData(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [fetchFn]);

  const refreshOne = (updated: any) => {
    setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    if (editing?.id === updated.id) setEditing(null);
  };

  const handleCreate = async (payload: any) => {
    setSubmitting(true);
    try {
      const created = await createPr(payload);
      setData((ds) => [created, ...ds]);
      setShowCreate(false);
    } catch (e: any) { setError(e?.message || 'Failed to create'); } finally { setSubmitting(false); }
  };

  const handleUpdate = async (payload: any) => {
    if (!editing) return;
    setSubmitting(true);
    try {
      const updated = await updatePr(editing.id, payload);
      refreshOne(updated);
    } catch (e: any) { setError(e?.message || 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'recall' | 'cancel' | 'process', body: any = {}) => {
    setActing(true);
    try {
      const updated = await prAction(id, action, body);
      refreshOne(updated);
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const visible = statusFilter === 'all' ? data : data.filter((d) => d.status === statusFilter);

  useEffect(() => {
    if (scope !== 'mine') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowCreate(true); setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scope]);

  const isEmptyMine = scope === 'mine' && !loading && visible.length === 0 && statusFilter === 'all' && !showCreate && !editing;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {!isEmptyMine && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{hint || `${data.length} requests`}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-700">
              {['all', 'draft', 'awaiting', 'approved', 'rejected', 'processed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All statuses' : s === 'awaiting' ? 'Awaiting Approval' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            {scope === 'mine' && (
              <button onClick={() => { setShowCreate((v) => !v); setEditing(null); }} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
                + New Request
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm font-medium border shadow-sm bg-rose-50 border-rose-200 text-rose-800" role="alert">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
          </div>
        </div>
      )}

      {showCreate && <PrForm submitting={submitting} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />}
      {editing && <PrForm initial={editing} submitting={submitting} onSubmit={handleUpdate} onCancel={() => setEditing(null)} />}

      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading requests…</div>
        ) : visible.length === 0 ? (
          statusFilter !== 'all' ? (
            <div className="p-8 text-center rounded-2xl bg-white border border-slate-200">
              <div className="text-sm font-medium text-slate-700">No requests with this status</div>
              <div className="text-xs text-slate-500 mt-1">Try a different filter.</div>
            </div>
          ) : scope === 'mine' ? (
            <div className="relative overflow-hidden rounded-xl">
              <div className="absolute inset-0 pf-pattern-bg pointer-events-none select-none" aria-hidden="true" style={{ opacity: 0.07, maskImage: 'radial-gradient(ellipse 70% 70% at 50% 35%, black 60%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 35%, black 60%, transparent 100%)' }} />
              <div className="relative py-16 sm:py-20 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-center mb-5 text-slate-700">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Get Started with Purchase Requests</h2>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-lg mx-auto">
                  With Purchase Requests, you can get prior approval for your business purchases.
                  Once approved, you can associate the same to the actual expense created.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowCreate(true); setEditing(null); }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-medium text-sm rounded-lg shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-4 focus:ring-blue-100"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4v16m8-8H4" /></svg>
                    <span>New Purchase Request</span>
                  </button>
                  <kbd className="px-1.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-500">Alt + N</kbd>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-3 text-left max-w-2xl mx-auto">
                  <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-4">
                    <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-slate-200/70 text-[11px] font-bold text-slate-600">1</span>
                    <div className="mt-2 text-[13px] font-bold text-slate-900">Create Line Items</div>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">Pick items from hotel master catalog or specify custom requisitions with target vendor and estimated rate.</p>
                  </div>
                  <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-4">
                    <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-slate-200/70 text-[11px] font-bold text-slate-600">2</span>
                    <div className="mt-2 text-[13px] font-bold text-slate-900">Multi-Tier Approval</div>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">Department spend thresholds automatically route requisitions to GM, F&amp;B Director, or Corporate Finance.</p>
                  </div>
                  <div className="rounded-xl bg-slate-50/70 border border-slate-200/70 p-4">
                    <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-slate-200/70 text-[11px] font-bold text-slate-600">3</span>
                    <div className="mt-2 text-[13px] font-bold text-slate-900">1-Click Convert to PO</div>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">Once approved, convert into official supplier purchase orders with full line-item <span className="text-[#2563eb]">synchronization</span>.</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3.5 bg-slate-100/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
                <span className="text-slate-600 shrink-0">Need inspiration? Try pre-approved department templates:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-[3px] bg-amber-400" />F&amp;B Daily Produce</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-[3px] bg-sky-400" />Room Amenities</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium"><span className="w-2.5 h-2.5 rounded-[3px] bg-indigo-400" />IT Peripherals</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl bg-white border border-slate-200">
              <div className="text-sm font-medium text-slate-700">Nothing here yet.</div>
            </div>
          )
        ) : (
          visible.map((pr: any) => (
            <div key={pr.id}>
              <button
                onClick={() => setOpenId(openId === pr.id ? null : pr.id)}
                className="w-full px-4 py-3 flex items-center gap-4 text-sm rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)] hover:border-slate-300 text-left"
              >
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{pr.prNumber}</span>
                <span className="flex-1 font-medium text-slate-700 truncate">{pr.reason || `${(pr.lines || []).length} line(s)`}</span>
                <span className="hidden sm:block text-slate-500 w-24 text-right">LKR {prTotal(pr).toFixed(2)}</span>
                <PrStatusPill status={pr.status} />
              </button>
              {openId === pr.id && (
                <div className="mt-2">
                  <PrDetail
                    pr={pr} acting={acting} showApprove={scope === 'all'}
                    onAction={(a, b) => handleAction(pr.id, a, b)}
                  />
                  {(pr.status === 'draft' || pr.status === 'rejected') && scope === 'mine' && (
                    <button onClick={() => setEditing(pr)} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">Edit request</button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ageOf(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

// ── Approvals inbox — one queue of everything awaiting YOU ──
//
// The concept (Zoho's, built our way): approvals are triaged, not browsed.
// Everything waiting on your decision lands in one queue as a typed row —
// who submitted it, what kind of thing it is, key details, status. Expand
// a row to review, decide inline (approve with confirm, reject with a
// mandatory reason), and the item leaves the queue. Today the live feed is
// purchase requests; POs, bills, vendors and RFQ awards plug into the same
// row shape as their pending endpoints land. No forward action yet — the
// backend has no reassign endpoint, so it stays out rather than faked.
//
// The layout follows Zoho's table type, not our card lists: title row,
// filter row, grey column band, flat full-bleed rows, plain empty text.
function ApprovalsInbox() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getPendingPrs()
      .then((r) => setData(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleAction = async (id: string, action: 'approve' | 'reject', body: any = {}) => {
    setActing(true);
    try {
      const updated = await prAction(id, action, body);
      // Decided items leave the queue
      setData((ds) => ds.filter((d) => d.id !== updated.id));
      if (openId === id) setOpenId(null);
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const visible = typeFilter === 'all'
    ? data
    : data.filter((d) => (d.entityType || 'prs') === typeFilter);

  const chevDown = (cls: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={cls}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="w-full">
      {/* Title row — scope switcher */}
      <div className="relative px-1 py-3">
        <button onClick={() => { setScopeOpen((v) => !v); setTypeOpen(false); }} className="flex items-center gap-1 text-[17px] font-bold text-slate-900">
          All Approvals
          {chevDown('text-[#2563eb]')}
        </button>
        {scopeOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setScopeOpen(false)} />
            <div className="absolute top-full left-0 mt-1 w-60 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-20">
              <div className="px-3 py-2 text-[13px] font-semibold text-slate-800 flex items-center justify-between">
                Pending approvals
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2563eb]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="px-3 py-2 text-[13px] text-slate-400">Decision history — feed coming</div>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-slate-200" />

      {/* Filter row — request type */}
      <div className="relative px-1 py-3">
        <button onClick={() => { setTypeOpen((v) => !v); setScopeOpen(false); }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          {typeFilter === 'all' ? 'Select Request Type' : 'Purchase Requests'}
          {chevDown('text-slate-400')}
        </button>
        {typeOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setTypeOpen(false)} />
            <div className="absolute top-full left-0 mt-1 w-60 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-20">
              {[
                { id: 'all', label: 'All request types' },
                { id: 'prs', label: 'Purchase Requests' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setTypeFilter(o.id); setTypeOpen(false); }}
                  className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  {o.label}
                  {typeFilter === o.id && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2563eb]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
              {['Purchase Orders', 'Bills', 'Vendors', 'RFQ Awards'].map((label) => (
                <div key={label} className="px-3 py-2 text-[13px] text-slate-400">{label} — feed coming</div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="border-t border-slate-200" />

      {/* Column band */}
      <div className="grid grid-cols-12 gap-2 px-1 py-2.5 bg-[#f8fafc] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
        <span className="col-span-4 md:col-span-3">Submitted by</span>
        <span className="hidden md:block md:col-span-2">Entity type</span>
        <span className="col-span-5 md:col-span-4">Details</span>
        <span className="col-span-3">Status</span>
      </div>
      <div className="border-t border-slate-200" />

      {error && (
        <div className="mx-1 mt-3 rounded-lg px-4 py-3 text-sm font-medium border shadow-sm bg-rose-50 border-rose-200 text-rose-800" role="alert">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading approvals…</div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-[15px] text-slate-500">No Records Found</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((pr: any) => {
            const submittedBy = pr.requesterName || pr.createdBy?.email || '—';
            const age = ageOf(pr.createdAt || pr.updatedAt);
            const open = openId === pr.id;
            return (
              <div key={pr.id}>
                <button
                  onClick={() => setOpenId(open ? null : pr.id)}
                  className="w-full grid grid-cols-12 gap-2 px-1 py-3 text-sm text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="col-span-4 md:col-span-3 min-w-0">
                    <span className="block text-slate-700 truncate">{submittedBy}</span>
                    {age && <span className="block text-xs text-slate-400">{age}</span>}
                  </span>
                  <span className="hidden md:block md:col-span-2 text-slate-600 truncate self-start pt-0.5">Purchase Request</span>
                  <span className="col-span-5 md:col-span-4 min-w-0">
                    <span className="block font-medium text-slate-800 truncate">{pr.prNumber} · {pr.reason || `${(pr.lines || []).length} line(s)`}</span>
                    <span className="block text-xs text-slate-400 tabular-nums">LKR {prTotal(pr).toFixed(2)}</span>
                  </span>
                  <span className="col-span-3 self-start pt-0.5"><PrStatusPill status={pr.status} /></span>
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-1 py-3">
                    <PrDetail pr={pr} acting={acting} showApprove onAction={(a, b) => handleAction(pr.id, a as 'approve' | 'reject', b)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
