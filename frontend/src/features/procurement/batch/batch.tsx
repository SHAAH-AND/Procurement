import { useState, useEffect, useMemo, useRef } from 'react';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getBills, getBatches, createBatch, updateBatch, deleteBatch, batchAction } from '../../../api';

type ViewDef = { id: string; label: string; statuses: string[] | null };

const VIEWS: ViewDef[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'draft', label: 'Draft', statuses: ['draft'] },
  { id: 'progress', label: 'In Progress', statuses: ['partially_processed'] },
  { id: 'processed', label: 'Processed', statuses: ['processed'] },
  { id: 'failed', label: 'Failed', statuses: ['failed'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
];

const SORT_OPTIONS = [
  { id: 'createdAt', label: 'Created Time' },
  { id: 'batchNumber', label: 'Batch#' },
  { id: 'amount', label: 'Amount' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['id'];

const PAID_THROUGH = ['Bank Transfer', 'Cash', 'Cheque', 'Online', 'Other'];

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (v?: any) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const batchTotal = (b: any) => (b.lines || []).reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
const billBalance = (b: any) => Number(b.balance ?? 0);

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export function BatchPaymentsPage() {
  const { data, setData, loading, error, setError, load } = useDocList(getBatches);
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
  const [notice, setNotice] = useState('');
  // New-batch modal (Zoho wizard: details → pick bills)
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [batchName, setBatchName] = useState('');
  const [paidThrough, setPaidThrough] = useState('Bank Transfer');
  const [payDate, setPayDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [sel, setSel] = useState<Record<string, string>>({});
  const [menuAnchor, setMenuAnchor] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLocked, setEditLocked] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

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

  const unpaidBills = useMemo(
    () => bills.filter((b: any) => ['open', 'overdue', 'partially_paid'].includes(b.status) && billBalance(b) > 0.005),
    [bills],
  );

  const activeView = VIEWS.find((v) => v.id === viewId) || VIEWS[0];

  const viewFiltered = useMemo(() => {
    if (!activeView.statuses) return data;
    return data.filter((d) => activeView.statuses!.includes(d.status));
  }, [data, activeView]);

  const sorted = useMemo(() => {
    const arr = [...viewFiltered];
    arr.sort((a, b) => {
      let av: any; let bv: any;
      if (sortKey === 'batchNumber') { av = String(a.batchNumber || ''); bv = String(b.batchNumber || ''); }
      else if (sortKey === 'amount') { av = batchTotal(a); bv = batchTotal(b); }
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
      `${b.batchNumber || ''} ${b.batchName || ''} ${b.paidThrough || ''} ${b.status || ''}`.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const isEmpty = !loading && data.length === 0 && !query;

  const openModal = () => {
    setEditId(null);
    setEditLocked(false);
    setBatchName('');
    setPaidThrough('Bank Transfer');
    setPayDate(todayISO());
    setDescription('');
    setSel({});
    setStep(1);
    setModalOpen(true);
  };

  const openEdit = (b: any) => {
    setEditId(b.id);
    setEditLocked(b.status !== 'draft');
    setBatchName(b.batchName || '');
    setPaidThrough(b.paidThrough || 'Bank Transfer');
    setPayDate(b.paymentDate ? String(b.paymentDate).slice(0, 10) : todayISO());
    setDescription(b.reference || '');
    const s: Record<string, string> = {};
    (b.lines || []).forEach((l: any) => { s[l.billId] = String(l.amount ?? ''); });
    setSel(s);
    setStep(1);
    setModalOpen(true);
  };

  const confirmBatch = confirmId ? data.find((d: any) => d.id === confirmId) : null;
  const menuBatch = menuAnchor && !confirmId ? data.find((d: any) => d.id === menuAnchor.id) : null;

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
      await deleteBatch(id);
      setData((ds: any[]) => ds.filter((d: any) => d.id !== id));
      if (openId === id) setOpenId(null);
      setConfirmId(null);
      setMenuAnchor(null);
      setNotice(`Batch ${target?.batchNumber || ''} deleted. Recorded bill payments are kept.`.trim());
    } catch (e: any) { setDeleteError(e?.message || 'Delete failed'); } finally { setDeleting(false); }
  };

  const toggleBill = (id: string) => {
    setSel((s) => {
      if (s[id] !== undefined) {
        const next = { ...s };
        delete next[id];
        return next;
      }
      const b = billById.get(id);
      return { ...s, [id]: billBalance(b).toFixed(2) };
    });
  };

  const selTotal = useMemo(
    () => Object.values(sel).reduce((s, a) => s + (Number(a) || 0), 0),
    [sel],
  );

  // Edit mode: keep already-picked bills visible even after they are settled, so they can be unticked.
  const pickList = useMemo(() => {
    if (!editId) return unpaidBills;
    const extras = Object.keys(sel)
      .map((id) => billById.get(id))
      .filter((b: any) => b && !unpaidBills.some((u) => u.id === b.id));
    return [...unpaidBills, ...extras];
  }, [editId, unpaidBills, sel, billById]);

  const create = async () => {
    const lines = Object.entries(sel)
      .filter(([, a]) => Number(a) > 0)
      .map(([billId, a]) => ({ billId, amount: Number(a) }));
    if (!batchName.trim()) { setError('Enter a batch name'); return; }
    if (!lines.length) { setError('Select at least one bill with an amount'); return; }
    setActing(true);
    setError('');
    try {
      const created: any = await createBatch({
        batchName: batchName.trim(),
        paidThrough,
        paymentDate: payDate || undefined,
        reference: description.trim() || undefined,
        lines,
      });
      const rec = created?.data ?? created;
      if (rec?.id) setData((ds: any[]) => [rec, ...ds]);
      else load();
      setModalOpen(false);
      setNotice(`Batch ${rec?.batchNumber || ''} created. Process it to pay ${lines.length} bill(s).`.trim());
    } catch (e: any) { setError(e?.message || 'Failed to create batch'); } finally { setActing(false); }
  };

  const saveEdit = async () => {
    if (!editId) return;
    if (!batchName.trim()) { setError('Enter a batch name'); return; }
    const payload: any = {
      batchName: batchName.trim(),
      paidThrough,
      paymentDate: payDate || null,
      reference: description.trim() || null,
    };
    if (!editLocked) {
      const lines = Object.entries(sel)
        .filter(([, a]) => Number(a) > 0)
        .map(([billId, a]) => ({ billId, amount: Number(a) }));
      if (!lines.length) { setError('Select at least one bill with an amount'); return; }
      payload.lines = lines;
    }
    setActing(true);
    setError('');
    try {
      const updated: any = await updateBatch(editId, payload);
      const rec = updated?.data ?? updated;
      if (rec?.id) setData((ds: any[]) => ds.map((d: any) => (d.id === rec.id ? rec : d)));
      else load();
      setModalOpen(false);
      setEditId(null);
      setNotice('Batch updated.');
    } catch (e: any) { setError(e?.message || 'Failed to update batch'); } finally { setActing(false); }
  };

  const act = async (id: string, action: 'process' | 'cancel') => {
    const label = action === 'process' ? 'process' : 'cancel';
    if (action === 'cancel' && !window.confirm('Cancel this batch?')) return;
    setActing(true);
    setError('');
    try {
      const updated: any = await batchAction(id, action);
      const rec = updated?.data ?? updated;
      if (rec?.id) setData((ds: any[]) => ds.map((d: any) => (d.id === rec.id ? rec : d)));
      else load();
      setNotice(action === 'process' ? 'Batch processed — payments recorded on the bills.' : 'Batch cancelled.');
    } catch (e: any) { setError(e?.message || `Failed to ${label} batch`); } finally { setActing(false); }
  };

  const exportCsv = () => {
    const rows = [
      ['Batch#', 'Name', 'Bills', 'Amount', 'Paid Through', 'Date', 'Status'],
      ...filtered.map((b: any) => [
        b.batchNumber || '',
        b.batchName || '',
        String((b.lines || []).length),
        batchTotal(b).toFixed(2),
        b.paidThrough || '',
        b.paymentDate ? String(b.paymentDate).slice(0, 10) : '',
        b.status || '',
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch-payments.csv';
    a.click();
    URL.revokeObjectURL(url);
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
            {activeView.id === 'all' ? 'All Batch Payments' : activeView.label}
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
                  {v.id === 'all' ? 'All Batch Payments' : v.label}
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
            onClick={openModal}
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
          <div className="py-16 flex flex-col items-center text-center px-6">
            <h2 className="text-[22px] leading-snug font-semibold text-slate-900">Pay Multiple Vendor Bills at Once</h2>
            <p className="text-[15px] text-slate-500 mt-3 max-w-xl">Create and manage batch payments to settle multiple vendor bills efficiently in a single transaction.</p>
            <button onClick={openModal} className="mt-6 px-5 h-10 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" /></svg>
              New Batch Payment
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-1 shrink-0 overflow-x-auto">
            <div className="min-w-[1020px]">
              <div className="grid grid-cols-12 items-center gap-2 px-3 py-3 bg-[#f8fafc] border-y border-slate-200 text-[12px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                <span className="col-span-2">Batch#</span>
                <span className="col-span-2">Name</span>
                <span className="col-span-1 text-right">Bills</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-2">Paid Through</span>
                <span className="col-span-1">Date</span>
                <span className="col-span-1">Status</span>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => setSearchOpen((v) => !v)} className="text-slate-400 hover:text-slate-700 transition-colors p-1" aria-label="Search batches">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={1.5} /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
              {searchOpen && (
                <div className="py-2">
                  <input
                    autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search batches"
                    className="h-9 w-full max-w-sm px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-1">
            <div className="min-w-[1020px]">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-400">Loading batches…</div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-[15px] text-slate-500">No batches for this filter.</div>
              ) : (
                <div>
                  {filtered.map((b: any) => {
                    const open = openId === b.id;
                    return (
                      <div key={b.id} className="border-b border-slate-100">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenId(open ? null : b.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : b.id); } }}
                          className="group relative w-full grid grid-cols-12 gap-2 px-3 py-2.5 text-[13px] text-left hover:bg-slate-50 transition-colors items-center cursor-pointer focus:outline-none focus:bg-slate-50"
                        >
                          <span className="col-span-2 font-medium text-[#2084FA] truncate">{b.batchNumber || '—'}</span>
                          <span className="col-span-2 text-slate-700 truncate">{b.batchName || '—'}</span>
                          <span className="col-span-1 text-right text-slate-600 tabular-nums">{(b.lines || []).length}</span>
                          <span className="col-span-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(batchTotal(b))}</span>
                          <span className="col-span-2 text-slate-600 truncate">{b.paidThrough || '—'}</span>
                          <span className="col-span-1 text-slate-600 tabular-nums">{fmtDate(b.paymentDate || b.createdAt)}</span>
                          <span className="col-span-1"><DocStatusPill status={b.status} /></span>
                          <span className="col-span-1 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {b.status === 'draft' && <button onClick={() => act(b.id, 'cancel')} disabled={acting} className="text-[13px] text-slate-400 hover:text-rose-600 disabled:opacity-50">Cancel</button>}
                            {['draft', 'partially_processed', 'failed'].includes(b.status) && (
                              <button onClick={() => act(b.id, 'process')} disabled={acting} className="px-3 h-8 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">
                                {b.status === 'draft' ? 'Process' : 'Retry'}
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); openMenu(b.id, e.currentTarget); }}
                              className={`w-7 h-7 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-opacity shrink-0 ${menuAnchor?.id === b.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                              aria-label={`Actions for ${b.batchNumber || 'batch'}`}
                              title="More actions"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
                            </button>
                          </span>
                        </div>
                        {open && (
                          <div className="px-3 py-3 bg-slate-50/50 border-t border-slate-100">
                            {b.reference && <p className="text-[13px] text-slate-600 mb-2">{b.reference}</p>}
                            <div className="divide-y divide-slate-100">
                              {(b.lines || []).map((l: any) => {
                                const bill = billById.get(l.billId);
                                return (
                                  <div key={l.id} className="py-1.5 flex items-center gap-3 text-[13px]">
                                    <span className="flex-1 font-medium text-slate-900 truncate">{bill?.billNumber || l.billId.slice(0, 8)} <span className="font-normal text-slate-500">· {bill?.vendorName || ''}</span></span>
                                    <span className={`text-xs font-semibold ${l.status === 'paid' ? 'text-blue-700' : l.status === 'failed' ? 'text-rose-600' : 'text-slate-400'}`}>{l.status || 'pending'}</span>
                                    <span className="w-28 text-right font-medium tabular-nums">{fmtMoney(Number(l.amount) || 0)}</span>
                                  </div>
                                );
                              })}
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

      {/* New Batch Payment — Zoho modal wizard */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-10 overflow-y-auto" onClick={() => !acting && setModalOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-[18px] font-medium text-slate-900">{editId ? 'Edit Batch Payment' : 'New Batch Payment'}</h3>
              <button onClick={() => !acting && setModalOpen(false)} className="text-rose-500 hover:text-rose-700 text-xl leading-none" aria-label="Close">×</button>
            </div>
            {editId && editLocked && (
              <div className="mx-6 mt-4 rounded-md px-4 py-2.5 text-sm font-medium border bg-amber-50 border-amber-200 text-amber-800" role="note">
                This batch is no longer a draft — its bills are locked. Details below remain editable.
              </div>
            )}
            {step === 1 ? (
              <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className={`${LABEL} block mb-1.5`}>Batch Name<span className={REQ}>*</span></label>
                  <input value={batchName} onChange={(e) => setBatchName(e.target.value)} className={`${INPUT} w-full`} />
                </div>
                <div>
                  <label className={`${LABEL} block mb-1.5`}>Batch#</label>
                  <input value="Auto-generated" disabled className={`${INPUT} w-full bg-slate-50 text-slate-500`} />
                </div>
                <div>
                  <label className={`${LABEL} block mb-1.5`}>Paid Through<span className={REQ}>*</span></label>
                  <select value={paidThrough} onChange={(e) => setPaidThrough(e.target.value)} className={`${INPUT} w-full bg-white`}>
                    {PAID_THROUGH.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`${LABEL} block mb-1.5`}>Payment Date</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={`${INPUT} w-full`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={`${LABEL} block mb-1.5`}>Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y" />
                </div>
              </div>
            ) : (
              <div className="px-6 py-5">
                <p className="text-[13px] text-slate-500 mb-3">Tick the unpaid bills to include. Amounts default to the balance due.</p>
                {pickList.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">No unpaid bills available.</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {pickList.map((b: any) => {
                      const checked = sel[b.id] !== undefined;
                      const settled = billBalance(b) <= 0.005;
                      return (
                        <label key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBill(b.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]"
                          />
                          <span className="flex-1 truncate font-medium text-slate-800">
                            {b.billNumber} <span className="font-normal text-slate-500">· {b.vendorName} · bal {fmtMoney(billBalance(b))}</span>
                            {settled && <span className="font-normal text-amber-600"> · settled — untick to remove</span>}
                          </span>
                          <input
                            type="number" min={0} step="0.01"
                            value={sel[b.id] ?? ''}
                            disabled={!checked}
                            onChange={(e) => setSel((s) => ({ ...s, [b.id]: e.target.value }))}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="0.00"
                            className="w-28 h-8 px-2 rounded-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA] disabled:bg-slate-50 disabled:text-slate-400"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end mt-3 text-[13px] text-slate-700">
                  Batch total: <strong className="ml-2 tabular-nums">{fmtMoney(selTotal)}</strong>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-100">
              {step === 1 ? (
                editId && editLocked ? (
                  <>
                    <button onClick={saveEdit} disabled={acting} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
                      {acting ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button onClick={() => setModalOpen(false)} disabled={acting} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setStep(2)} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] shadow-sm">Next</button>
                    <button onClick={() => setModalOpen(false)} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                  </>
                )
              ) : (
                <>
                  <button onClick={() => setStep(1)} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">Back</button>
                  {editId ? (
                    <button onClick={saveEdit} disabled={acting} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
                      {acting ? 'Saving…' : 'Save Changes'}
                    </button>
                  ) : (
                    <button onClick={create} disabled={acting} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
                      {acting ? 'Creating…' : 'Create Batch'}
                    </button>
                  )}
                  <button onClick={() => setModalOpen(false)} disabled={acting} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Row menu — fixed to viewport so no scroll container or stacking context can trap it */}
      {menuAnchor && !confirmId && (
        <div className="fixed inset-0 z-40" onClick={() => setMenuAnchor(null)} />
      )}
      {menuBatch && menuAnchor && !confirmId && (
        <div
          className="fixed w-40 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-50"
          style={{ top: menuAnchor.top, left: menuAnchor.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenuAnchor(null); openEdit(menuBatch); }}
            className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
            Edit
          </button>
          <button
            onClick={() => { setMenuAnchor(null); setDeleteError(''); setConfirmId(menuBatch.id); }}
            className="w-full px-4 py-2 text-[13px] text-left text-rose-600 font-medium hover:bg-rose-50 flex items-center gap-2.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-.8 12a1 1 0 01-1 .9H7.8a1 1 0 01-1-.9L6 7" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
            Delete
          </button>
        </div>
      )}
      {/* Delete confirm */}
      {confirmBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => { if (!deleting) { setConfirmId(null); setDeleteError(''); } }}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-slate-900">Delete {confirmBatch.batchNumber}?</h3>
            <p className="text-[13px] text-slate-500 mt-1.5">
              This permanently removes the batch{confirmBatch.batchName ? ` "${confirmBatch.batchName}"` : ''}. Already-recorded bill payments are kept. This cannot be undone.
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
                onClick={() => doDelete(confirmBatch.id)}
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
