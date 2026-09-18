import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getReceives, createReceiveFromPo, receiveAction, getPos } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'draft', label: 'Draft', statuses: ['draft'] },
  { id: 'completed', label: 'Completed', statuses: ['completed'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

const VIEW_STATUSES = ['draft', 'completed', 'cancelled'];

const SORT_OPTIONS = [
  { id: 'createdAt', label: 'Received Date' },
  { id: 'grnNumber', label: 'GRN #' },
  { id: 'poNumber', label: 'Purchase Order #' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const PAGE_SIZE = 25;
const FAV_KEY = 'pf-rec-views-fav';
const CUSTOM_KEY = 'pf-rec-views-custom';

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

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function ReceivesPage() {
  const navigate = useNavigate();
  const { data, setData, loading, error, setError, load } = useDocList(getReceives);
  const [pos, setPos] = useState<any[]>([]);
  const [viewId, setViewId] = useState('all');
  const [favs, setFavs] = useState<string[]>(() => loadIds(FAV_KEY));
  const [customViews, setCustomViews] = useState<ViewDef[]>(() => loadCustom());
  const [viewSearch, setViewSearch] = useState('');
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewStatus, setNewViewStatus] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState('');
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
  const importRef = useRef<HTMLInputElement>(null);

  const allViews = useMemo(() => [...VIEWS, ...customViews], [customViews]);
  const activeView = allViews.find((v) => v.id === viewId) || VIEWS[0];

  useEffect(() => {
    getPos().then((r: any) => setPos(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

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
      const updated = await receiveAction(id, action);
      setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'grnNumber') { av = String(a.grnNumber ?? '').toLowerCase(); bv = String(b.grnNumber ?? '').toLowerCase(); }
      else if (sortKey === 'poNumber') { av = String(a.po?.poNumber ?? '').toLowerCase(); bv = String(b.po?.poNumber ?? '').toLowerCase(); }
      else { av = a.receivedAt || a.createdAt ? new Date(a.receivedAt || a.createdAt).getTime() : 0; bv = b.receivedAt || b.createdAt ? new Date(b.receivedAt || b.createdAt).getTime() : 0; }
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
      const hay = `${d.grnNumber || ''} ${d.po?.poNumber || ''} ${d.status || ''} ${(d.lines || []).map((l: any) => l.itemName).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  const isEmpty = !loading && data.length === 0 && !query;

  const exportCsv = () => {
    const rows = [
      ['GRN#', 'PO#', 'Vendor', 'Received Date', 'Status', 'Items'],
      ...filtered.map((r: any) => [
        r.grnNumber || '',
        r.po?.poNumber || '',
        r.po?.vendorName || '',
        r.receivedAt || r.createdAt || '',
        r.status || '',
        (r.lines || []).map((l: any) => `${l.itemName} x${l.quantity}`).join('; '),
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purchase-receives.csv';
    a.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
    setSortOpen(false);
  };

  const importCsv = async (file: File) => {
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) throw new Error('File is empty');
      const header = rows[0].map((c) => c.trim().toLowerCase());
      const ix = {
        po: header.indexOf('ponumber'),
        item: header.indexOf('itemname'),
        qty: header.indexOf('quantity'),
        date: header.indexOf('receivedat'),
        notes: header.indexOf('notes'),
      };
      if (ix.po < 0 || ix.item < 0 || ix.qty < 0) throw new Error('Need columns: poNumber, itemName, quantity');
      const body = rows.slice(1);
      const groups = new Map<string, { item: string; qty: number; date: string; notes: string }[]>();
      body.forEach((r) => {
        const po = (r[ix.po] || '').trim();
        const qty = Number(r[ix.qty] || 0);
        if (!po || !r[ix.item]?.trim() || !(qty > 0)) return;
        if (!groups.has(po)) groups.set(po, []);
        groups.get(po)!.push({ item: r[ix.item].trim(), qty, date: ix.date >= 0 ? r[ix.date].trim() : '', notes: ix.notes >= 0 ? r[ix.notes] : '' });
      });
      let created = 0;
      const skipped: string[] = [];
      for (const [poNumber, lines] of groups) {
        const po = pos.find((p: any) => p.poNumber === poNumber);
        if (!po) { skipped.push(`${poNumber} (order not found)`); continue; }
        const mapped = [];
        for (const l of lines) {
          const pl = (po.lines || []).find((x: any) => String(x.itemName || '').toLowerCase() === l.item.toLowerCase());
          if (!pl) { skipped.push(`${poNumber} / ${l.item} (item not on order)`); continue; }
          const open = (pl.quantity || 0) - (pl.receivedQty || 0);
          if (l.qty > open) { skipped.push(`${poNumber} / ${l.item} (only ${open} open)`); continue; }
          mapped.push({ poLineId: pl.id, quantity: l.qty });
        }
        if (!mapped.length) continue;
        try {
          const rec: any = await createReceiveFromPo({
            poId: po.id,
            lines: mapped,
            receivedAt: lines[0].date || undefined,
            notes: lines[0].notes || undefined,
          });
          setData((ds) => [rec, ...ds]);
          created++;
        } catch (e: any) { skipped.push(`${poNumber} (${e?.message || 'failed'})`); }
      }
      setNotice(`Import done: ${created} receive(s) created${skipped.length ? `. Skipped: ${skipped.slice(0, 5).join('; ')}${skipped.length > 5 ? ` (+${skipped.length - 5} more)` : ''}` : '.'}`);
      load();
    } catch (e: any) { setError(e?.message || 'Import failed'); }
    setMoreOpen(false);
    setSortOpen(false);
  };

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
            All Purchase Receives
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
        <div className="flex items-center gap-2 pb-2">
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
              <div className="absolute right-0 top-full mt-1 w-60 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
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
                <button onClick={() => importRef.current?.click()} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50 flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Import Purchase Receives
                </button>
                <button onClick={exportCsv} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50 flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Export Purchase Receives
                </button>
                <button onClick={() => { load(); setMoreOpen(false); setSortOpen(false); }} className="px-4 py-2.5 mt-1 mx-2 rounded-lg bg-[#2084FA] text-white text-[14px] font-semibold hover:bg-[#1a6fd6] flex items-center justify-center gap-2" style={{ width: 'calc(100% - 16px)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Refresh List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {isEmpty ? (
        /* Zoho getting-started */
        <div className="flex-1 overflow-auto">
          <div className="py-20 flex flex-col items-center text-center px-6">
            <h2 className="text-[26px] leading-snug font-medium text-slate-900">Record Received Purchases Accurately</h2>
            <p className="text-[15px] text-slate-500 mt-3">Log items received from your vendors.</p>
            <button onClick={() => navigate('new')} className="mt-6 px-6 py-2.5 rounded-md bg-[#2084FA] text-white text-[13px] font-bold tracking-wide hover:bg-[#1a6fd6] shadow-sm">
              RECEIVE ITEMS
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Column header — Zoho style */}
          <div className="px-1">
            <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              <span className="col-span-2">Receive#</span>
              <span className="col-span-2">Purchase Order#</span>
              <span className="col-span-3">Vendor</span>
              <span className="col-span-2">Received Date</span>
              <span className="col-span-1">Status</span>
              <span className="col-span-1 text-right">Items</span>
              <div className="col-span-1 flex justify-end">
                <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search purchase receives">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            {searchOpen && (
              <div className="py-2">
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search purchase receives"
                  className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                />
              </div>
            )}
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-auto px-1">
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading purchase receives…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[15px] text-slate-500">No purchase receives for this filter. Choose another filter or select All to view all receives.</div>
            ) : (
              <div>
                {pageRows.map((r: any, i: number) => {
                  const open = openId === r.id;
                  return (
                    <div key={r.id || i} className="border-b border-slate-100">
                      <button
                        onClick={() => setOpenId(open ? null : r.id)}
                        className="w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center"
                      >
                        <span className="col-span-2 font-medium text-[#2084FA] hover:underline truncate">{r.grnNumber || `GRN-${i + 1}`}</span>
                        <span className="col-span-2 text-slate-700 truncate">{r.po?.poNumber || '—'}</span>
                        <span className="col-span-3 text-slate-700 truncate">{r.po?.vendorName || '—'}</span>
                        <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(r.receivedAt || r.createdAt)}</span>
                        <span className="col-span-1"><DocStatusPill status={r.status} /></span>
                        <span className="col-span-1 text-right text-slate-600 tabular-nums">{(r.lines || []).length}</span>
                        <span className="col-span-1" />
                      </button>
                      {open && (
                        <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                          <div className="divide-y divide-slate-100 mb-3">
                            {(r.lines || []).map((l: any) => (
                              <div key={l.id} className="py-2 flex items-center gap-3 text-[13px]">
                                <span className="flex-1 font-medium text-slate-900 truncate">{l.itemName}</span>
                                <span className="text-slate-600 tabular-nums">× {l.quantity}</span>
                              </div>
                            ))}
                          </div>
                          {r.status === 'draft' && (
                            <div className="flex gap-2">
                              <button onClick={() => act(r.id, 'complete')} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Complete</button>
                              <button onClick={() => act(r.id, 'cancel')} disabled={acting} className="px-3 h-9 text-sm text-slate-500 hover:text-rose-600">Cancel</button>
                            </div>
                          )}
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
