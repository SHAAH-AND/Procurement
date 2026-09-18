import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getCredits, createCredit, applyCredit, getBills } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'open', label: 'Open', statuses: ['open'] },
  { id: 'consumed', label: 'Consumed', statuses: ['consumed'] },
];

const SORT_OPTIONS = [
  { id: 'createdAt', label: 'Created Time' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'amount', label: 'Amount' },
  { id: 'remaining', label: 'Remaining' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';

const fmtDate = (v?: any) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Credit Note# is folded into the notes text as "Credit Note: X" (backend has no number column)
const creditNoOf = (c: any): string => {
  const m = /^Credit Note:\s*(.+)$/m.exec(String(c.notes || ''));
  return m ? m[1].trim() : '—';
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

export function VendorCreditsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, setData, loading, error, setError, load } = useDocList(getCredits);
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
  const [notice, setNotice] = useState((location.state as any)?.notice || '');
  const [applyBill, setApplyBill] = useState('');
  const [applyAmt, setApplyAmt] = useState('');
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

  const activeView = VIEWS.find((v) => v.id === viewId) || VIEWS[0];

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'vendor') { av = String(a.vendorName || '').toLowerCase(); bv = String(b.vendorName || '').toLowerCase(); }
      else if (sortKey === 'amount') { av = Number(a.amount) || 0; bv = Number(b.amount) || 0; }
      else if (sortKey === 'remaining') { av = Number(a.remaining) || 0; bv = Number(b.remaining) || 0; }
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
    return sorted.filter((c: any) =>
      `${c.vendorName || ''} ${c.notes || ''} ${c.source || ''} ${c.status || ''}`.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const isEmpty = !loading && data.length === 0 && !query;

  const unpaidFor = (vendor: string) =>
    bills.filter(
      (b: any) =>
        (b.vendorName || '').toLowerCase() === (vendor || '').toLowerCase() &&
        ['open', 'overdue', 'partially_paid'].includes(b.status),
    );

  const apply = async (credit: any) => {
    if (!applyBill || !(Number(applyAmt) > 0)) { setError('Pick a bill + amount'); return; }
    setActing(true);
    setError('');
    try {
      await applyCredit(credit.id, { billId: applyBill, amount: Number(applyAmt) });
      const fresh: any = await getCredits();
      setData(Array.isArray(fresh) ? fresh : fresh?.data || []);
      const fb: any = await getBills();
      setBills(Array.isArray(fb) ? fb : fb?.data || []);
      setApplyBill('');
      setApplyAmt('');
      setNotice(`Applied to bill — credit remaining updated.`);
    } catch (e: any) { setError(e?.message || 'Apply failed'); } finally { setActing(false); }
  };

  const exportCsv = () => {
    const rows = [
      ['Vendor', 'Credit Note#', 'Date', 'Amount', 'Remaining', 'Status', 'Source'],
      ...filtered.map((c: any) => [
        c.vendorName || '',
        creditNoOf(c) === '—' ? '' : creditNoOf(c),
        c.createdAt ? String(c.createdAt).slice(0, 10) : '',
        Number(c.amount || 0).toFixed(2),
        Number(c.remaining || 0).toFixed(2),
        c.status || '',
        c.source || '',
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vendor-credits.csv';
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
        vendor: header.findIndex((h) => h.includes('vendor')),
        amount: header.findIndex((h) => h.includes('amount')),
        notes: header.findIndex((h) => h.includes('note')),
      };
      if (ix.vendor < 0 || ix.amount < 0) throw new Error('Need columns: vendorName, amount (optional: notes)');
      let created = 0;
      const skipped: string[] = [];
      for (const r of rows.slice(1)) {
        const vendor = (r[ix.vendor] || '').trim();
        const amt = Number(r[ix.amount] || 0);
        if (!vendor || !(amt > 0)) continue;
        try {
          const rec: any = await createCredit({
            vendorName: vendor,
            amount: amt,
            source: 'return',
            notes: ix.notes >= 0 ? r[ix.notes] || undefined : undefined,
          });
          setData((ds) => [rec, ...ds]);
          created++;
        } catch (e: any) { skipped.push(`${vendor} (${e?.message || 'failed'})`); }
      }
      setNotice(`Import done: ${created} credit(s) created${skipped.length ? `. Skipped: ${skipped.slice(0, 5).join('; ')}` : '.'}`);
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
            {activeView.id === 'all' ? 'All Vendor Credits' : `${activeView.label} Credits`}
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
                  {v.id === 'all' ? 'All Vendor Credits' : `${v.label} Credits`}
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
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="py-14 flex flex-col items-center text-center px-6">
            <h2 className="text-[24px] leading-snug font-medium text-slate-900">You deserve some credit too.</h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-3xl">Create vendor credits and apply them to multiple bills when buying stuff from your vendor.</p>
            <button onClick={() => navigate('new')} className="mt-6 px-6 py-2.5 rounded-md bg-[#2084FA] text-white text-[13px] font-bold tracking-wide hover:bg-[#1a6fd6] shadow-sm">
              CREATE VENDOR CREDITS
            </button>
            <button onClick={() => importRef.current?.click()} className="mt-3 text-[14px] font-medium text-[#2084FA] hover:underline">Import Vendor Credits</button>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-10 pb-4 px-6">
            <h3 className="text-[17px] font-medium text-slate-900 text-center">Life cycle of a Vendor Credit</h3>
            <div className="mt-6 flex flex-col items-center">
              <div className="flex items-center justify-center gap-0 flex-wrap">
                {[
                  { label: 'Product Returned / Cancelled', icon: 'M5 8h14l-1.2 12H6.2L5 8z M8.5 8V6.5a3.5 3.5 0 017 0V8' },
                  { label: 'Credit Note Received', icon: 'M6 3h12v18H6z M9 8h6 M9 12h4' },
                  { label: 'Record Vendor Credits', icon: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z M9 12l2 2 4-4' },
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
                  <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">MARK<br />AS OPEN</span>
                </span>
              </div>
              <div className="flex items-start justify-center gap-16 mt-2 flex-wrap">
                <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-green-600"><path d="M6 3h12v18H6z M9 8h6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">APPLY TO FUTURE BILLS</span>
                </span>
                <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.6} /><path d="M12 8v8M9 10.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 2-3 2.5-3 1.3-3 2.5c0 1.2 1.3 2 3 2s3-.8 3-2" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                  <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">RECORD REFUND</span>
                </span>
              </div>
            </div>
          </div>
          <div className="px-6 pb-10 pt-6 max-w-3xl mx-auto w-full">
            <h3 className="text-[15px] text-slate-700">In the Vendor Credits module, you can:</h3>
            <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
              {[
                'Record credits when you receive a credit note from your vendor.',
                'Apply vendor credits to bill payments in the future.',
                'Track remaining balances until fully consumed.',
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
          <div className="px-1 shrink-0 overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <span className="col-span-2">Vendor</span>
                <span className="col-span-2">Credit Note#</span>
                <span className="col-span-2">Date</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-2 text-right">Remaining</span>
                <span className="col-span-1">Status</span>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search credits">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
              {searchOpen && (
                <div className="py-2">
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search credits"
                    className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-1">
            <div className="min-w-[920px]">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading credits…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-[15px] text-slate-500">No credits for this filter.</div>
              ) : (
                <div>
                  {filtered.map((c: any) => {
                    const open = openId === c.id;
                    const candidates = unpaidFor(c.vendorName);
                    return (
                      <div key={c.id} className="border-b border-slate-100">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => { setOpenId(open ? null : c.id); setApplyBill(''); setApplyAmt(''); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : c.id); } }}
                          className="w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center cursor-pointer focus:outline-none focus:bg-slate-50"
                        >
                          <span className="col-span-2 font-medium text-slate-900 truncate" title={c.notes || ''}>{c.vendorName || '—'}</span>
                          <span className="col-span-2 text-[#2084FA] truncate">{creditNoOf(c)}</span>
                          <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(c.createdAt)}</span>
                          <span className="col-span-2 text-right tabular-nums">{fmtMoney(Number(c.amount) || 0)}</span>
                          <span className="col-span-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(Number(c.remaining) || 0)}</span>
                          <span className="col-span-1"><DocStatusPill status={c.status} /></span>
                          <span className="col-span-1" />
                        </div>
                        {open && (
                          <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs text-slate-600 flex gap-5 flex-wrap mb-2">
                              <span>Source: <strong>{c.source || '—'}</strong></span>
                              {c.notes && <span className="flex-1 min-w-[200px]">Notes: {c.notes}</span>}
                            </div>
                            {c.status === 'open' && Number(c.remaining) > 0 ? (
                              candidates.length === 0 ? (
                                <p className="text-[13px] text-slate-400">No unpaid bills for this vendor to apply to.</p>
                              ) : (
                                <div className="flex gap-2 flex-wrap items-center">
                                  <select
                                    value={applyBill}
                                    onChange={(e) => {
                                      setApplyBill(e.target.value);
                                      const b = candidates.find((x: any) => x.id === e.target.value);
                                      if (b) {
                                        const bal = Number(b.balance ?? 0);
                                        setApplyAmt(Math.min(Number(c.remaining) || 0, bal).toFixed(2));
                                      }
                                    }}
                                    className={`${INPUT} bg-white flex-1 min-w-[220px]`}
                                  >
                                    <option value="">Pick a bill to apply to…</option>
                                    {candidates.map((b: any) => (
                                      <option key={b.id} value={b.id}>{b.billNumber} — bal {fmtMoney(Number(b.balance ?? 0))}</option>
                                    ))}
                                  </select>
                                  <input
                                    value={applyAmt}
                                    onChange={(e) => setApplyAmt(e.target.value)}
                                    type="number" min={0} step="0.01"
                                    placeholder="Amount"
                                    className={`${INPUT} w-32`}
                                  />
                                  <button
                                    onClick={() => apply(c)}
                                    disabled={acting}
                                    className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
                                  >
                                    Apply
                                  </button>
                                </div>
                              )
                            ) : (
                              <p className="text-[13px] text-slate-400">Fully consumed.</p>
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
        </>
      )}
    </div>
  );
}
