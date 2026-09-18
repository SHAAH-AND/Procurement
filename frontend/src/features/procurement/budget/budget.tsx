import { useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getBudgets, updateBudget, deleteBudget } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'active', label: 'Active', statuses: ['active'] },
  { id: 'archived', label: 'Archived', statuses: ['archived'] },
];

const SORT_OPTIONS = [
  { id: 'createdAt', label: 'Created Time' },
  { id: 'name', label: 'Name' },
  { id: 'total', label: 'Total' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const budgetTotal = (b: any) => Number(b.total ?? (b.lines || []).reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0));

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function periodColumns(b: any): { label: string; index: number }[] {
  const start = b.fiscalStart ? new Date(b.fiscalStart) : new Date();
  const y = start.getFullYear();
  const m = start.getMonth();
  if (b.period === 'quarterly') {
    return [0, 1, 2, 3].map((q) => ({
      label: `Q${q + 1} ${y + (m + q * 3 > 11 ? 1 : 0)}`,
      index: q,
    }));
  }
  if (b.period === 'yearly') return [{ label: `FY ${y}`, index: 0 }];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m + i, 1);
    return { label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, index: i };
  });
}

export function BudgetsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, setData, loading, error, setError, load } = useDocList(getBudgets);
  const [viewId, setViewId] = useState('all');
  const [viewOpen, setViewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState((location.state as any)?.notice || '');
  const [menuAnchor, setMenuAnchor] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  const closeAll = (e: MouseEvent) => {
    if (moreRef.current && !moreRef.current.contains(e.target as Node)) { setMoreOpen(false); setSortOpen(false); }
    if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
  };

  const activeView = VIEWS.find((v) => v.id === viewId) || VIEWS[0];

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'name') { av = String(a.name || '').toLowerCase(); bv = String(b.name || '').toLowerCase(); }
      else if (sortKey === 'total') { av = budgetTotal(a); bv = budgetTotal(b); }
      else { av = a.createdAt ? new Date(a.createdAt).getTime() : 0; bv = b.createdAt ? new Date(b.createdAt).getTime() : 0; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [viewFiltered, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((b: any) =>
      `${b.name || ''} ${b.fiscalYear || ''} ${b.tag || ''} ${b.status || ''}`.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const isEmpty = !loading && data.length === 0 && !query;

  const confirmBudget = confirmId ? data.find((d: any) => d.id === confirmId) : null;
  const menuBudget = menuAnchor && !confirmId ? data.find((d: any) => d.id === menuAnchor.id) : null;

  const openMenu = (id: string, anchor: HTMLElement) => {
    if (menuAnchor?.id === id) { setMenuAnchor(null); return; }
    const rect = anchor.getBoundingClientRect();
    const MENU_H = 140;
    const top = rect.bottom + 4 + MENU_H > window.innerHeight
      ? Math.max(8, rect.top - MENU_H - 4)
      : rect.bottom + 4;
    setMenuAnchor({ id, top, left: Math.max(8, rect.right - 160) });
  };

  const doArchive = async (b: any, archive: boolean) => {
    setMenuAnchor(null);
    setActing(true);
    setError('');
    try {
      const updated: any = await updateBudget(b.id, { status: archive ? 'archived' : 'active' });
      const rec = updated?.data ?? updated;
      if (rec?.id) setData((ds: any[]) => ds.map((d: any) => (d.id === rec.id ? rec : d)));
      else load();
      setNotice(archive ? `Budget "${b.name}" archived.` : `Budget "${b.name}" restored.`);
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const doDelete = async (id: string) => {
    const target = data.find((d: any) => d.id === id);
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteBudget(id);
      setData((ds: any[]) => ds.filter((d: any) => d.id !== id));
      if (openId === id) setOpenId(null);
      setConfirmId(null);
      setMenuAnchor(null);
      setNotice(`Budget "${target?.name || ''}" deleted.`);
    } catch (e: any) { setDeleteError(e?.message || 'Delete failed'); } finally { setDeleting(false); }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Fiscal Year', 'Period', 'Type', 'Tag', 'Total', 'Status'],
      ...filtered.map((b: any) => [
        b.name || '', b.fiscalYear || '', b.period || '', b.budgetType || '', b.tag || '',
        budgetTotal(b).toFixed(2), b.status || '',
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budgets.csv';
    a.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
    setSortOpen(false);
  };

  return (
    <div
      className="flex flex-col h-full min-h-0"
      onMouseDownCapture={(e) => { if (moreOpen || viewOpen) closeAll(e.nativeEvent); }}
    >
      {/* Title band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3 shrink-0">
        <div className="relative" ref={viewRef}>
          <button
            onClick={() => setViewOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[20px] font-bold text-slate-900 leading-tight"
          >
            {activeView.id === 'all' ? 'All Budgets' : `${activeView.label} Budgets`}
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {viewOpen && (
            <div className="absolute left-0 top-full mt-1 w-52 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-30">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => { setViewId(v.id); setViewOpen(false); }}
                  className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  {v.id === 'all' ? 'All Budgets' : `${v.label} Budgets`}
                  {viewId === v.id && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('new')}
            className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] flex items-center gap-1.5 shadow-sm"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            New
          </button>
          <div className="relative" ref={moreRef}>
            <button onClick={() => { setMoreOpen((v) => !v); setSortOpen(false); }} className="w-9 h-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500" aria-label="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 w-60 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
                <div className="relative">
                  <button onClick={() => setSortOpen((v) => !v)} className="w-full px-4 py-2.5 text-[14px] text-left text-[#2084FA] hover:bg-slate-50 flex items-center justify-between font-medium">
                    <span className="flex items-center gap-2.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 4v13M4 14l3 3 3-3M17 20V7M14 10l3-3 3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Sort by
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {sortOpen && (
                    <div className="absolute right-full top-0 mr-1 w-52 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5">
                      {SORT_OPTIONS.map((o) => (
                        <button key={o.id} onClick={() => { setSortKey(o.id); setSortOpen(false); setMoreOpen(false); }} className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                          {o.label}
                          {sortKey === o.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1 pt-1 flex">
                        <button onClick={() => { setSortDir('asc'); setSortOpen(false); setMoreOpen(false); }} className={`flex-1 px-4 py-2 text-[13px] ${sortDir === 'asc' ? 'text-[#2084FA] font-semibold' : 'text-slate-600'}`}>Ascending</button>
                        <button onClick={() => { setSortDir('desc'); setSortOpen(false); setMoreOpen(false); }} className={`flex-1 px-4 py-2 text-[13px] ${sortDir === 'desc' ? 'text-[#2084FA] font-semibold' : 'text-slate-600'}`}>Descending</button>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={exportCsv} className="w-full px-4 py-2.5 text-[14px] text-left text-white bg-[#2084FA] hover:bg-[#1a6fd6] mx-2 rounded-lg flex items-center justify-between" style={{ width: 'calc(100% - 16px)' }}>
                  Export
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button onClick={() => { load(); setMoreOpen(false); setSortOpen(false); }} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50 flex items-center gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Refresh List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3 shrink-0" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3 shrink-0" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {isEmpty ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="py-14 flex flex-col items-center text-center px-6">
            <span className="w-16 h-16 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-center mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-slate-700"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.7} /><path d="M3 9h18M8 4v5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
            </span>
            <h2 className="text-[26px] leading-snug font-medium text-slate-900">Enforce budgets</h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-xl">Create budgets for individual expense categories, cost centers, departments, and users. Notify users when a threshold is exceeded and block expenses when limit is reached.</p>
            <button onClick={() => navigate('new')} className="mt-6 px-5 h-10 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" /></svg>
              New Budget
            </button>
            <button onClick={() => setNotice('Budgets cap spend per category and month. Create one above, then open it to fill the fiscal grid — totals update live.')} className="mt-3 text-[14px] font-medium text-[#2084FA] hover:underline">Learn More</button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-1 shrink-0 overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <span className="col-span-3">Name</span>
                <span className="col-span-2">Fiscal Year</span>
                <span className="col-span-1">Period</span>
                <span className="col-span-2 text-right">Total</span>
                <span className="col-span-2">Tag</span>
                <span className="col-span-1">Status</span>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search budgets">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
              {searchOpen && (
                <div className="py-2">
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search budgets"
                    className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-1">
            <div className="min-w-[920px]">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading budgets…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-[15px] text-slate-500">No budgets for this filter.</div>
              ) : (
                <div>
                  {filtered.map((b: any) => {
                    const open = openId === b.id;
                    const cols = periodColumns(b);
                    const cats: string[] = Array.from(new Set((b.lines || []).map((l: any) => l.category || 'All')));
                    return (
                      <div key={b.id} className="border-b border-slate-100">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenId(open ? null : b.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : b.id); } }}
                          className="group relative w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center cursor-pointer focus:outline-none focus:bg-slate-50"
                        >
                          <span className="col-span-3 font-medium text-[#2084FA] hover:underline truncate">{b.name || '—'}</span>
                          <span className="col-span-2 text-slate-600 truncate">{b.fiscalYear || '—'}</span>
                          <span className="col-span-1 text-slate-600 capitalize">{b.period || '—'}</span>
                          <span className="col-span-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(budgetTotal(b))}</span>
                          <span className="col-span-2 text-slate-600 truncate">{b.tag || '—'}</span>
                          <span className="col-span-1"><DocStatusPill status={b.status} /></span>
                          <span className="col-span-1 flex justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); openMenu(b.id, e.currentTarget); }}
                              className={`w-7 h-7 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-opacity shrink-0 ${menuAnchor?.id === b.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                              aria-label={`Actions for ${b.name || 'budget'}`}
                              title="More actions"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
                            </button>
                          </span>
                        </div>
                        {open && (
                          <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                              <div className="min-w-[640px]">
                                <div className="grid gap-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200" style={{ gridTemplateColumns: `minmax(140px,1.2fr) repeat(${cols.length}, minmax(90px,1fr)) minmax(90px,0.8fr)` }}>
                                  <span className="px-3 py-2 border-r border-slate-100">Category</span>
                                  {cols.map((c) => <span key={c.index} className="px-2 py-2 border-r border-slate-100 text-right">{c.label}</span>)}
                                  <span className="px-2 py-2 text-right">Total</span>
                                </div>
                                {(cats.length ? cats : ['All']).map((cat) => {
                                  const catTotal = (b.lines || []).filter((l: any) => (l.category || 'All') === cat).reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
                                  return (
                                    <div key={cat} className="grid gap-0 text-[13px] border-b border-slate-100 last:border-0" style={{ gridTemplateColumns: `minmax(140px,1.2fr) repeat(${cols.length}, minmax(90px,1fr)) minmax(90px,0.8fr)` }}>
                                      <span className="px-3 py-1.5 border-r border-slate-100 font-medium text-slate-800 truncate">{cat}</span>
                                      {cols.map((c) => {
                                        const line = (b.lines || []).find((l: any) => (l.category || 'All') === cat && l.monthIndex === c.index);
                                        return <span key={c.index} className="px-2 py-1.5 border-r border-slate-100 text-right tabular-nums text-slate-600">{fmtMoney(Number(line?.amount) || 0)}</span>;
                                      })}
                                      <span className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtMoney(catTotal)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Row menu — fixed to viewport so no scroll container or stacking context can trap it */}
      {menuAnchor && !confirmId && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuAnchor(null)} />
      )}
      {menuBudget && menuAnchor && !confirmId && (
        <div
          className="fixed w-40 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-50"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenuAnchor(null); navigate(`${menuBudget.id}/edit`); }}
            className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
            Edit
          </button>
          <button
            onClick={() => doArchive(menuBudget, menuBudget.status !== 'archived')}
            disabled={acting}
            className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.7} /><path d="M3 9h18" stroke="currentColor" strokeWidth={1.7} /></svg>
            {menuBudget.status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button
            onClick={() => { setMenuAnchor(null); setDeleteError(''); setConfirmId(menuBudget.id); }}
            className="w-full px-4 py-2 text-[13px] text-left text-rose-600 font-medium hover:bg-rose-50 flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a1 1 0 01-1 .9H7.8a1 1 0 01-1-.9L6 7" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
            Delete
          </button>
        </div>
      )}
      {/* Delete confirm */}
      {confirmBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => { if (!deleting) { setConfirmId(null); setDeleteError(''); } }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-slate-900">Delete "{confirmBudget.name}"?</h3>
            <p className="text-[13px] text-slate-500 mt-1.5">
              This permanently removes the budget and its fiscal grid. This cannot be undone.
            </p>
            {deleteError && (
              <p className="mt-2.5 rounded-md px-3 py-2 text-[13px] font-medium bg-rose-50 border border-rose-200 text-rose-700" role="alert">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setConfirmId(null); setDeleteError(''); }}
                disabled={deleting}
                className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(confirmBudget.id)}
                disabled={deleting}
                className="px-4 h-9 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60 shadow-sm"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
