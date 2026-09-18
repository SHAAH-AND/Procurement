import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDocList } from '../shared/hooks';
import { getPayments, getBills, multiPay, updatePayment, deletePayment } from '../../../api';

const SORT_OPTIONS = [
  { id: 'paidAt', label: 'Payment Date' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'amount', label: 'Amount' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const fmtDate = (v?: any) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export function PaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, setData, loading, error, setError, load } = useDocList(getPayments);
  const [bills, setBills] = useState<any[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('paidAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [notice, setNotice] = useState((location.state as any)?.notice || '');
  const [menuAnchor, setMenuAnchor] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [editPay, setEditPay] = useState<{ id: string; method: string; reference: string; date: string } | null>(null);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) { setMoreOpen(false); setSortOpen(false); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

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

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'vendor') { av = String(a.vendorName || '').toLowerCase(); bv = String(b.vendorName || '').toLowerCase(); }
      else if (sortKey === 'amount') { av = Number(a.amount) || 0; bv = Number(b.amount) || 0; }
      else { av = a.paidAt ? new Date(a.paidAt).getTime() : 0; bv = b.paidAt ? new Date(b.paidAt).getTime() : 0; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p: any) => {
      const bill = p.billId ? billById.get(p.billId) : p.bill;
      const hay = `${p.vendorName || ''} ${p.method || ''} ${p.reference || ''} ${bill?.billNumber || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query, billById]);

  const isEmpty = !loading && data.length === 0 && !query;

  const confirmPay = confirmId ? data.find((d: any) => d.id === confirmId) : null;
  const menuPay = menuAnchor && !confirmId && !editPay ? data.find((d: any) => d.id === menuAnchor.id) : null;

  const openMenu = (id: string, anchor: HTMLElement) => {
    if (menuAnchor?.id === id) { setMenuAnchor(null); return; }
    const rect = anchor.getBoundingClientRect();
    const MENU_H = 96;
    const top = rect.bottom + 4 + MENU_H > window.innerHeight
      ? Math.max(8, rect.top - MENU_H - 4)
      : rect.bottom + 4;
    setMenuAnchor({ id, top, left: Math.max(8, rect.right - 160) });
  };

  const doDelete = async (id: string) => {
    const target = data.find((d: any) => d.id === id);
    setDeleting(true);
    setDeleteError('');
    try {
      await deletePayment(id);
      setData((ds: any[]) => ds.filter((d: any) => d.id !== id));
      setConfirmId(null);
      setMenuAnchor(null);
      setNotice(`Payment of ${fmtMoney(Number(target?.amount) || 0)} deleted — the bill balance was restored.`);
    } catch (e: any) { setDeleteError(e?.message || 'Delete failed'); } finally { setDeleting(false); }
  };

  const openEdit = (p: any) => {
    setMenuAnchor(null);
    setEditError('');
    setEditPay({
      id: p.id,
      method: p.method || '',
      reference: p.reference || '',
      date: p.paidAt ? String(p.paidAt).slice(0, 10) : '',
    });
  };

  const saveEdit = async () => {
    if (!editPay) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const updated: any = await updatePayment(editPay.id, {
        method: editPay.method.trim() || null,
        reference: editPay.reference.trim() || null,
        paidAt: editPay.date || undefined,
      } as any);
      const rec = updated?.data ?? updated;
      if (rec?.id) setData((ds: any[]) => ds.map((d: any) => (d.id === rec.id ? { ...d, ...rec } : d)));
      else load();
      setEditPay(null);
      setNotice('Payment updated.');
    } catch (e: any) { setEditError(e?.message || 'Update failed'); } finally { setSavingEdit(false); }
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Vendor', 'Bill#', 'Method', 'Reference', 'Amount'],
      ...filtered.map((p: any) => {
        const bill = p.billId ? billById.get(p.billId) : p.bill;
        return [
          p.paidAt ? String(p.paidAt).slice(0, 10) : '',
          p.vendorName || '',
          bill?.billNumber || '',
          p.method || '',
          p.reference || '',
          Number(p.amount || 0).toFixed(2),
        ];
      }),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payments-made.csv';
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
        bill: header.findIndex((h) => h.includes('bill')),
        amount: header.findIndex((h) => h.includes('amount')),
        method: header.findIndex((h) => h.includes('method') || h.includes('mode')),
      };
      if (ix.bill < 0 || ix.amount < 0) throw new Error('Need columns: billNumber, amount (optional: method)');
      const lines: { billId: string; amount: number }[] = [];
      const skipped: string[] = [];
      let method: string | undefined;
      for (const r of rows.slice(1)) {
        const billNo = (r[ix.bill] || '').trim();
        const amt = Number(r[ix.amount] || 0);
        if (!billNo || !(amt > 0)) continue;
        const bill = billByNumber.get(billNo.toLowerCase());
        if (!bill) { skipped.push(`${billNo} (bill not found)`); continue; }
        lines.push({ billId: bill.id, amount: amt });
        if (ix.method >= 0 && r[ix.method]?.trim()) method = r[ix.method].trim();
      }
      if (!lines.length) throw new Error('No valid rows to import');
      await multiPay({ method, lines });
      setNotice(`Import done: ${lines.length} payment(s) recorded${skipped.length ? `. Skipped: ${skipped.slice(0, 5).join('; ')}` : '.'}`);
      load();
    } catch (e: any) { setError(e?.message || 'Import failed'); }
    setMoreOpen(false);
    setSortOpen(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Title band — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3 shrink-0">
        <h2 className="text-[20px] font-bold text-slate-900 leading-tight">All Payments</h2>
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
            <h2 className="text-[24px] leading-snug font-medium text-slate-900">You haven't made any payments yet.</h2>
            <p className="text-[15px] text-slate-500 mt-3">Receipts of your bill payments will show up here.</p>
            <button onClick={() => navigate('/workspace/bills?view=unpaid')} className="mt-6 px-6 py-2.5 rounded-md bg-[#2084FA] text-white text-[13px] font-bold tracking-wide hover:bg-[#1a6fd6] shadow-sm">
              GO TO UNPAID BILLS
            </button>
            <button onClick={() => importRef.current?.click()} className="mt-3 text-[14px] font-medium text-[#2084FA] hover:underline">Import Payments</button>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-10 pb-4 px-6">
            <h3 className="text-[17px] font-medium text-slate-900 text-center">Life cycle of a Vendor Payment</h3>
            <div className="mt-6 flex flex-col items-center">
              <span className="rounded-md border border-[#bcd6f5] bg-white px-5 py-2 shadow-sm text-[11px] font-bold tracking-wide text-slate-700">BILLS</span>
              <span className="text-[#7fb3f5] text-sm leading-none">╌┆╌</span>
              <span className="text-[#7fb3f5] text-sm leading-none">┆</span>
              <div className="flex items-start justify-center gap-10 mt-1 flex-wrap">
                {[
                  { label: 'ACH Payment', icon: 'M3 10h18M5 10V7h14v3M7 14h2M7 17h4' },
                  { label: 'Check', icon: 'M3 8h18v9H3z M6 12h6' },
                  { label: 'Manual / Offline', icon: 'M12 12a3 3 0 100-6 3 3 0 000 6z M4 20c0-3 3.5-5 8-5s8 2 8 5' },
                ].map((s) => (
                  <span key={s.label} className="flex flex-col items-center gap-0">
                    <span className="text-[#7fb3f5] text-sm leading-none mb-1">▲</span>
                    <span className="flex items-center gap-2 rounded-md border border-[#bcd6f5] bg-white px-3 py-2 shadow-sm">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-green-600"><path d={s.icon} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="text-[10px] font-bold tracking-wide text-slate-700 leading-tight">{s.label.toUpperCase()}</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 pb-10 pt-6 max-w-3xl mx-auto w-full">
            <h3 className="text-[15px] text-slate-700">In the Payments Made module, you can:</h3>
            <ul className="mt-3 space-y-2.5 text-[14px] text-slate-600">
              {[
                'Record payments made to vendors',
                'View receipts of paid bills',
                'Record payments manually',
                'Pay down several bills in one go',
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
            <div className="min-w-[960px]">
              <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <span className="col-span-2">Date</span>
                <span className="col-span-3">Vendor</span>
                <span className="col-span-2">Bill#</span>
                <span className="col-span-2">Method</span>
                <span className="col-span-2 text-right">Amount</span>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search payments">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
              {searchOpen && (
                <div className="py-2">
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search payments"
                    className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-1">
            <div className="min-w-[960px]">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading payments…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-[15px] text-slate-500">No payments for this search.</div>
              ) : (
                <div>
                  {filtered.map((p: any) => {
                    const bill = p.billId ? billById.get(p.billId) : p.bill;
                    return (
                      <div key={p.id} className="group relative grid grid-cols-12 gap-2 px-3 py-2.5 border-b border-slate-100 text-[13px] items-center hover:bg-slate-50 transition-colors">
                        <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(p.paidAt || p.createdAt)}</span>
                        <span className="col-span-3 text-slate-800 font-medium truncate" title={p.reference || ''}>{p.vendorName || '—'}</span>
                        <span className="col-span-2 text-[#2084FA] truncate">{bill?.billNumber || '—'}</span>
                        <span className="col-span-2 text-slate-600 truncate">{p.method || '—'}</span>
                        <span className="col-span-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(Number(p.amount) || 0)}</span>
                        <span className="col-span-1 flex justify-end">
                          <button
                            onClick={(e) => openMenu(p.id, e.currentTarget)}
                            className={`w-7 h-7 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-opacity shrink-0 ${menuAnchor?.id === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                            aria-label={`Actions for payment to ${p.vendorName || 'vendor'}`}
                            title="More actions"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
                          </button>
                        </span>
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
      {menuAnchor && !confirmId && !editPay && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuAnchor(null)} />
      )}
      {menuPay && menuAnchor && !confirmId && !editPay && (
        <div
          className="fixed w-40 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-50"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => openEdit(menuPay)}
            className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
            Edit
          </button>
          <button
            onClick={() => { setMenuAnchor(null); setDeleteError(''); setConfirmId(menuPay.id); }}
            className="w-full px-4 py-2 text-[13px] text-left text-rose-600 font-medium hover:bg-rose-50 flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a1 1 0 01-1 .9H7.8a1 1 0 01-1-.9L6 7" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
            Delete
          </button>
        </div>
      )}
      {/* Edit payment — method, reference and date only; the amount is immutable */}
      {editPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => !savingEdit && setEditPay(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-slate-900">Edit Payment</h3>
            <p className="text-[13px] text-slate-500 mt-1">The amount can't be changed — delete and re-record to correct it.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Method</label>
                <input
                  value={editPay.method}
                  onChange={(e) => setEditPay({ ...editPay, method: e.target.value })}
                  className="h-9 w-full px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white"
                />
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Reference</label>
                <input
                  value={editPay.reference}
                  onChange={(e) => setEditPay({ ...editPay, reference: e.target.value })}
                  className="h-9 w-full px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white"
                />
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Payment Date</label>
                <input
                  type="date"
                  value={editPay.date}
                  onChange={(e) => setEditPay({ ...editPay, date: e.target.value })}
                  className="h-9 w-full px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white"
                />
              </div>
            </div>
            {editError && (
              <p className="mt-3 rounded-md px-3 py-2 text-[13px] font-medium bg-rose-50 border border-rose-200 text-rose-700" role="alert">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setEditPay(null)}
                disabled={savingEdit}
                className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
              >
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete confirm */}
      {confirmPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => { if (!deleting) { setConfirmId(null); setDeleteError(''); } }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-slate-900">Delete this payment?</h3>
            <p className="text-[13px] text-slate-500 mt-1.5">
              This permanently removes the {fmtMoney(Number(confirmPay.amount) || 0)} payment{confirmPay.vendorName ? ` to ${confirmPay.vendorName}` : ''} and restores the bill balance. This cannot be undone.
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
                onClick={() => doDelete(confirmPay.id)}
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
