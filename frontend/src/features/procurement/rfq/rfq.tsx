import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getRfqs, createRfq, getVendors, getAllPrs } from '../../../api';

type Tab = 'pending' | 'active' | 'all';
type SortKey = 'createdAt' | 'rfqNumber' | 'awardingDate';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'my_approvals', label: 'My Approvals', statuses: ['awaiting'] },
  { id: 'awaiting', label: 'Awaiting Approval', statuses: ['awaiting'] },
  { id: 'approved', label: 'Approved', statuses: ['approved'] },
  { id: 'rejected', label: 'Rejected', statuses: ['rejected'] },
  { id: 'recalled', label: 'Recalled', statuses: ['recalled'] },
  { id: 'pending', label: 'Pending', statuses: ['draft', 'pending'] },
  { id: 'published', label: 'Published', statuses: ['submitted', 'published'] },
  { id: 'canceled', label: 'Canceled', statuses: ['cancelled', 'canceled'] },
];

const VIEW_STATUSES = ['draft', 'pending', 'submitted', 'published', 'awaiting', 'approved', 'rejected', 'recalled', 'awarded', 'cancelled'];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'createdAt', label: 'Created Time' },
  { id: 'rfqNumber', label: 'Request for Quote #' },
  { id: 'awardingDate', label: 'Awarding Date' },
];

const PAGE_SIZE = 25;
const FAV_KEY = 'pf-rfq-views-fav';
const CUSTOM_KEY = 'pf-rfq-views-custom';

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

