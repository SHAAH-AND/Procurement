import { useState, useEffect, useMemo, useRef } from 'react';
import { PrForm, PrDetail } from '../shared/components';
import { PrStatusPill, prTotal } from '../shared/hooks';
import { getAllPrs, createPr, updatePr, prAction } from '../../../api';

type SortKey = 'createdAt' | 'prNumber' | 'amount';

type ViewDef = { id: string; label: string; status: string | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', status: null },
  { id: 'draft', label: 'Draft', status: 'draft' },
  { id: 'awaiting', label: 'Awaiting Approval', status: 'awaiting' },
  { id: 'approved', label: 'Approved', status: 'approved' },
  { id: 'rejected', label: 'Rejected', status: 'rejected' },
  { id: 'onhold', label: 'On Hold', status: 'onhold' },
  { id: 'yet_to_order', label: 'Yet To Be Ordered', status: 'approved' },
  { id: 'processed', label: 'Processed', status: 'processed' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled' },
];

const VIEW_STATUSES = ['draft', 'awaiting', 'approved', 'rejected', 'onhold', 'processed', 'cancelled'];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'createdAt', label: 'Submitted On' },
  { id: 'prNumber', label: 'Request #' },
  { id: 'amount', label: 'Amount' },
];

const PAGE_SIZE = 25;
const FAV_KEY = 'pf-pr-views-fav';
const CUSTOM_KEY = 'pf-pr-views-custom';

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
      .map((v: any) => ({ id: v.id, label: v.label, status: typeof v.status === 'string' ? v.status : null }));
  } catch { return []; }
}

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const submitterOf = (row: any) =>
  row.submitterName || row.requesterName || row.createdByName || row.createdBy || '—';

const approverOf = (row: any) =>
  row.approverName || (row.approverId ? String(row.approverId).slice(0, 8) : '—');

