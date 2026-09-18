import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getRecurrences, createRecurrence, runRecurrence, disableRecurrence, getBills, deleteRecurrence } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'active', label: 'Active', statuses: ['active'] },
  { id: 'completed', label: 'Completed', statuses: ['completed'] },
  { id: 'disabled', label: 'Disabled', statuses: ['disabled'] },
];

const SORT_OPTIONS = [
  { id: 'profileName', label: 'Profile Name' },
  { id: 'nextRun', label: 'Next Run' },
  { id: 'frequency', label: 'Repeat Every' },
  { id: 'createdAt', label: 'Created Time' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const fmtDate = (v?: any) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const freqLabel = (f?: string) => {
  const s = String(f || '').toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
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

export function RecurringBillsPage() {
  const navigate = useNavigate();
  const { data, setData, loading, error, setError, load } = useDocList(getRecurrences);
  const [bills, setBills] = useState<any[]>([]);
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
  const [menuAnchor, setMenuAnchor] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!moreOpen && !viewOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) { setMoreOpen(false); setSortOpen(false); }
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen, viewOpen]);

  const billById = useMemo(() => {
    const m = new Map<string, any>();
    bills.forEach((b: any) => { if (b?.id) m.set(b.id, b); });
    return m;
  }, [bills]);
  const billByNumber = useMemo(() => {
    const m = new Map<string, any>();
    bills.forEach((b: any) => {
      if (b?.billNumber) m.set(String(b.billNumber).trim().toLowerCase(), b);
    });
    return m;
  }, [bills]);

  const templateOf = (r: any) => billById.get(r.templateBillId);

  const activeView = VIEWS.find((v) => v.id === viewId) || VIEWS[0];

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'profileName') { av = String(a.profileName || '').toLowerCase(); bv = String(b.profileName || '').toLowerCase(); }
      else if (sortKey === 'frequency') { av = String(a.frequency || ''); bv = String(b.frequency || ''); }
      else if (sortKey === 'nextRun') { av = a.nextRunDate ? new Date(a.nextRunDate).getTime() : 0; bv = b.nextRunDate ? new Date(b.nextRunDate).getTime() : 0; }
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
    return sorted.filter((r: any) => {
      const t = templateOf(r);
      const hay = `${r.profileName || ''} ${r.frequency || ''} ${r.status || ''} ${t?.billNumber || ''} ${t?.vendorName || ''}`.toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, query, bills]);

  const isEmpty = !loading && data.length === 0 && !query;

  const run = async (id: string, action: 'run' | 'disable') => {
    setActing(true);
    setError('');
    setNotice('');
    try {
      const fn = action === 'run' ? runRecurrence : disableRecurrence;
      const updated = await fn(id);
      if (action === 'run') {
        setNotice(`Bill generated${updated?.billNumber ? ` as ${updated.billNumber}` : ''}. See All Bills.`);
        load();
      } else if (updated?.id) {
        setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
        setNotice('Profile disabled.');
      } else load();
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const doDelete = async (id: string) => {
    const target = data.find((d) => d.id === id);
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteRecurrence(id);
      setData((ds) => ds.filter((d) => d.id !== id));
      if (openId === id) setOpenId(null);
      setConfirmId(null);
      setMenuAnchor(null);
      setNotice(`Recurring profile ${target?.profileName || ''} deleted. Template and generated bills are kept.`.trim());
    } catch (e: any) { setDeleteError(e?.message || 'Delete failed'); } finally { setDeleting(false); }
  };

  const confirmRec = confirmId ? data.find((d) => d.id === confirmId) : null;
  const menuRec = menuAnchor && !confirmId ? data.find((d) => d.id === menuAnchor.id) : null;

  const openMenu = (id: string, anchor: HTMLElement) => {
    if (menuAnchor?.id === id) { setMenuAnchor(null); return; }
    const rect = anchor.getBoundingClientRect();
    const MENU_H = 96;
    const top = rect.bottom + 4 + MENU_H > window.innerHeight
      ? Math.max(8, rect.top - MENU_H - 4)
      : rect.bottom + 4;
    setMenuAnchor({ id, top, left: Math.max(8, rect.right - 160) });
  };

  const exportCsv = () => {    const rows = [
      ['Profile Name', 'Template Bill', 'Vendor', 'Repeat Every', 'Next Run', 'Ends On', 'Status'],
      ...filtered.map((r: any) => {
        const t = templateOf(r);
        return [
          r.profileName || '',
          t?.billNumber || '',
          t?.vendorName || '',
          freqLabel(r.frequency),
          r.nextRunDate ? String(r.nextRunDate).slice(0, 10) : '',
          r.endDate ? String(r.endDate).slice(0, 10) : 'Never',
          r.status || '',
        ];
      }),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recurring-bills.csv';
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
        profile: header.findIndex((h) => h.includes('profile')),
        bill: header.findIndex((h) => h.includes('bill')),
        freq: header.findIndex((h) => h.includes('freq') || h.includes('repeat') || h.includes('every')),
        start: header.findIndex((h) => h.includes('start')),
        end: header.findIndex((h) => h.includes('end')),
      };
      if (ix.profile < 0 || ix.bill < 0) throw new Error('Need columns: profileName, templateBill (bill number)');
      let created = 0;
      const skipped: string[] = [];
      for (const r of rows.slice(1)) {
        const profile = (r[ix.profile] || '').trim();
        const billNo = (r[ix.bill] || '').trim();
        if (!profile || !billNo) continue;
        const tpl = billByNumber.get(billNo.toLowerCase());
        if (!tpl) { skipped.push(`${profile} (bill ${billNo} not found)`); continue; }
        try {
          const rec: any = await createRecurrence({
            templateBillId: tpl.id,
            profileName: profile,
            frequency: (r[ix.freq] || 'monthly').trim().toLowerCase(),
            startDate: ix.start >= 0 && r[ix.start].trim() ? r[ix.start].trim() : undefined,
            endDate: ix.end >= 0 && r[ix.end].trim() ? r[ix.end].trim() : undefined,
          });
          setData((ds) => [rec, ...ds]);
          created++;
        } catch (e: any) { skipped.push(`${profile} (${e?.message || 'failed'})`); }
      }
      setNotice(`Import done: ${created} profile(s) created${skipped.length ? `. Skipped: ${skipped.slice(0, 5).join('; ')}` : '.'}`);
      load();
    } catch (e: any) { setError(e?.message || 'Import failed'); }
    setMoreOpen(false);
    setSortOpen(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Title band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3 shrink-0">
        <div className="relative" ref={viewRef}>
          <button
            onClick={() => setViewOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[20px] font-bold text-slate-900 leading-tight"
          >
            {activeView.id === 'all' ? 'All Recurring Bills' : activeView.label}
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
                  {v.id === 'all' ? 'All Recurring Bills' : v.label}
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
                <button onClick={() => { importRef.current?.click(); }} className="w-full px-4 py-2.5 text-[14px] text-left text-slate-800 hover:bg-slate-50 flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Import Recurring Bills
                </button>
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
      <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />

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
        /* Zoho getting-started — scrolls vertically */
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="py-14 flex flex-col items-center text-center px-6">
            <h2 className="text-[26px] leading-snug font-medium text-slate-900">Create. Set. Repeat.</h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-3xl">Do you pay bills every so often? Start paying your vendors on time by creating recurring bills.</p>
            <button onClick={() => navigate('new')} className="mt-6 px-6 py-2.5 rounded-md bg-[#2084FA] text-white text-[13px] font-bold tracking-wide hover:bg-[#1a6fd6] shadow-sm">
              CREATE RECURRING BILL
            </button>
            <button onClick={() => importRef.current?.click()} className="mt-3 text-[14px] font-medium text-[#2084FA] hover:underline">Import Recurring Bills</button>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-10 pb-4 px-6">
            <h3 className="text-[17px] font-medium text-slate-900 text-center">Life cycle of a Recurring Bill</h3>
            <div className="flex items-center justify-center gap-0 mt-6 flex-wrap">
              {[
                { label: 'Routine Purchase', icon: 'M5 8h14l-1.2 12H6.2L5 8z M8.5 8V6.5a3.5 3.5 0 017 0V8' },
                { label: 'Create Recurring Profile', icon: 'M6 3h12v18H6z M9 8h6 M9 12h6' },
                { label: 'Generated Bill', icon: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z' },
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
                <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">RECORD<br />PAYMENT</span>
              </span>
            </div>
          </div>
          <div className="px-6 pb-10 pt-6 max-w-3xl mx-auto w-full">
            <h3 className="text-[15px] text-slate-700">In the Recurring Bills module, you can:</h3>
            <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
              {[
                'Create profiles that auto-generate bills on schedule',
                'Generate a bill early with Run now',
                'Pause a schedule with Disable',
                'Track the next run date for every vendor',
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
          {/* Column header — scrolls horizontally with the rows */}
          <div className="px-1 shrink-0 overflow-x-auto">
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <span className="col-span-3">Profile Name</span>
                <span className="col-span-2">Template Bill</span>
                <span className="col-span-2">Vendor</span>
                <span className="col-span-1">Repeats</span>
                <span className="col-span-1">Next Run</span>
                <span className="col-span-1">Status</span>
                <span className="col-span-1">Actions</span>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search recurring bills">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
              {searchOpen && (
                <div className="py-2">
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search recurring bills"
                    className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                  />
                </div>
              )}
            </div>
          </div>
          {/* Rows — vertical scroll, horizontal scroll on narrow screens */}
          <div className="flex-1 min-h-0 overflow-auto px-1">
            <div className="min-w-[1080px]">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading recurring bills…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-[15px] text-slate-500">No profiles for this filter. Choose another filter or select All to view everything.</div>
              ) : (
                <div>
                  {filtered.map((r: any) => {
                    const open = openId === r.id;
                    const t = templateOf(r);
                    return (
                      <div key={r.id} className="border-b border-slate-100">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenId(open ? null : r.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : r.id); } }}
                          className="group relative w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center cursor-pointer focus:outline-none focus:bg-slate-50"
                        >
                          <span className="col-span-3 font-medium text-[#2084FA] hover:underline truncate">{r.profileName || '—'}</span>
                          <span className="col-span-2 text-slate-700 truncate">{t?.billNumber || '—'}</span>
                          <span className="col-span-2 text-slate-700 truncate">{t?.vendorName || '—'}</span>
                          <span className="col-span-1 text-slate-600">{freqLabel(r.frequency)}</span>
                          <span className="col-span-1 text-slate-600 tabular-nums">{fmtDate(r.nextRunDate)}</span>
                          <span className="col-span-1"><DocStatusPill status={r.status} /></span>
                          <span className="col-span-1 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                            {r.status === 'active' ? (
                              <>
                                <button onClick={() => run(r.id, 'run')} disabled={acting} className="text-[13px] font-semibold text-[#2084FA] hover:underline disabled:opacity-50 whitespace-nowrap">Run now</button>
                                <button onClick={() => run(r.id, 'disable')} disabled={acting} className="text-[13px] text-slate-400 hover:text-rose-600 disabled:opacity-50 whitespace-nowrap">Disable</button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </span>
                          <span className="col-span-1 flex justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); openMenu(r.id, e.currentTarget); }}
                              className={`w-7 h-7 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-opacity ${menuAnchor?.id === r.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                              aria-label={`Actions for ${r.profileName || 'profile'}`}
                              title="More actions"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
                            </button>
                          </span>
                        </div>
                        {open && (
                          <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                            <div className="text-xs text-slate-600 flex gap-5 flex-wrap mb-2">
                              <span>Starts: <strong>{fmtDate(r.startDate)}</strong></span>
                              <span>Ends: <strong>{r.endDate ? fmtDate(r.endDate) : 'Never expires'}</strong></span>
                              <span>Created: <strong>{fmtDate(r.createdAt)}</strong></span>
                            </div>
                            {(t?.lines || []).length > 0 && (
                              <div className="divide-y divide-slate-100">
                                {(t.lines || []).map((l: any) => (
                                  <div key={l.id} className="py-1.5 flex items-center gap-3 text-[13px]">
                                    <span className="flex-1 font-medium text-slate-900 truncate">{l.itemName}</span>
                                    <span className="text-slate-600 tabular-nums">× {l.quantity}</span>
                                    <span className="w-28 text-right font-medium text-slate-900 tabular-nums">{Number(l.quantity * l.rate).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* Row menu — fixed to viewport so no scroll container or stacking context can trap it */}
          {menuAnchor && !confirmId && (
            <div className="fixed inset-0 z-40" onClick={() => setMenuAnchor(null)} />
          )}
          {menuRec && menuAnchor && !confirmId && (
            <div
              className="fixed w-40 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-50"
              style={{ top: menuAnchor.top, left: menuAnchor.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { setMenuAnchor(null); navigate(`${menuRec.id}/edit`); }}
                className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
                Edit
              </button>
              <button
                onClick={() => { setMenuAnchor(null); setDeleteError(''); setConfirmId(menuRec.id); }}
                className="w-full px-4 py-2 text-[13px] text-left text-rose-600 font-medium hover:bg-rose-50 flex items-center gap-2.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a1 1 0 01-1 .9H7.8a1 1 0 01-1-.9L6 7" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
                Delete
              </button>
            </div>
          )}
          {/* Delete confirm */}
          {confirmRec && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => { if (!deleting) { setConfirmId(null); setDeleteError(''); } }}>
              <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-[16px] font-bold text-slate-900">Delete {confirmRec.profileName}?</h3>
                <p className="text-[13px] text-slate-500 mt-1.5">
                  This permanently removes the schedule. The template bill and already-generated bills are kept. This cannot be undone.
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
                    onClick={() => doDelete(confirmRec.id)}
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
