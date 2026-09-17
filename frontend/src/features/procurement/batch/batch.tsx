import { useState, useEffect } from 'react';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getBills, getBatches, createBatch, batchAction } from '../../../api';

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const BTN = 'px-4 h-9 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60';
const BTN_P = `${BTN} bg-[#2084FA] text-white hover:bg-blue-700`;
const BTN_S = `${BTN} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`;

export function BatchPaymentsPage() {
  const { data, setData, loading, error, setError } = useDocList(getBatches);
  const [bills, setBills] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [selBills, setSelBills] = useState<string[]>([]);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!name.trim() || !selBills.length) { setError('Batch name + at least one bill required'); return; }
    setActing(true);
    try {
      const created = await createBatch({ name: name.trim(), billIds: selBills });
      setData((ds: any[]) => [created, ...ds]);
      setShowNew(false); setName(''); setSelBills([]);
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  const act = async (id: string, action: string) => {
    setActing(true);
    try {
      const updated = await batchAction(id, action);
      setData((ds: any[]) => ds.map((d: any) => (d.id === updated.id ? updated : d)));
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const openBills = bills.filter((b: any) => ['open', 'overdue', 'partially_paid'].includes(b.status));

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Batch Payments</h2>
          <p className="text-sm text-slate-500 mt-1">Group multiple bills into one payment run</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Batch</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex justify-between"><span>{error}</span><button onClick={() => setError('')} className="underline">Dismiss</button></div>}
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Batch name *" className={`${INPUT} w-full`} />
          <div className="text-xs font-semibold text-slate-700">Select bills to include</div>
          {openBills.length === 0 ? <div className="text-xs text-slate-400">No open bills available.</div> :
            openBills.map((b: any) => (
              <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selBills.includes(b.id)} onChange={(e) => setSelBills((s) => e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id))} className="w-4 h-4" />
                {b.billNumber} — {b.vendorName} (bal LKR {Number(b.balance ?? 0).toFixed(2)})
              </label>
            ))}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting || !selBills.length} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Create Batch</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No batch payments yet.</div>
          : data.map((b: any) => (
            <div key={b.id} className="px-4 py-3 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{b.batchNumber}</span>
                <span className="flex-1 text-slate-700 truncate">{b.bills?.length || 0} bills · LKR {Number(b.totalAmount || 0).toFixed(2)}</span>
                <DocStatusPill status={b.status} />
                <span className="text-xs text-slate-500">{new Date(b.createdAt).toLocaleDateString()}</span>
                {b.status === 'draft' && <button onClick={() => act(b.id, 'submit')} disabled={acting} className={BTN_S}>Submit</button>}
                {b.status === 'pending' && <button onClick={() => act(b.id, 'approve')} disabled={acting} className={BTN_P}>Approve</button>}
                {b.status === 'approved' && <button onClick={() => act(b.id, 'pay')} disabled={acting} className={BTN_P}>Execute Payment</button>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}