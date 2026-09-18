import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocList, DocStatusPill, docTotal } from '../shared/hooks';
import { getPos, createPoFromPr, poAction, deletePo, getVendors, getAllPrs } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'draft', label: 'Draft', statuses: ['draft'] },
  { id: 'pending', label: 'Pending', statuses: ['pending'] },
  { id: 'approved', label: 'Approved', statuses: ['approved'] },
  { id: 'issued', label: 'Issued', statuses: ['issued'] },
  { id: 'received', label: 'Received', statuses: ['received', 'partially_received'] },
  { id: 'billed', label: 'Billed', statuses: ['billed', 'partially_billed'] },
  { id: 'closed', label: 'Closed', statuses: ['closed'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

const VIEW_STATUSES = ['draft', 'pending', 'approved', 'issued', 'partially_received', 'received', 'partially_billed', 'billed', 'closed', 'cancelled'];

const PAGE_SIZE = 25;
const FAV_KEY = 'pf-po-views-fav';
const CUSTOM_KEY = 'pf-po-views-custom';

function loadIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

function loadCustom(): ViewDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v: any) => v && typeof v.id === 'string' && typeof v.label === 'string')
      .map((v: any) => ({ id: v.id, label: v.label, statuses: Array.isArray(v.statuses) ? v.statuses : null }));
  } catch { return []; }
}

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LIFE_CYCLE = [
  { label: 'Raise Purchase Order', icon: 'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4' },
  { label: 'Receive Goods', icon: 'M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8' },
  { label: 'Convert to Bill', icon: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h3' },
  { label: 'Record Payment', icon: 'M12 3v18 M7 7c0-2 2-3 5-3s5 1 5 3-2 3-5 4-5 2-5 4c0 2 2 3 5 3s5-1 5-3' },
];

export function PoPage() {
  const navigate = useNavigate();
  const { data, setData, loading, error, setError, load } = useDocList(getPos);
  const [vendors, setVendors] = useState<any[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [viewId, setViewId] = useState('all');
  const [favs, setFavs] = useState<string[]>(() => loadIds(FAV_KEY));
  const [customViews, setCustomViews] = useState<ViewDef[]>(() => loadCustom());
  const [viewSearch, setViewSearch] = useState('');
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewStatus, setNewViewStatus] = useState('all');
  const [showFromPr, setShowFromPr] = useState(false);
  const [selPr, setSelPr] = useState('');
  const [selLines, setSelLines] = useState<string[]>([]);
  const [vendor, setVendor] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const allViews = useMemo(() => [...VIEWS, ...customViews], [customViews]);
  const activeView = allViews.find((v) => v.id === viewId) || VIEWS[0];

  useEffect(() => {
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
    getAllPrs().then((r: any) => setPrs((Array.isArray(r) ? r : []).filter((p: any) => p.status === 'approved'))).catch(() => {});
  }, []);

  useEffect(() => { setPage(0); }, [viewId, query]);

  useEffect(() => {
    if (!moreOpen && !viewOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen, viewOpen]);

  const toggleFav = (id: string) => {
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const saveNewView = () => {
    const label = newViewName.trim();
    if (!label) return;
    const view: ViewDef = { id: `custom-${Date.now()}`, label, statuses: newViewStatus === 'all' ? null : [newViewStatus] };
    setCustomViews((vs) => {
      const next = [...vs, view];
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setViewId(view.id);
    setNewViewName('');
    setNewViewStatus('all');
    setNewViewOpen(false);
    setViewOpen(false);
  };

  const deleteCustomView = (id: string) => {
    setCustomViews((vs) => {
      const next = vs.filter((v) => v.id !== id);
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    if (viewId === id) setViewId('all');
  };

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

  const remove = async (id: string, poNumber: string) => {
    if (!window.confirm(`Delete ${poNumber}? This cannot be undone.`)) return;
    setActing(true);
    try {
      await deletePo(id);
      setData((ds) => ds.filter((d) => d.id !== id));
    } catch (e: any) { setError(e?.message || 'Delete failed'); } finally { setActing(false); }
  };

  const prLines = prs.find((p: any) => p.id === selPr)?.lines || [];

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return viewFiltered;
    return viewFiltered.filter((d) => {
      const hay = `${d.poNumber || ''} ${d.vendorName || ''} ${d.reference || ''} ${d.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [viewFiltered, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  const isEmpty = !loading && data.length === 0 && !query;

  const viewMatches = (q: string) =>
    allViews.filter((v) => v.label.toLowerCase().includes(q.trim().toLowerCase()));

  const renderViewRow = (v: ViewDef, isCustom: boolean) => {
    const selected = viewId === v.id;
    const fav = favs.includes(v.id);
    return (
      <div
        key={v.id}
        onClick={() => { setViewId(v.id); setViewOpen(false); setNewViewOpen(false); }}
        className={`w-full px-4 py-2.5 text-[14px] flex items-center justify-between gap-2 cursor-pointer rounded-md mx-1.5 ${selected ? 'bg-[#2084FA] text-white font-medium' : 'text-slate-800 hover:bg-slate-50'}`}
        style={{ width: 'calc(100% - 12px)' }}
      >
        <span className="truncate">{v.label}</span>
        <span className="flex items-center gap-1 shrink-0">
          {isCustom && !selected && (
            <span
              onClick={(e) => { e.stopPropagation(); deleteCustomView(v.id); }}
              title="Delete view"
              className="text-slate-300 hover:text-rose-500 text-sm leading-none px-0.5"
            >
              ×
            </span>
          )}
          <span
            onClick={(e) => { e.stopPropagation(); toggleFav(v.id); }}
            title={fav ? 'Remove from favorites' : 'Mark as favorite'}
            className={selected ? 'text-white' : fav ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={fav || selected ? 'currentColor' : 'none'}><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></svg>
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Title band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3">
        <div className="relative" ref={viewRef}>
          <button onClick={() => { setViewId('all'); setViewOpen((v) => !v); }} className="flex items-center gap-1.5 text-[20px] font-bold text-[#07175A] leading-tight">
            All Purchase Orders
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {viewOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
              <div className="px-2.5 pb-1.5">
                <div className="relative">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
                  <input
                    autoFocus value={viewSearch} onChange={(e) => setViewSearch(e.target.value)}
                    placeholder=""
                    aria-label="Search views"
                    className="h-9 w-full pl-9 pr-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-0.5">
                {viewMatches(viewSearch).filter((v) => !v.id.startsWith('custom-')).map((v) => renderViewRow(v, false))}
                {customViews.length > 0 && (
                  <>
                    <div className="border-t border-slate-100 my-1.5" />
                    {viewMatches(viewSearch).filter((v) => v.id.startsWith('custom-')).map((v) => renderViewRow(v, true))}
                  </>
                )}
              </div>
              <div className="border-t border-slate-100 mt-1.5 pt-1.5 px-1.5">
                {!newViewOpen ? (
                  <button onClick={() => setNewViewOpen(true)} className="w-full px-2.5 py-2 text-[14px] text-left text-slate-800 hover:bg-slate-50 rounded-md flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
                    New View
                  </button>
                ) : (
                  <div className="px-2.5 py-2 space-y-2">
                    <input
                      value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
                      placeholder="View name"
                      className="h-9 w-full px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                    />
                    <select
                      value={newViewStatus}
                      onChange={(e) => setNewViewStatus(e.target.value)}
                      className="h-9 w-full px-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                    >
                      <option value="all">All statuses</option>
                      {VIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setNewViewOpen(false); setNewViewName(''); }} className="px-3 h-8 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200">Cancel</button>
                      <button onClick={saveNewView} disabled={!newViewName.trim()} className="px-3 h-8 rounded-md bg-[#2084FA] text-white text-xs font-semibold hover:bg-[#1a6fd6] disabled:opacity-50">Save View</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 pb-2">
          <button onClick={() => navigate('/workspace/receives')} className="flex items-center gap-1.5 text-[14px] font-semibold text-[#2084FA] hover:text-[#1a6fd6] whitespace-nowrap">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 7h11v9H3z M14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><circle cx="7" cy="18" r="1.8" stroke="currentColor" strokeWidth={1.7} /><circle cx="17" cy="18" r="1.8" stroke="currentColor" strokeWidth={1.7} /></svg>
            In Transit Receives
          </button>
          <button
            onClick={() => navigate('new')}
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
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
                <button onClick={() => setShowFromPr((v) => !v)} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50">New from Approved PR</button>
                <button onClick={() => { load(); setMoreOpen(false); }} className="px-4 py-2.5 mt-1 mx-2 rounded-lg bg-[#2084FA] text-white text-[14px] font-semibold hover:bg-[#1a6fd6] flex items-center justify-center gap-2" style={{ width: 'calc(100% - 16px)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Refresh List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {showFromPr && (
        <div className="mx-1 mb-3 rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
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
            <button onClick={createFromPr} disabled={acting || !selPr} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Create PO</button>
          </div>
        </div>
      )}

      {isEmpty ? (
        /* Zoho getting-started */
        <div className="flex-1 overflow-auto">
          <div className="py-14 flex flex-col items-center text-center px-6">
            <h2 className="text-[26px] leading-snug font-semibold text-slate-900">Start Managing Your Purchase Activities!</h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-2xl">Create, customize, and send professional Purchase Orders to your vendors.</p>
            <button onClick={() => navigate('new')} className="mt-6 px-6 py-2.5 rounded-md bg-[#2084FA] text-white text-[13px] font-bold tracking-wide hover:bg-[#1a6fd6] shadow-sm">
              CREATE NEW PURCHASE ORDER
            </button>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-10 pb-4 px-6">
            <h3 className="text-[17px] font-medium text-slate-900 text-center">Life cycle of a Purchase Order</h3>
            <div className="flex items-center justify-center gap-0 mt-6 flex-wrap">
              {LIFE_CYCLE.map((s, i) => (
                <span key={s.label} className="flex items-center">
                  <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d={s.icon} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">{s.label}</span>
                  </span>
                  {i < LIFE_CYCLE.length - 1 && (
                    <span className="flex flex-col items-center mx-1">
                      <span className="text-[9px] font-semibold text-slate-400 whitespace-nowrap px-1">{i === 0 ? 'CONVERT TO OPEN' : 'CONVERT'}</span>
                      <span className="text-[#2084FA] text-sm leading-none">╌╌╌▸</span>
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="px-6 pb-10 pt-6 max-w-3xl mx-auto w-full">
            <h3 className="text-[15px] text-slate-700">In the Purchase Orders module, you can:</h3>
            <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
              {[
                'Create and send a purchase order to your vendors when you are in need of a product.',
                'Convert the purchase order into a bill after you receive an invoice for your purchase.',
                'Set conditions that determine when a purchase order is marked as closed.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-[#2084FA] shrink-0 mt-0.5"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.6} /><path d="M8.5 12.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          {/* Column header — Zoho style */}
          <div className="px-1">
            <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              <span className="col-span-2">Purchase Order#</span>
              <span className="col-span-3">Vendor</span>
              <span className="col-span-2">Date</span>
              <span className="col-span-2">Delivery Date</span>
              <span className="col-span-1">Status</span>
              <span className="col-span-1 text-right">Amount</span>
              <div className="col-span-1 flex justify-end">
                <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search purchase orders">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            {searchOpen && (
              <div className="py-2">
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search purchase orders"
                  className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                />
              </div>
            )}
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-auto px-1">
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading purchase orders…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[15px] text-slate-500">No purchase orders for this filter. Choose another filter or select All to view all orders.</div>
            ) : (
              <div>
                {pageRows.map((po: any, i: number) => {
                  const open = openId === po.id;
                  return (
                    <div key={po.id || i} className="border-b border-slate-100">
                      <button
                        onClick={() => setOpenId(open ? null : po.id)}
                        className="w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center"
                      >
                        <span className="col-span-2 font-medium text-[#2084FA] hover:underline truncate">{po.poNumber || `PO-${i + 1}`}</span>
                        <span className="col-span-3 text-slate-700 truncate">{po.vendorName || 'No vendor'}</span>
                        <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(po.createdAt)}</span>
                        <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(po.deliveryDate || po.expectedDate)}</span>
                        <span className="col-span-1"><DocStatusPill status={po.status} /></span>
                        <span className="col-span-1 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(docTotal(po.lines))}</span>
                        <span className="col-span-1" />
                      </button>
                      {open && (
                        <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                          <div className="divide-y divide-slate-100 mb-3">
                            {(po.lines || []).map((l: any) => (
                              <div key={l.id} className="py-2 flex items-center gap-3 text-[13px]">
                                <span className="flex-1 min-w-0">
                                  <span className="font-medium text-slate-900 truncate block">{l.itemName}</span>
                                  <span className="text-xs text-slate-500">Recv {l.receivedQty || 0}/{l.quantity} · Billed {l.billedQty || 0}/{l.quantity}</span>
                                </span>
                                <span className="text-slate-600 tabular-nums">× {l.quantity}</span>
                                <span className="w-28 text-right font-medium text-slate-900 tabular-nums">LKR {fmtMoney(l.quantity * l.rate)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {po.status === 'draft' && <button onClick={() => act(po.id, 'submit')} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Submit</button>}
                            {po.status === 'pending' && <button onClick={() => act(po.id, 'approve')} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Approve</button>}
                            {['approved', 'draft'].includes(po.status) && <button onClick={() => act(po.id, 'issue')} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Issue to Vendor</button>}
                            {!['cancelled', 'closed', 'billed'].includes(po.status) && <button onClick={() => act(po.id, 'close')} disabled={acting} className="px-4 h-9 rounded-md bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 disabled:opacity-60">Close</button>}
                            {!['billed', 'closed', 'cancelled'].includes(po.status) && <button onClick={() => { if (window.confirm(`Cancel ${po.poNumber}?`)) act(po.id, 'cancel'); }} disabled={acting} className="px-3 h-9 text-sm text-slate-500 hover:text-rose-600">Cancel</button>}
                            {['draft', 'cancelled'].includes(po.status) && <button onClick={() => remove(po.id, po.poNumber)} disabled={acting} className="px-3 h-9 text-sm text-slate-500 hover:text-rose-600 disabled:opacity-60">Delete</button>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div className="px-3 py-2.5 border-t border-slate-200 flex items-center justify-between text-[12px] text-slate-600 bg-white">
                <span>Showing {rangeStart}–{rangeEnd} of {filtered.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="px-2 h-7 text-slate-600 hover:text-slate-900 disabled:opacity-40" aria-label="Previous">‹ Prev</button>
                  <span className="px-2 tabular-nums text-slate-700 font-medium">{safePage + 1} / {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="px-2 h-7 text-slate-600 hover:text-slate-900 disabled:opacity-40" aria-label="Next">Next ›</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
