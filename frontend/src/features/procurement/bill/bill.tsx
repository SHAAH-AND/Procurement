import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getBills, billAction, payBill, getBillMatch, deleteBill } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'draft', label: 'Draft', statuses: ['draft'] },
  { id: 'pending', label: 'Pending', statuses: ['pending'] },
  { id: 'open', label: 'Open', statuses: ['open'] },
  { id: 'overdue', label: 'Overdue', statuses: ['overdue'] },
  { id: 'unpaid', label: 'Unpaid', statuses: ['open', 'overdue', 'partially_paid'] },
  { id: 'paid', label: 'Paid', statuses: ['paid', 'partially_paid'] },
  { id: 'void', label: 'Void', statuses: ['void', 'cancelled'] },
];

const VIEW_STATUSES = ['draft', 'pending', 'open', 'overdue', 'partially_paid', 'paid', 'void', 'cancelled'];

const SORT_OPTIONS = [
  { id: 'issueDate', label: 'Bill Date' },
  { id: 'billNumber', label: 'Bill #' },
  { id: 'dueDate', label: 'Due Date' },
  { id: 'amount', label: 'Amount' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const PAGE_SIZE = 25;
const FAV_KEY = 'pf-bill-views-fav';
const CUSTOM_KEY = 'pf-bill-views-custom';

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

const billTotal = (b: any) => (b.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.rate || 0), 0);

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



export function BillsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, setData, loading, error, setError, load } = useDocList(getBills);
  const [tab, setTab] = useState<'docs' | 'bills'>('bills');
  const [viewId, setViewId] = useState(() => {
    const v = searchParams.get('view');
    if (!v) return 'all';
    const builtin = ['all', 'draft', 'pending', 'open', 'overdue', 'unpaid', 'paid', 'void'];
    if (builtin.includes(v)) return v;
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr) && arr.some((x: any) => x?.id === v)) return v;
    } catch { /* ignore */ }
    return 'all';
  });
  const [favs, setFavs] = useState<string[]>(() => loadIds(FAV_KEY));
  const [customViews, setCustomViews] = useState<ViewDef[]>(() => loadCustom());
  const [viewSearch, setViewSearch] = useState('');
  const [newViewOpen, setNewViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewStatus, setNewViewStatus] = useState('all');
  const [docFiles, setDocFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [match, setMatch] = useState<any>(null);
  const [payAmt, setPayAmt] = useState('');
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [viewOpen, setViewOpen] = useState(false);
  const [calView, setCalView] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const allViews = useMemo(() => [...VIEWS, ...customViews], [customViews]);
  const activeView = allViews.find((v) => v.id === viewId) || VIEWS[0];
  // Zoho shows the active view in the tab, e.g. "Unpaid Bills"
  const viewTabLabel =
    activeView.id === 'all' ? 'All Bills'
    : activeView.id.startsWith('custom-') ? activeView.label
    : `${activeView.label} Bills`;

  useEffect(() => { setPage(0); }, [viewId, query, sortKey, sortDir, tab]);

  // Deep link, e.g. /workspace/bills?view=unpaid from Payments Made.
  // Consumed once on mount and cleared from the URL so it never fights manual view changes.
  useEffect(() => {
    const v = searchParams.get('view');
    if (v && (VIEWS.some((x) => x.id === v) || customViews.some((x) => x.id === v))) {
      setViewId(v);
      setTab('bills');
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!moreOpen && !viewOpen && !uploadMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) { setMoreOpen(false); setSortOpen(false); }
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
      if (uploadRef.current && !uploadRef.current.contains(e.target as Node)) setUploadMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen, viewOpen, uploadMenuOpen]);

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
    } catch (e: any) { setError(e?.message || 'Payment failed'); } finally { setActing(false); }
  };

  const showMatch = async (id: string) => {
    try { setMatch(await getBillMatch(id)); } catch (e: any) { setError(e?.message || 'Match check failed'); }
  };

  const doDelete = async (id: string) => {
    const target = data.find((d) => d.id === id);
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteBill(id);
      setData((ds) => ds.filter((d) => d.id !== id));
      if (openId === id) { setOpenId(null); setMatch(null); }
      setConfirmId(null);
      setMenuId(null);
      setNotice(`Bill ${target?.billNumber || ''} deleted.`.trim());
    } catch (e: any) { setDeleteError(e?.message || 'Delete failed'); } finally { setDeleting(false); }
  };

  const confirmBill = confirmId ? data.find((d) => d.id === confirmId) : null;

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'billNumber') { av = String(a.billNumber ?? '').toLowerCase(); bv = String(b.billNumber ?? '').toLowerCase(); }
      else if (sortKey === 'amount') { av = billTotal(a); bv = billTotal(b); }
      else {
        const k = sortKey === 'dueDate' ? (a.dueDate || a.issueDate) : (a.issueDate || a.createdAt);
        const l = sortKey === 'dueDate' ? (b.dueDate || b.issueDate) : (b.issueDate || b.createdAt);
        av = k ? new Date(k).getTime() : 0;
        bv = l ? new Date(l).getTime() : 0;
      }
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
      const hay = `${d.billNumber || ''} ${d.vendorName || ''} ${d.vendorBillNo || ''} ${d.status || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = filtered.length ? safePage * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min((safePage + 1) * PAGE_SIZE, filtered.length);

  const isEmpty = !loading && data.length === 0 && !query;

  const calCells = useMemo(() => {
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDay = first.getDay();
    const days = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const cells: ({ day: number } | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push({ day: d });
    return cells;
  }, [calMonth]);

  const billsOn = (day: number) =>
    filtered.filter((b: any) => {
      const d = b.dueDate ? new Date(b.dueDate) : null;
      return d && d.getFullYear() === calMonth.y && d.getMonth() === calMonth.m && d.getDate() === day;
    });

  const exportCsv = () => {
    const rows = [
      ['Bill#', 'Vendor', 'Bill Date', 'Due Date', 'Status', 'Amount', 'Paid'],
      ...filtered.map((b: any) => [
        b.billNumber || '', b.vendorName || '',
        b.issueDate ? String(b.issueDate).slice(0, 10) : '',
        b.dueDate ? String(b.dueDate).slice(0, 10) : '',
        b.status || '', billTotal(b).toFixed(2), Number(b.amountPaid || 0).toFixed(2),
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bills.csv';
    a.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
    setSortOpen(false);
  };

  const importCsv = async (file: File) => {
    setError('');
    setNotice('');
    try {
      const { createBill } = await import('../../../api');
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) throw new Error('File is empty');
      const header = rows[0].map((c) => c.trim().toLowerCase());
      const ix = {
        vendor: header.indexOf('vendorname'),
        bill: header.indexOf('vendorbillno'),
        date: header.indexOf('billdate'),
        due: header.indexOf('duedate'),
        item: header.indexOf('itemname'),
        qty: header.indexOf('quantity'),
        rate: header.indexOf('rate'),
        notes: header.indexOf('notes'),
      };
      if (ix.vendor < 0 || ix.item < 0) throw new Error('Need columns: vendorName, itemName (optional: vendorBillNo, billDate, dueDate, quantity, rate, notes)');
      const groups = new Map<string, any[]>();
      rows.slice(1).forEach((r) => {
        const vendor = (r[ix.vendor] || '').trim();
        if (!vendor || !r[ix.item]?.trim()) return;
        const key = `${vendor}||${ix.date >= 0 ? r[ix.date] : ''}||${ix.due >= 0 ? r[ix.due] : ''}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      });
      let created = 0;
      const skipped: string[] = [];
      for (const [key, rs] of groups) {
        const [vendor] = key.split('||');
        try {
          const rec: any = await createBill({
            vendorName: vendor,
            vendorBillNo: ix.bill >= 0 ? rs[0][ix.bill].trim() || undefined : undefined,
            issueDate: ix.date >= 0 && rs[0][ix.date].trim() ? rs[0][ix.date].trim() : undefined,
            dueDate: ix.due >= 0 && rs[0][ix.due].trim() ? rs[0][ix.due].trim() : undefined,
            notes: ix.notes >= 0 ? rs[0][ix.notes] || undefined : undefined,
            lines: rs.map((r) => ({ itemName: r[ix.item].trim(), quantity: Number(r[ix.qty] || 1) || 1, rate: Number(r[ix.rate] || 0) || 0 })),
          });
          setData((ds) => [rec, ...ds]);
          created++;
        } catch (e: any) { skipped.push(`${vendor} (${e?.message || 'failed'})`); }
      }
      setNotice(`Import done: ${created} bill(s) created${skipped.length ? `. Skipped: ${skipped.slice(0, 5).join('; ')}` : '.'}`);
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

  const addDocFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setDocFiles((fs) => [...arr.map((f) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, size: f.size })), ...fs]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-0">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setTab('docs')}
            className={`relative pb-3 text-[17px] ${tab === 'docs' ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
          >
            Uploaded Documents
            {tab === 'docs' && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
          </button>
          <div className="relative" ref={viewRef}>
            <button
              onClick={() => { setTab('bills'); setViewOpen((v) => !v); }}
              className={`pb-3 text-[17px] flex items-center gap-1 ${tab === 'bills' ? 'font-bold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'}`}
            >
              {viewTabLabel}
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" className="text-[#2084FA] mt-0.5"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {tab === 'bills' && <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-t bg-[#2084FA]" />}
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
            onClick={() => setCalView((v) => !v)}
            title={calView ? 'List view' : 'Calendar view'}
            className={`w-9 h-9 rounded-md border flex items-center justify-center ${calView ? 'border-[#2084FA] text-[#2084FA] bg-blue-50/50' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.7} /><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
          </button>
          <div className="relative" ref={uploadRef}>
            <div className="flex">
              <button onClick={() => setTab('docs')} className="px-4 h-9 rounded-l-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm">Upload Bill</button>
              <button onClick={() => setUploadMenuOpen((v) => !v)} className="w-8 h-9 rounded-r-md bg-[#2084FA] text-white hover:bg-[#1a6fd6] border-l border-white/30 flex items-center justify-center" aria-label="Upload options">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            {uploadMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-30">
                <button onClick={() => { setUploadMenuOpen(false); setTab('docs'); }} className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50">Attach From Desktop</button>
              </div>
            )}
          </div>
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
                <button onClick={() => setTab('docs')} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50">Import Bills</button>
                <button onClick={exportCsv} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50">Export Bills</button>
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

      {tab === 'docs' ? (
        /* Uploaded Documents — Zoho style */
        <div className="flex-1 overflow-auto px-1 pb-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addDocFiles(e.dataTransfer.files); }}
            onClick={() => docRef.current?.click()}
            className={`mx-auto max-w-4xl rounded-xl border border-dashed px-6 py-16 flex flex-col items-center text-center cursor-pointer transition-colors ${dragOver ? 'border-[#2084FA] bg-blue-50/50' : 'border-slate-300 bg-white'}`}
          >
            <svg width="72" height="56" viewBox="0 0 72 56" fill="none">
              <ellipse cx="26" cy="38" rx="18" ry="13" fill="#F4A988" opacity="0.85" />
              <ellipse cx="48" cy="32" rx="20" ry="16" fill="#F7B955" opacity="0.9" />
              <path d="M36 22v18M30 32l6-6 6 6" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-[19px] font-bold text-slate-900 mt-4">Drag & Drop Files Here</h3>
            <p className="text-[14px] text-slate-600 mt-1.5">Upload your documents (Images, PDF, Docs or Sheets) here</p>
            <span className="mt-5 px-5 h-10 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] inline-flex items-center shadow-sm">Choose files to upload</span>
            <input ref={docRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { if (e.target.files) addDocFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {docFiles.length > 0 && (
            <div className="mx-auto max-w-4xl mt-4 rounded-xl bg-white border border-slate-200 overflow-hidden">
              {docFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 text-[13px] last:border-0">
                  <span className="font-medium text-slate-800 truncate">{f.name}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400 tabular-nums">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => setDocFiles((fs) => fs.filter((x) => x.id !== f.id))} className="text-slate-300 hover:text-rose-500" aria-label={`Remove ${f.name}`}>×</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : isEmpty ? (
        /* Zoho getting-started */
        <div className="flex-1 overflow-auto">
          <div className="py-14 flex flex-col items-center text-center px-6">
            <h2 className="text-[26px] leading-snug font-medium text-slate-900">Owe money? It's good to pay bills on time!</h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-3xl">If you've purchased something for your business, and you don't have to repay it immediately, then you can record it as a bill.</p>
            <button onClick={() => navigate('new')} className="mt-6 px-6 py-2.5 rounded-md bg-[#2084FA] text-white text-[13px] font-bold tracking-wide hover:bg-[#1a6fd6] shadow-sm">
              CREATE A BILL
            </button>
            <button onClick={() => importRef.current?.click()} className="mt-3 text-[14px] font-medium text-[#2084FA] hover:underline">Import Bills</button>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-10 pb-4 px-6">
            <h3 className="text-[17px] font-medium text-slate-900 text-center">Life cycle of a Bill</h3>
            <div className="flex items-center justify-center gap-0 mt-6 flex-wrap">
              {[
                { label: 'Purchase Items', icon: 'M5 8h14l-1.2 12H6.2L5 8z M8.5 8V6.5a3.5 3.5 0 017 0V8' },
                { label: 'Record Bill', icon: 'M6 3h12v18H6z M9 8h6 M9 12h6' },
              ].map((s) => (
                <span key={s.label} className="flex items-center">
                  <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d={s.icon} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">{s.label.toUpperCase()}</span>
                  </span>
                  <span className="text-[#2084FA] text-sm leading-none mx-1">╌╌╌▸</span>
                </span>
              ))}
              <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-green-600"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.6} /><path d="M12 7v10M9 9.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 2-3 2.5-3 1.3-3 2.5c0 1.2 1.3 2 3 2s3-.8 3-2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">CONVERT<br />TO OPEN</span>
              </span>
              <span className="text-[#2084FA] text-sm leading-none mx-1">╌╌╌▸</span>
              <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-green-600"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.6} /><path d="M12 7v10M9 9.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 2-3 2.5-3 1.3-3 2.5c0 1.2 1.3 2 3 2s3-.8 3-2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">RECORD<br />PAYMENT</span>
              </span>
            </div>
            <p className="text-center text-[12px] text-slate-400 mt-3">Partial payments branch off before the final payment.</p>
          </div>
          <div className="px-6 pb-10 pt-6 max-w-3xl mx-auto w-full">
            <h3 className="text-[15px] text-slate-700">In the Bills module, you can:</h3>
            <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
              {[
                'Create bills and record payments',
                'Apply credits to bills',
                'Make online payments',
                'Allocate landed costs',
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
              <span className="col-span-2">Bill#</span>
              <span className="col-span-3">Vendor</span>
              <span className="col-span-2">Bill Date</span>
              <span className="col-span-2">Due Date</span>
              <span className="col-span-1">Status</span>
              <span className="col-span-1 text-right">Amount</span>
              <div className="col-span-1 flex justify-end">
                <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search bills">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            {searchOpen && (
              <div className="py-2">
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bills"
                  className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                />
              </div>
            )}
          </div>
          {/* Rows */}
          <div className="flex-1 overflow-auto px-1">
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-400">Loading bills…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[15px] text-slate-500">
                {activeView.id === 'all'
                  ? 'No bills match this search.'
                  : `There are no ${activeView.label} Bills`}
              </div>
            ) : calView ? (
              <div className="py-4">
                <div className="flex items-center justify-between px-1 pb-3">
                  <h3 className="text-[15px] font-semibold text-slate-900">{new Date(calMonth.y, calMonth.m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => setCalMonth((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12 }))} className="px-2 h-7 text-slate-600 hover:text-slate-900" aria-label="Previous month">‹ Prev</button>
                    <button onClick={() => setCalMonth((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12 }))} className="px-2 h-7 text-slate-600 hover:text-slate-900" aria-label="Next month">Next ›</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="bg-[#f8fafc] text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 py-2">{d}</div>
                  ))}
                  {calCells.map((c, i) => (
                    <div key={i} className="bg-white min-h-[86px] p-1.5">
                      {c && (
                        <>
                          <div className="text-xs text-slate-500 tabular-nums">{c.day}</div>
                          {billsOn(c.day).map((b: any) => (
                            <button key={b.id} onClick={() => { setOpenId(b.id); setMatch(null); setCalView(false); }} title={`${b.billNumber} — ${b.vendorName}`} className="mt-1 w-full text-left text-[11px] font-medium text-[#2084FA] bg-blue-50 hover:bg-blue-100 rounded px-1.5 py-0.5 truncate">
                              {b.billNumber}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                {pageRows.map((b: any, i: number) => {
                  const open = openId === b.id;
                  const menuOpen = menuId === b.id;
                  return (
                    <div key={b.id || i} className="border-b border-slate-100">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => { setOpenId(open ? null : b.id); setMatch(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : b.id); setMatch(null); } }}
                        className="group relative w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center cursor-pointer focus:outline-none focus:bg-slate-50"
                      >
                        <span className="col-span-2 font-medium text-[#2084FA] hover:underline truncate">{b.billNumber || `BILL-${i + 1}`}</span>
                        <span className="col-span-3 text-slate-700 truncate">{b.vendorName || '—'}</span>
                        <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(b.issueDate)}</span>
                        <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(b.dueDate)}</span>
                        <span className="col-span-1"><DocStatusPill status={b.status} /></span>
                        <span className="col-span-1 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(billTotal(b))}</span>
                        <span className="col-span-1 flex justify-end">
                          <span className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setMenuId(menuOpen ? null : b.id); }}
                              className={`w-7 h-7 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-opacity ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                              aria-label={`Actions for ${b.billNumber || 'bill'}`}
                              title="More actions"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
                            </button>
                            {menuOpen && (
                              <span className="absolute right-0 top-8 w-40 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-30" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => { setMenuId(null); navigate(`${b.id}/edit`); }}
                                  className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
                                  Edit
                                </button>
                                <button
                                  onClick={() => { setMenuId(null); setDeleteError(''); setConfirmId(b.id); }}
                                  className="w-full px-4 py-2 text-[13px] text-left text-rose-600 font-medium hover:bg-rose-50 flex items-center gap-2.5"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a1 1 0 01-1 .9H7.8a1 1 0 01-1-.9L6 7" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
                                  Delete
                                </button>
                              </span>
                            )}
                          </span>
                        </span>
                      </div>
                      {open && (
                        <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                          <div className="divide-y divide-slate-100 mb-3">
                            {(b.lines || []).map((l: any) => (
                              <div key={l.id} className="py-2 flex items-center gap-3 text-[13px]">
                                <span className="flex-1 font-medium text-slate-900 truncate">{l.itemName}</span>
                                <span className="text-slate-600 tabular-nums">× {l.quantity}</span>
                                <span className="w-28 text-right font-medium text-slate-900 tabular-nums">LKR {fmtMoney(l.quantity * l.rate)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-slate-600 flex gap-4 flex-wrap mb-3">
                            <span>PO: <strong>{b.poId ? b.poId.slice(0, 8) : '—'}</strong></span>
                            <span>Paid: <strong>LKR {fmtMoney(Number(b.amountPaid || 0))}</strong></span>
                            <button onClick={() => showMatch(b.id)} className="font-semibold text-blue-700 hover:underline">Check 3-way match</button>
                          </div>
                          {match?.billId === b.id && (
                            <div className="mb-3 text-xs">
                              <div className="font-bold text-slate-900 mb-2">Match: {match.matchPct}%</div>
                              {match.lines.map((l: any, j: number) => (
                                <div key={j} className="flex justify-between py-1 border-b border-slate-50 last:border-0">
                                  <span className="text-slate-700">{l.itemName}</span>
                                  <span className={l.matched ? 'text-blue-700 font-semibold' : l.matched === null ? 'text-slate-400' : 'text-rose-700 font-semibold'}>{l.reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap items-center">
                            {b.status === 'draft' && <button onClick={() => act(b.id, 'submit')} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Submit</button>}
                            {b.status === 'pending' && <button onClick={() => act(b.id, 'approve')} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Approve</button>}
                            {['draft', 'open'].includes(b.status) && <button onClick={() => { if (window.confirm(`Void ${b.billNumber}?`)) act(b.id, 'void'); }} disabled={acting} className="px-3 h-9 text-sm text-slate-500 hover:text-rose-600">Void</button>}
                            {['open', 'overdue', 'partially_paid'].includes(b.status) && (
                              <span className="flex items-center gap-2 ml-auto">
                                <input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} type="number" min={0} step="0.01" placeholder="Amount" className={`${INPUT} w-32`} />
                                <button onClick={() => pay(b.id)} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Record Payment</button>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && filtered.length > 0 && !calView && (
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
          {/* Row-menu outside-click closer */}
          {menuId && !confirmId && (
            <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
          )}
          {/* Delete confirm */}
          {confirmBill && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => { if (!deleting) { setConfirmId(null); setDeleteError(''); } }}>
              <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-[16px] font-bold text-slate-900">Delete {confirmBill.billNumber}?</h3>
                <p className="text-[13px] text-slate-500 mt-1.5">
                  This permanently removes the bill{confirmBill.vendorName ? ` for ${confirmBill.vendorName}` : ''}. Payments already recorded stay in history. This cannot be undone.
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
                    onClick={() => doDelete(confirmBill.id)}
                    disabled={deleting}
                    className="px-4 h-9 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60 shadow-sm"
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
