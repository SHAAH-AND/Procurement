import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVendors, createVendor } from '../../../api';
import storefrontIcon from './assets/storefront.svg';

const BENEFITS = [
  'Stay connected with multiple contact persons',
  'Provide portal access to vendors',
  'Handle multiple addresses effortlessly',
  'Create multi-currency transactions for contacts',
];

export function VendorsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    category: 'General',
    paymentTerms: 'Net 15',
    address: '',
  });

  const load = () => {
    setLoading(true);
    setError('');
    getVendors()
      .then((r: any) => {
        const arr = Array.isArray(r) ? r : r?.data || r?.items || [];
        setData(Array.isArray(arr) ? arr : []);
      })
      .catch((e: any) => {
        setData([]);
        setError(e?.message || 'Failed to load');
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadKey]);

  useEffect(() => {
    if (!moreOpen && !viewOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen, viewOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const raw: any = await createVendor({
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        category: form.category,
        paymentTerms: form.paymentTerms,
        address: form.address.trim() || undefined,
      });
      const created = raw?.data ?? raw?.vendor ?? raw;
      const row = {
        id: created?.id || created?.ROWID || `tmp-${Date.now()}`,
        name: created?.name || created?.Name || form.name.trim(),
        contactPerson: created?.contactPerson || created?.ContactPerson || form.contactPerson,
        email: created?.email || created?.Email || created?.ContactEmail || form.email,
        phone: created?.phone || created?.Phone || form.phone,
        category: created?.category || created?.Category || form.category,
        paymentTerms: created?.paymentTerms || created?.PaymentTerms || form.paymentTerms,
        address: created?.address || created?.Address || form.address,
        status: created?.status || created?.Status || 'active',
        createdAt: created?.createdAt || new Date().toISOString(),
      };
      setData((d) => [row, ...d]);
      setForm({ name: '', contactPerson: '', email: '', phone: '', category: 'General', paymentTerms: 'Net 15', address: '' });
      setShowCreate(false);
    } catch (err: any) {
      setError(err?.message || 'Vendor creation failed');
    }
  };

  const sortedData = useMemo(
    () => [...data].sort((a, b) => String(a.name || a.Name || '').localeCompare(String(b.name || b.Name || ''))),
    [data],
  );

  const visibleData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedData;
    return sortedData.filter((r: any) =>
      `${r.name || r.Name || ''} ${r.contactPerson || r.ContactPerson || ''} ${r.email || r.Email || ''} ${r.phone || r.Phone || ''}`.toLowerCase().includes(q),
    );
  }, [sortedData, query]);

  const isEmpty = !loading && data.length === 0 && !query;

  return (
    <div className="flex flex-col h-full">
      {/* Title band — Zoho flat style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3">
        <div className="relative" ref={viewRef}>
          <button onClick={() => setViewOpen((v) => !v)} className="flex items-center gap-1.5 text-[20px] font-bold text-[#07175A] leading-tight">
            All Vendors
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {viewOpen && (
            <div className="absolute left-0 top-full mt-1 w-52 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-30">
              <button onClick={() => setViewOpen(false)} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                All Vendors
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

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <span className="flex items-center gap-3 shrink-0">
            {/sign in/i.test(error) && (
              <button onClick={() => navigate('/signin')} className="text-xs font-semibold underline hover:opacity-100">Sign In</button>
            )}
            <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
          </span>
        </div>
      )}

      {isEmpty ? (
        /* Zoho getting-started — flat, no card */
        <div className="flex-1 overflow-auto">
          <div className="py-14 flex flex-col items-center text-center px-6">
            <div className="relative inline-block mb-6">
              <div className="w-28 h-28 rounded-full bg-[#e5e9f2] flex items-center justify-center">
                <img src={storefrontIcon} alt="" className="w-[52px] h-[52px]" />
              </div>
              <button onClick={() => setShowCreate(true)} aria-label="Create new vendor" className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-[#2084FA] text-white flex items-center justify-center hover:bg-[#1a6fd6] shadow-md transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <h2 className="text-[20px] font-semibold text-slate-900">Every purchase starts with a vendor</h2>
            <p className="text-[15px] text-slate-500 mt-2 max-w-xl">Create and manage your vendors and their contact persons, all in one place.</p>
            <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
              <button
                onClick={() => setShowCreate(true)}
                className="px-5 h-10 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" /></svg>
                Create New Vendor
              </button>
              <button className="px-5 h-10 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Import File
              </button>
            </div>

            <div className="mt-10 w-full max-w-3xl rounded-2xl bg-[#f4f5fb] border border-slate-200 p-6 text-left">
              <div className="flex items-center gap-2 text-slate-900 text-[15px] font-semibold mb-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-slate-500"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                Key Benefits
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px] text-slate-600">
                {BENEFITS.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-green-600 mt-0.5 shrink-0"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Flat list — Zoho style */
        <div className="flex-1 overflow-auto px-1">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              <div className="col-span-1 flex items-center gap-3">
                <span className="text-[#2084FA] flex items-center" title="Filters">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /><circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth={1.8} /><circle cx="10" cy="17" r="2" stroke="currentColor" strokeWidth={1.8} /></svg>
                </span>
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" aria-label="Select all" />
              </div>
              <span className="col-span-2">Vendor Name</span>
              <span className="col-span-2">Contact Person</span>
              <span className="col-span-2">Email</span>
              <span className="col-span-1">Phone</span>
              <span className="col-span-1">Status</span>
              <span className="col-span-1">Portal</span>
              <span className="col-span-1">Currency</span>
              <div className="col-span-1 flex justify-end">
                <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search vendors">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            {searchOpen && (
              <div className="py-2 px-1">
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vendors"
                  className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                />
              </div>
            )}
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading vendors…</div>
            ) : visibleData.length === 0 ? (
              <div className="py-16 text-center text-[15px] text-slate-500">No Records Found</div>
            ) : (
              <div>
                {visibleData.slice(0, 20).map((row: any, i: number) => {
                  const status = String(row.status || row.Status || 'active');
                  return (
                    <div key={row.id || row.ROWID || i} className="grid grid-cols-12 items-center gap-2 px-3 py-3 border-b border-slate-100 text-[13px] hover:bg-slate-50/60 transition-colors">
                      <div className="col-span-1">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" aria-label={`Select ${row.name || row.Name || 'vendor'}`} />
                      </div>
                      <span className="col-span-2 font-medium text-slate-900 truncate">{row.name || row.Name || `Vendor ${i + 1}`}</span>
                      <span className="col-span-2 text-slate-600 truncate">{row.contactPerson || row.ContactPerson || '—'}</span>
                      <span className="col-span-2 text-slate-600 truncate">{row.email || row.Email || '—'}</span>
                      <span className="col-span-1 text-slate-600 truncate">{row.phone || row.Phone || '—'}</span>
                      <span className="col-span-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          status.toLowerCase() === 'active'
                            ? 'bg-green-100 text-green-800'
                            : status.toLowerCase() === 'inactive'
                            ? 'bg-slate-100 text-slate-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </span>
                      <span className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {(row.portalEnabled || row.PortalEnabled) ? '✓' : '—'}
                        </span>
                      </span>
                      <span className="col-span-1 text-slate-600">{row.currency || row.Currency || 'LKR'}</span>
                      <span className="col-span-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-900">New Vendor</h3>
            <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700">Vendor Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme Supplies Ltd."
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Contact Person</label>
              <input
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Optional"
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
                className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+94 77 123 4567"
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
                {['General', 'Food Supplier', 'Beverage', 'Housekeeping', 'Maintenance', 'Logistics', 'Services', 'Office Supplies'].map((c) => (
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
                {['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt', 'Advance', 'COD'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={3}
                placeholder="Optional"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm min-w-[110px]"
            >
              Create Vendor
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