export function RfqPage() {
  const navigate = useNavigate();
  const { data, setData, loading, error, setError, load } = useDocList(getRfqs);
  const [prs, setPrs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [viewId, setViewId] = useState('all');
  const [favs, setFavs] = useState<string[]>(() => loadIds(FAV_KEY));
  const [customViews, setCustomViews] = useState<ViewDef[]>(() => loadCustom());
  const [viewSearch, setViewSearch] = useState('');
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewStatus, setNewViewStatus] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [selPr, setSelPr] = useState('');
  const [manItems, setManItems] = useState([{ itemName: '', quantity: '1' }]);
  const [invVendors, setInvVendors] = useState([{ vendorName: '', contactEmail: '' }]);
  const [dueDate, setDueDate] = useState('');
  const [message, setMessage] = useState('');
  const [acting, setActing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const allViews = useMemo(() => [...VIEWS, ...customViews], [customViews]);
  const activeView = allViews.find((v) => v.id === viewId) || VIEWS[0];

  useEffect(() => {
    getAllPrs().then((r: any) => setPrs(Array.isArray(r) ? r : [])).catch(() => {});
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => { setPage(0); }, [tab, viewId, query, sortKey, sortDir]);

  useEffect(() => {
    if (!moreOpen && !viewOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) { setMoreOpen(false); setSortOpen(false); }
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
    setTab('all');
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
      setData((ds: any[]) => [created, ...ds]);
      setShowNew(false); setSelPr(''); setManItems([{ itemName: '', quantity: '1' }]);
      setInvVendors([{ vendorName: '', contactEmail: '' }]); setDueDate(''); setMessage('');
    } catch (e: any) { setError(e?.message || 'Failed to create RFQ'); } finally { setActing(false); }
  };

  const tabFiltered = useMemo(() => {
    if (tab === 'pending') return data.filter((d) => ['draft', 'pending'].includes(d.status));
    if (tab === 'active') return data.filter((d) => ['submitted', 'published', 'awarded_partial'].includes(d.status));
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, tab, activeView]);

  const sorted = useMemo(() => {
    const arr = [...tabFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'rfqNumber') { av = String(a.rfqNumber ?? a.id ?? '').toLowerCase(); bv = String(b.rfqNumber ?? b.id ?? '').toLowerCase(); }
      else {
        const k = sortKey === 'awardingDate' ? (a.awardDate || a.awardingDate || a.dueDate) : a.createdAt;
        const l = sortKey === 'awardingDate' ? (b.awardDate || b.awardingDate || b.dueDate) : b.createdAt;
        av = k ? new Date(k).getTime() : 0;
        bv = l ? new Date(l).getTime() : 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [tabFiltered, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((d) => {
      const hay = `${d.rfqNumber || ''} ${d.name || ''} ${(d.lines || []).map((l: any) => l.itemName).join(' ')} ${d.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  const showGetStarted = tab === 'pending' && viewId === 'all' && !query && filtered.length === 0;

  const viewMatches = (q: string) =>
    allViews.filter((v) => v.label.toLowerCase().includes(q.trim().toLowerCase()));

  const renderViewRow = (v: ViewDef, isCustom: boolean) => {
    const selected = viewId === v.id;
    const fav = favs.includes(v.id);
    return (
      <div
        key={v.id}
        onClick={() => { setViewId(v.id); setTab('all'); setViewOpen(false); setNewViewOpen(false); }}
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

  const renderEmpty = () => {
    if (showGetStarted) {
      return (
        <div className="py-20 flex flex-col items-center text-center px-6">
          <h2 className="text-[26px] leading-snug font-semibold text-slate-900">Get Started With Request for Quotes</h2>
          <p className="text-[15px] leading-relaxed text-slate-500 mt-3 max-w-[720px]">With Requests for Quotes, you can invite vendors to submit responses for the items you need. Compare responses, negotiate better terms, and choose the best vendors before raising purchase orders.</p>
          <button onClick={() => setShowNew(true)} className="mt-6 px-5 py-2.5 rounded-md bg-[#2084FA] text-white text-[14px] font-semibold hover:bg-[#1a6fd6] flex items-center gap-2 shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            New Request for Quote
          </button>
        </div>
      );
    }
    if (tab === 'active' && viewId === 'all' && !query) {
      return <div className="py-16 text-center text-[15px] text-slate-500">There are no active request for quotes.</div>;
    }
    if (tab === 'all' && viewId === 'all' && !query) {
      return <div className="py-16 text-center text-[15px] text-slate-500">No request for quotes created in your organization.</div>;
    }
    return <div className="py-16 text-center text-[15px] text-slate-500">No request for quotes for this filter. Choose another filter or select All to view all requests.</div>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-0">
        <div className="flex items-center gap-6">
          <button
            onClick={() => { setTab('pending'); setViewId('all'); }}
            className={`relative pb-3 text-[17px] ${tab === 'pending' ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
          >
            Pending
            {tab === 'pending' && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
          </button>
          <button
            onClick={() => { setTab('active'); setViewId('all'); }}
            className={`relative pb-3 text-[17px] ${tab === 'active' ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
          >
            Active
            {tab === 'active' && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
          </button>
          <div className="relative" ref={viewRef}>
            <button
              onClick={() => { setTab('all'); setViewOpen((v) => !v); }}
              className={`pb-3 text-[17px] flex items-center gap-1 ${tab === 'all' ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
            >
              All Request for Quotes
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {tab === 'all' && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
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
        </div>
        <div className="flex items-center gap-2 pb-2">
          <button
            onClick={() => setShowNew(true)}
            className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            New Request for Quote
          </button>
          <div className="relative" ref={moreRef}>
            <button onClick={() => { setMoreOpen((v) => !v); setSortOpen(false); }} className="w-9 h-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500" aria-label="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
                <div className="relative">
                  <button onClick={() => setSortOpen((v) => !v)} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50 flex items-center justify-between">
                    <span className="flex items-center gap-2.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M7 4v13M4 14l3 3 3-3M17 20V7M14 10l3-3 3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Sort by
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {sortOpen && (
                    <div className="absolute right-full top-0 mr-1 w-52 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5">
                      {SORT_OPTIONS.map((o) => (
                        <button key={o.id} onClick={() => { setSortKey(o.id); setSortDir('desc'); setSortOpen(false); setMoreOpen(false); }} className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                          {o.label}
                          {sortKey === o.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => { load(); setMoreOpen(false); setSortOpen(false); }} className="px-4 py-2.5 mt-1 mx-2 rounded-lg bg-[#2084FA] text-white text-[14px] font-semibold hover:bg-[#1a6fd6] flex items-center justify-center gap-2" style={{ width: 'calc(100% - 16px)' }}>
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

      {showNew && (
        <div className="mx-1 mb-3 rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
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
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Create RFQ</button>
          </div>
        </div>
      )}

      {/* Column header — Zoho style (hidden on Get Started empty state) */}
      {!showGetStarted && (
      <div className="px-1">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
          <span className="col-span-2">Request for Quote#</span>
          <span className="col-span-2">Name</span>
          <span className="col-span-2">Created By</span>
          <span className="col-span-2">Awarding Date</span>
          <span className="col-span-1">Status</span>
          <span className="col-span-2">Approved By</span>
          <div className="col-span-1 flex justify-end">
            <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search request for quotes">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="py-2">
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search request for quotes"
              className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
            />
          </div>
        )}
      </div>
      )}

      {/* Rows — click opens the Zoho-style detail page */}
      <div className="flex-1 overflow-auto px-1">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading request for quotes…</div>
        ) : filtered.length === 0 ? (
          renderEmpty()
        ) : (
          <div>
            {pageRows.map((rfq: any, i: number) => {
              const itemNames = (rfq.lines || []).map((l: any) => l.itemName).join(', ');
              return (
                <div key={rfq.id || i} className="border-b border-slate-100">
                  <button
                    onClick={() => navigate(`/workspace/rfq/${rfq.id}`)}
                    className="w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center"
                  >
                    <span className="col-span-2 font-medium text-[#2084FA] hover:underline truncate">{rfq.rfqNumber || `RFQ-${i + 1}`}</span>
                    <span className="col-span-2 text-slate-700 truncate">{rfq.title || itemNames || '—'}</span>
                    <span className="col-span-2 text-slate-600 truncate">{rfq.createdByName || rfq.createdBy || '—'}</span>
                    <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(rfq.awardDate || rfq.awardingDate || rfq.dueDate)}</span>
                    <span className="col-span-1"><DocStatusPill status={rfq.status} /></span>
                    <span className="col-span-2 text-slate-600 truncate">{rfq.approvedByName || rfq.approvedBy || '—'}</span>
                    <span className="col-span-1" />
                  </button>
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
    </div>
  );
}
