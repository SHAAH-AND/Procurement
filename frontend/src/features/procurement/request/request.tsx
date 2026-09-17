import { useState, useEffect, useMemo, useRef } from 'react';
import { PrForm, PrDetail } from '../shared/components';
import { PrStatusPill, prTotal } from '../shared/hooks';
import lockIcon from './assets/lock.svg';
import { getMyPrs, createPr, updatePr, prAction } from '../../../api';

type SortKey = 'prNumber' | 'createdAt' | 'expectedDate' | 'status' | 'amount';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'draft' | 'awaiting' | 'approved' | 'rejected' | 'processed' | 'cancelled';

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All Requests' },
  { id: 'draft', label: 'Draft' },
  { id: 'awaiting', label: 'Awaiting Approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'processed', label: 'Processed' },
  { id: 'cancelled', label: 'Canceled' },
];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'createdAt', label: 'Submitted On' },
  { id: 'prNumber', label: 'Request #' },
  { id: 'expectedDate', label: 'Expected Date' },
  { id: 'status', label: 'Status' },
  { id: 'amount', label: 'Amount' },
];

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAGE_SIZE = 25;

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-slate-300 ml-0.5"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#2084FA] ml-0.5"><path d={dir === 'asc' ? 'M8 15l4-4 4 4' : 'M8 9l4 4 4-4'} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function RequestsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    setError('');
    getMyPrs()
      .then((r: any) => setData(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => { setPage(0); }, [statusFilter, query, sortKey, sortDir]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setShowCreate(true); setEditing(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'prNumber' || key === 'status' ? 'asc' : 'desc'); }
  };

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'amount') { av = prTotal(a); bv = prTotal(b); }
      else if (sortKey === 'createdAt' || sortKey === 'expectedDate') {
        av = a[sortKey] ? new Date(a[sortKey]).getTime() : 0;
        bv = b[sortKey] ? new Date(b[sortKey]).getTime() : 0;
      } else { av = String(a[sortKey] ?? '').toLowerCase(); bv = String(b[sortKey] ?? '').toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${d.prNumber || ''} ${d.reason || ''} ${d.reference || ''} ${d.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, statusFilter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  const isEmpty = !loading && filtered.length === 0 && statusFilter === 'all' && !query && !showCreate && !editing;

  const currentStatusLabel = STATUS_OPTIONS.find((o) => o.id === statusFilter)?.label || 'All Requests';

  return (
    <div className="flex flex-col h-full">
      {!isEmpty && (
      <>
      {/* Top band — title left, actions right (Zoho pattern) */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3">
        <h2 className="text-[18px] font-semibold text-[#07175A] leading-tight">Purchase Requests</h2>
        <div className="flex items-center gap-2">
          {/* Search */}
          {searchOpen ? (
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                onBlur={() => { if (!query) setSearchOpen(false); }}
                placeholder="Search"
                className="h-8 w-56 pl-8 pr-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
              />
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)} className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}

          {/* Refresh */}
          <button onClick={load} className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Refresh" title="Refresh List">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          {/* More dropdown — filter + sort (Zoho "More" icon) */}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen((v) => !v)} className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500" aria-label="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="19" r="1.6" fill="currentColor" /></svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 w-60 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-30">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Filter By Status</div>
                {STATUS_OPTIONS.map((o) => (
                  <button key={o.id} onClick={() => { setStatusFilter(o.id); setMoreOpen(false); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                    {o.label}
                    {statusFilter === o.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                ))}
                <div className="border-t border-slate-100 my-1" />
                <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sort By</div>
                {SORT_OPTIONS.map((o) => (
                  <button key={o.id} onClick={() => { toggleSort(o.id); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                    {o.label}
                    {sortKey === o.id && <SortArrow active dir={sortDir} />}
                  </button>
                ))}
                <div className="border-t border-slate-100 my-1" />
                <button onClick={() => { setMoreOpen(false); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50">Refresh List</button>
              </div>
            )}
          </div>

          {/* New */}
          <button
            onClick={() => { setShowCreate(true); setEditing(null); }}
            className="px-3.5 h-8 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] flex items-center gap-1.5 whitespace-nowrap"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            New
          </button>
        </div>
      </div>

      {/* Active filter indicator line */}
      {(statusFilter !== 'all' || query) && (
        <div className="px-1 pb-2 text-[12px] text-slate-500 flex items-center gap-2">
          <span>Filtering: <span className="font-medium text-slate-700">{currentStatusLabel}</span>{query && <span className="ml-1">· search: "{query}"</span>}</span>
          <button onClick={() => { setStatusFilter('all'); setQuery(''); }} className="text-[#2084FA] hover:underline">Clear</button>
        </div>
      )}
      </>
      )}

      {isEmpty ? (
        /* Zoho getting-started — no title band, no table chrome, exactly like Zoho */
        <div className="flex-1 overflow-auto">
          <div className="py-24 flex flex-col items-center text-center px-6">
            <div className="w-[72px] h-[72px] rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.08)] flex items-center justify-center mb-6">
              <img src={lockIcon} alt="" className="w-[44px] h-[44px] text-slate-800" />
            </div>
            <h2 className="text-[27px] leading-[1.25] font-bold text-slate-900">Get Started with Purchase<br />Requests</h2>
            <p className="text-[15px] leading-relaxed text-slate-500 mt-3 max-w-[520px]">With Purchase Requests, you can get prior approval for your business purchases. Once approved, you can associate the same to the actual expense created.</p>
            <button onClick={() => setShowCreate(true)} className="mt-6 px-5 py-2.5 rounded-md bg-[#2084FA] text-white text-[14px] font-semibold hover:bg-[#1a6fd6] flex items-center gap-2 shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              New Purchase Request
            </button>
          </div>
        </div>
      ) : (
      /* Flat table — no card, no rounded box, no shadow (Zoho list style) */
      <div className="flex-1 overflow-auto px-1">

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

        <div className="min-w-[760px]">
          {/* Column header row */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-[#f4f6fb] border-y border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
            <button onClick={() => toggleSort('prNumber')} className="col-span-3 flex items-center hover:text-slate-700 text-left">
              Request #<SortArrow active={sortKey === 'prNumber'} dir={sortDir} />
            </button>
            <button onClick={() => toggleSort('createdAt')} className="col-span-2 flex items-center hover:text-slate-700 text-left">
              Submitted On<SortArrow active={sortKey === 'createdAt'} dir={sortDir} />
            </button>
            <button onClick={() => toggleSort('expectedDate')} className="col-span-2 flex items-center hover:text-slate-700 text-left">
              Expected Date<SortArrow active={sortKey === 'expectedDate'} dir={sortDir} />
            </button>
            <button onClick={() => toggleSort('status')} className="col-span-2 flex items-center hover:text-slate-700 text-left">
              Status<SortArrow active={sortKey === 'status'} dir={sortDir} />
            </button>
            <span className="col-span-2">Approver</span>
            <button onClick={() => toggleSort('amount')} className="col-span-1 flex items-center justify-end hover:text-slate-700 text-right">
              Amount<SortArrow active={sortKey === 'amount'} dir={sortDir} />
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading purchase requests…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">No Records Found</div>
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
                      <span className="col-span-3 min-w-0">
                        <span className="font-medium text-[#2084FA] hover:underline truncate block">{row.prNumber || row.id || `PR-${i + 1}`}</span>
                        <span className="text-xs text-slate-400 truncate block">{row.reason || 'No reason'}</span>
                      </span>
                      <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(row.createdAt)}</span>
                      <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(row.expectedDate)}</span>
                      <span className="col-span-2"><PrStatusPill status={row.status} /></span>
                      <span className="col-span-2 text-slate-600 truncate">{row.approverId ? row.approverName || row.approverId.slice(0, 8) : '—'}</span>
                      <span className="col-span-1 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(prTotal(row))}</span>
                    </button>
                    {open && (
                      <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                        <div className="flex justify-end gap-2 mb-3">
                          {['draft', 'rejected'].includes(row.status) && (
                            <button onClick={() => setEditing(row)} className="px-3 h-8 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100">Edit</button>
                          )}
                        </div>
                        <PrDetail pr={row} acting={acting} showApprove={false} onAction={(a, b) => handleAction(row.id, a, b)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination footer — flat */}
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
      )}

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
    </div>
  );
}