export function PrPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewId, setViewId] = useState('all');
  const [favs, setFavs] = useState<string[]>(() => loadIds(FAV_KEY));
  const [customViews, setCustomViews] = useState<ViewDef[]>(() => loadCustom());
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewStatus, setNewViewStatus] = useState('awaiting');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const allViews = useMemo(() => [...VIEWS, ...customViews], [customViews]);
  const activeView = allViews.find((v) => v.id === viewId) || VIEWS[0];

  const load = () => {
    setLoading(true);
    setError('');
    getAllPrs()
      .then((r: any) => setData(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => { setPage(0); }, [viewId, query, sortKey, sortDir]);

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
    const view: ViewDef = { id: `custom-${Date.now()}`, label, status: newViewStatus === 'all' ? null : newViewStatus };
    setCustomViews((vs) => {
      const next = [...vs, view];
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setViewId(view.id);
    setNewViewName('');
    setNewViewStatus('awaiting');
    setNewViewOpen(false);
    setViewOpen(false);
  };

  const deleteCustomView = (id: string) => {
    setCustomViews((vs) => {
      const next = vs.filter((v) => v.id !== id);
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    if (viewId === id) { setViewId('all'); }
  };

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

  const viewFiltered = useMemo(() => {
    if (!activeView.status) return data;
    return data.filter((d) => d.status === activeView.status);
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'amount') { av = prTotal(a); bv = prTotal(b); }
      else if (sortKey === 'createdAt') {
        av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      } else { av = String(a.prNumber ?? a.id ?? '').toLowerCase(); bv = String(b.prNumber ?? b.id ?? '').toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [viewFiltered, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((d) => {
      const hay = `${d.prNumber || ''} ${d.reason || ''} ${d.reference || ''} ${submitterOf(d)} ${approverOf(d)} ${d.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  const requestedLines = useMemo(() => {
    const lines: any[] = [];
    filtered.forEach((pr: any) => {
      (pr.lines || []).forEach((l: any) => {
        lines.push({
          prNumber: pr.prNumber || pr.id || '—',
          itemName: l.itemName || '—',
          quantity: Number(l.quantity || 0),
          rate: Number(l.estimatedRate || 0),
        });
      });
    });
    return lines;
  }, [filtered]);
  const requestedTotal = requestedLines.reduce((s, l) => s + l.quantity * l.rate, 0);

  const emptyMessage = viewId === 'all'
    ? 'Requests have not been submitted for approval yet'
    : 'No purchase requests for this filter. Choose another filter or select All to view all requests';

  const awaitingActive = viewId === 'awaiting';
  const approvedActive = viewId === 'approved' || viewId === 'yet_to_order';
  const allActive = !awaitingActive && !approvedActive;

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
      {/* Tab band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-0">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setViewId('awaiting')}
            className={`relative pb-3 text-[17px] ${awaitingActive ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
          >
            Awaiting Approval
            {awaitingActive && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
          </button>
          <button
            onClick={() => setViewId('approved')}
            className={`relative pb-3 text-[17px] ${approvedActive ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
          >
            Approved
            {approvedActive && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
          </button>
          <div className="relative" ref={viewRef}>
            <button
              onClick={() => { setViewId('all'); setViewOpen((v) => !v); }}
              className={`pb-3 text-[17px] flex items-center gap-1 ${allActive ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
            >
              All Requests
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {allActive && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
            {viewOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
                <div className="max-h-72 overflow-y-auto py-0.5">
                  {VIEWS.map((v) => renderViewRow(v, false))}
                  {customViews.length > 0 && (
                    <>
                      <div className="border-t border-slate-100 my-1.5" />
                      {customViews.map((v) => renderViewRow(v, true))}
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
                        autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
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
        <div className="flex items-center gap-3 pb-2">
          <button
            onClick={() => { setShowCreate(true); setEditing(null); }}
            className="px-3.5 h-8 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] flex items-center gap-1.5 whitespace-nowrap shadow-sm"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            New
          </button>
          <button onClick={() => setItemsOpen(true)} className="flex items-center gap-1.5 text-[14px] font-semibold text-[#2084FA] hover:text-[#1a6fd6] whitespace-nowrap">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 8h14l-1.2 12H6.2L5 8z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><path d="M8.5 8V6.5a3.5 3.5 0 017 0V8" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
            View Requested Items
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
                    <div className="absolute right-full top-0 mr-1 w-48 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5">
                      {SORT_OPTIONS.map((o) => (
                        <button key={o.id} onClick={() => { setSortKey(o.id); setSortDir(o.id === 'prNumber' ? 'asc' : 'desc'); setSortOpen(false); setMoreOpen(false); }} className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
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

      {/* Column header — Zoho style */}
      <div className="px-1">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
          <div className="col-span-1">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" aria-label="Select all" />
          </div>
          <span className="col-span-2">Submitter</span>
          <span className="col-span-2">Request#</span>
          <span className="col-span-2">Expected Date</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-1">Approver</span>
          <span className="col-span-1 text-right">Amount</span>
          <div className="col-span-1 flex justify-end">
            <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search purchase requests">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="py-2">
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search purchase requests"
              className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
            />
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto px-1">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading purchase requests…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[15px] text-slate-500">{emptyMessage}</div>
        ) : (
          <div>
            {pageRows.map((row: any, i: number) => {
              const open = openId === row.id;
              return (
                <div key={row.id || row.ROWID || i} className="border-b border-slate-100">
                  <button
                    onClick={() => setOpenId(open ? null : row.id)}
                    className="w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center"
                  >
                    <span className="col-span-1" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" aria-label={`Select ${row.prNumber || 'request'}`} />
                    </span>
                    <span className="col-span-2 text-slate-700 truncate">{submitterOf(row)}</span>
                    <span className="col-span-2 min-w-0">
                      <span className="font-medium text-[#2084FA] hover:underline truncate block">{row.prNumber || row.id || `PR-${i + 1}`}</span>
                      <span className="text-xs text-slate-400 truncate block">{row.reason || 'No reason'}</span>
                    </span>
                    <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(row.expectedDate)}</span>
                    <span className="col-span-2"><PrStatusPill status={row.status} /></span>
                    <span className="col-span-1 text-slate-600 truncate">{approverOf(row)}</span>
                    <span className="col-span-1 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(prTotal(row))}</span>
                    <span className="col-span-1" />
                  </button>
                  {open && (
                    <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                      <div className="flex justify-end gap-2 mb-3">
                        {['draft', 'rejected'].includes(row.status) && (
                          <button onClick={() => setEditing(row)} className="px-3 h-8 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100">Edit</button>
                        )}
                      </div>
                      <PrDetail pr={row} acting={acting} showApprove onAction={(a, b) => handleAction(row.id, a, b)} />
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

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4" onClick={() => { setShowCreate(false); setError(''); }}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">New Purchase Request</h3>
              <button onClick={() => { setShowCreate(false); setError(''); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              <PrForm submitting={submitting} onSubmit={handleCreate} onCancel={() => { setShowCreate(false); setError(''); }} />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4" onClick={() => { setEditing(null); setError(''); }}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit {editing.prNumber || 'Request'}</h3>
              <button onClick={() => { setEditing(null); setError(''); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              <PrForm initial={editing} submitting={submitting} onSubmit={handleUpdate} onCancel={() => { setEditing(null); setError(''); }} />
            </div>
          </div>
        </div>
      )}

      {itemsOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4" onClick={() => setItemsOpen(false)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Requested Items</h3>
              <button onClick={() => setItemsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5">
              {requestedLines.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">No requested items in the current view.</div>
              ) : (
                <>
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <span className="col-span-3">Request#</span>
                    <span className="col-span-5">Item</span>
                    <span className="col-span-2 text-right">Qty</span>
                    <span className="col-span-2 text-right">Amount</span>
                  </div>
                  {requestedLines.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2.5 border-t border-slate-100 text-[13px]">
                      <span className="col-span-3 font-medium text-[#2084FA] truncate">{l.prNumber}</span>
                      <span className="col-span-5 text-slate-700 truncate">{l.itemName}</span>
                      <span className="col-span-2 text-right text-slate-600 tabular-nums">{l.quantity}</span>
                      <span className="col-span-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(l.quantity * l.rate)}</span>
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 px-3 py-3 border-t border-slate-200 text-sm">
                    <span className="text-slate-500">Total</span>
                    <span className="font-bold text-slate-900 tabular-nums">{fmtMoney(requestedTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
