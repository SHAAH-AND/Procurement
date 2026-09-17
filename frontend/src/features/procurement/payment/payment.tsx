import { useState, useEffect } from 'react';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getPayments, getCredits, getBills, createCredit, applyCredit, multiPay } from '../../../api';

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const BTN = 'px-4 h-9 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60';
const BTN_P = `${BTN} bg-[#2084FA] text-white hover:bg-blue-700`;
const BTN_S = `${BTN} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`;

export function PaymentsPage() {
  const { data: payments, loading, error, setError } = useDocList(getPayments);
  const [credits, setCredits] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [vName, setVName] = useState('');
  const [vAmt, setVAmt] = useState('');
  const [acting, setActing] = useState(false);
  const [applyFor, setApplyFor] = useState<string | null>(null);
  const [applyBill, setApplyBill] = useState('');
  const [applyAmt, setApplyAmt] = useState('');
  const [multiAmts, setMultiAmts] = useState<Record<string, string>>({});
  const [multiMethod, setMultiMethod] = useState('');
  const [showMulti, setShowMulti] = useState(false);

  useEffect(() => {
    getCredits().then((r: any) => setCredits(Array.isArray(r) ? r : [])).catch(() => {});
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const recordCredit = async () => {
    if (!vName.trim() || !(Number(vAmt) > 0)) { setError('Vendor + amount required'); return; }
    setActing(true);
    try {
      const c = await createCredit({ vendorName: vName.trim(), amount: Number(vAmt), source: 'return' });
      setCredits((cs) => [c, ...cs]);
      setVName(''); setVAmt('');
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  const apply = async (id: string) => {
    if (!applyBill || !(Number(applyAmt) > 0)) { setError('Pick a bill + amount'); return; }
    setActing(true);
    try {
      await applyCredit(id, { billId: applyBill, amount: Number(applyAmt) });
      const fresh: any = await getCredits();
      setCredits(Array.isArray(fresh) ? fresh : []);
      setApplyFor(null); setApplyBill(''); setApplyAmt('');
    } catch (e: any) { setError(e?.message || 'Apply failed'); } finally { setActing(false); }
  };

  const openBills = bills.filter((b: any) => ['open', 'overdue', 'partially_paid'].includes(b.status));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Payments Made</h2>
        <p className="text-sm text-slate-500 mt-1">Every recorded payment, plus vendor credits</p>
      </div>
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex justify-between"><span>{error}</span><button onClick={() => setError('')} className="underline">Dismiss</button></div>}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <button onClick={() => setShowMulti((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-900">
          Pay multiple bills (one tender, split across bills)
          <span className="text-blue-700">{showMulti ? '−' : '+'}</span>
        </button>
        {showMulti && (
          <div className="p-4 border-t border-slate-100 space-y-2">
            <div className="flex gap-2">
              <input value={multiMethod} onChange={(e) => setMultiMethod(e.target.value)} placeholder="Method (Bank transfer, Cash…)" className={`${INPUT} flex-1`} />
            </div>
            {openBills.length === 0 ? <div className="text-xs text-slate-400">No open bills.</div> :
              openBills.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 text-slate-700 truncate">{b.billNumber} — {b.vendorName} <span className="text-slate-400">(bal LKR {Number(b.balance ?? 0).toFixed(2)})</span></span>
                  <input value={multiAmts[b.id] || ''} onChange={(e) => setMultiAmts((a) => ({ ...a, [b.id]: e.target.value }))} type="number" min={0} placeholder="0" className={`${INPUT} w-28`} />
                </div>
              ))}
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  const lines = Object.entries(multiAmts).filter(([, a]) => Number(a) > 0).map(([billId, a]) => ({ billId, amount: Number(a) }));
                  if (!lines.length) { setError('Enter amounts'); return; }
                  setActing(true);
                  try {
                    await multiPay({ method: multiMethod.trim() || undefined, lines });
                    setMultiAmts({}); setMultiMethod(''); setShowMulti(false);
                  } catch (e: any) { setError(e?.message || 'Multi-pay failed'); } finally { setActing(false); }
                }}
                disabled={acting}
                className={BTN_P}
              >
                Pay Selected
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor Credits</div>
        <div className="p-4 flex gap-2 flex-wrap items-center border-b border-slate-100">
          <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Vendor" className={`${INPUT} w-44`} />
          <input value={vAmt} onChange={(e) => setVAmt(e.target.value)} type="number" min={0} placeholder="Amount" className={`${INPUT} w-32`} />
          <button onClick={recordCredit} disabled={acting} className={BTN_S}>+ Return / Advance</button>
        </div>
        <div className="divide-y divide-slate-100">
          {credits.length === 0 ? <div className="p-4 text-sm text-slate-400">No credits.</div> :
            credits.map((c: any) => (
              <div key={c.id} className="px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-medium text-slate-900">{c.vendorName} <span className="text-slate-400 font-normal">· {c.source}</span></span>
                  <span className="text-slate-600">LKR {Number(c.remaining).toFixed(2)} / {Number(c.amount).toFixed(2)}</span>
                  <DocStatusPill status={c.status} />
                  {c.status === 'open' && <button onClick={() => setApplyFor(applyFor === c.id ? null : c.id)} className="text-xs font-semibold text-blue-700 hover:underline">Apply</button>}
                </div>
                {applyFor === c.id && (
                  <div className="flex gap-2 mt-2">
                    <select value={applyBill} onChange={(e) => setApplyBill(e.target.value)} className={`${INPUT} bg-white flex-1`}>
                      <option value="">Pick bill…</option>
                      {openBills.filter((b: any) => b.vendorName === c.vendorName).map((b: any) => <option key={b.id} value={b.id}>{b.billNumber} — bal LKR {Number(b.balance ?? 0).toFixed(2)}</option>)}
                    </select>
                    <input value={applyAmt} onChange={(e) => setApplyAmt(e.target.value)} type="number" min={0} placeholder="Amt" className={`${INPUT} w-28`} />
                    <button onClick={() => apply(c.id)} disabled={acting} className={BTN_P}>Apply</button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment History</div>
        {loading ? <div className="p-6 text-center text-sm text-slate-400">Loading…</div>
          : payments.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No payments recorded yet — pay from a bill.</div>
          : <div className="divide-y divide-slate-100">
            {payments.slice(0, 30).map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                <span className="flex-1 font-medium text-slate-900 truncate">{p.vendorName} <span className="text-slate-400 font-normal">· {p.method || '—'} {p.reference ? `· ${p.reference}` : ''}</span></span>
                <span className="text-slate-500 text-xs">{new Date(p.paidAt || p.createdAt).toLocaleDateString()}</span>
                <span className="w-28 text-right font-bold text-slate-900">LKR {Number(p.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>}
      </div>
    </div>
  );
}