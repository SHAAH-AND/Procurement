import { useState, useEffect } from 'react';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getBills, createBill, billAction, payBill, getBillMatch, getPos, getReceives, getVendors } from '../../../api';

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const BTN = 'px-4 h-9 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60';
const BTN_P = `${BTN} bg-[#2084FA] text-white hover:bg-blue-700`;

export function BillsPage() {
  const { data, setData, loading, error, setError } = useDocList(getBills);
  const [pos, setPos] = useState<any[]>([]);
  const [receives, setReceives] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [mode, setMode] = useState<'po' | 'receive' | 'manual'>('po');
  const [showNew, setShowNew] = useState(false);
  const [selDoc, setSelDoc] = useState('');
  const [vendor, setVendor] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [manLines, setManLines] = useState([{ itemName: '', quantity: '1', rate: '' }]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [match, setMatch] = useState<any>(null);
  const [payAmt, setPayAmt] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getPos().then((r: any) => setPos(Array.isArray(r) ? r : [])).catch(() => {});
    getReceives().then((r: any) => setReceives(Array.isArray(r) ? r : [])).catch(() => {});
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const create = async () => {
    setActing(true);
    try {
      let payload: any = { dueDate: dueDate || undefined };
      if (mode === 'po') { if (!selDoc) throw new Error('Pick a purchase order'); payload.poId = selDoc; }
      else if (mode === 'receive') { if (!selDoc) throw new Error('Pick a receive'); payload.receiveId = selDoc; }
      else {
        if (!vendor.trim()) throw new Error('Vendor is required');
        const lines = manLines.filter((l) => l.itemName.trim());
        if (!lines.length) throw new Error('Add at least one line');
        payload = { ...payload, vendorName: vendor.trim(), lines: lines.map((l) => ({ itemName: l.itemName.trim(), quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0 })) };
      }
      const created = await createBill(payload);
      setData((ds) => [created, ...ds]);
      setShowNew(false); setSelDoc(''); setVendor(''); setDueDate(''); setManLines([{ itemName: '', quantity: '1', rate: '' }]);
    } catch (e: any) { setError(e?.message || 'Failed to create bill'); } finally { setActing(false); }
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

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bills</h2>
          <p className="text-sm text-slate-500 mt-1">Vendor bills with 3-way matching and payments</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Bill</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex justify-between"><span>{error}</span><button onClick={() => setError('')} className="underline">Dismiss</button></div>}
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <div className="flex gap-2 text-sm">
            {(['po', 'receive', 'manual'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setSelDoc(''); }} className={`px-3 h-8 rounded-lg font-medium ${mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {m === 'po' ? 'From PO' : m === 'receive' ? 'From Receive' : 'Manual'}
              </button>
            ))}
          </div>
          {mode === 'po' && (
            <select value={selDoc} onChange={(e) => setSelDoc(e.target.value)} className={`${INPUT} bg-white w-full`}>
              <option value="">Select PO…</option>
              {pos.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendorName} ({p.status})</option>)}
            </select>
          )}
          {mode === 'receive' && (
            <select value={selDoc} onChange={(e) => setSelDoc(e.target.value)} className={`${INPUT} bg-white w-full`}>
              <option value="">Select receive…</option>
              {receives.filter((r: any) => r.status === 'completed').map((r: any) => <option key={r.id} value={r.id}>{r.grnNumber} — PO {r.po?.poNumber}</option>)}
            </select>
          )}
          {mode === 'manual' && (
            <>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} list="bill-vendors" placeholder="Vendor *" className={`${INPUT} w-full`} />
              <datalist id="bill-vendors">{vendors.map((v: any, i: number) => <option key={v.id || i} value={v.name || v.Name} />)}</datalist>
              {manLines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input value={l.itemName} onChange={(e) => setManLines((ls) => ls.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} placeholder="Item *" className={`${INPUT} col-span-6`} />
                  <input value={l.quantity} onChange={(e) => setManLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} type="number" min={0} placeholder="Qty" className={`${INPUT} col-span-3`} />
                  <input value={l.rate} onChange={(e) => setManLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} type="number" min={0} placeholder="Rate" className={`${INPUT} col-span-3`} />
                </div>
              ))}
              <button onClick={() => setManLines((ls) => [...ls, { itemName: '', quantity: '1', rate: '' }])} className="text-xs font-semibold text-blue-700 hover:underline">+ Add line</button>
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-700">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${INPUT} mt-1 w-full`} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Create Bill</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No bills yet — create one from a PO or receive.</div>
          : data.map((b: any) => (
            <div key={b.id}>
              <button onClick={() => { setOpenId(openId === b.id ? null : b.id); setMatch(null); }} className="w-full px-4 py-3 flex items-center gap-4 text-sm rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)] hover:border-slate-300 text-left">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{b.billNumber}</span>
                <span className="flex-1 font-medium text-slate-700 truncate">{b.vendorName}</span>
                <span className="hidden sm:block text-slate-500 w-28 text-right">Bal LKR {Number(b.balance ?? 0).toFixed(2)}</span>
                <DocStatusPill status={b.status} />
              </button>
              {openId === b.id && (
                <div className="mt-2 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {(b.lines || []).map((l: any) => (
                      <div key={l.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                        <span className="flex-[2] font-medium text-slate-900 truncate">{l.itemName}</span>
                        <span className="w-16 text-right text-slate-600">× {l.quantity}</span>
                        <span className="w-28 text-right font-medium text-slate-900">LKR {(l.quantity * l.rate).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex gap-4 flex-wrap">
                    <span>PO: <strong>{b.poId ? b.poId.slice(0, 8) : '—'}</strong></span>
                    <span>Due: <strong>{b.dueDate ? String(b.dueDate).slice(0, 10) : '—'}</strong></span>
                    <span>Paid: <strong>LKR {Number(b.amountPaid || 0).toFixed(2)}</strong></span>
                    <button onClick={() => showMatch(b.id)} className="font-semibold text-blue-700 hover:underline">Check 3-way match</button>
                  </div>
                  {match?.billId === b.id && (
                    <div className="px-5 py-3 border-t border-slate-100 text-xs">
                      <div className="font-bold text-slate-900 mb-2">Match: {match.matchPct}%</div>
                      {match.lines.map((l: any, i: number) => (
                        <div key={i} className="flex justify-between py-1 border-b border-slate-50 last:border-0">
                          <span className="text-slate-700">{l.itemName}</span>
                          <span className={l.matched ? 'text-blue-700 font-semibold' : l.matched === null ? 'text-slate-400' : 'text-rose-700 font-semibold'}>{l.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap items-center">
                    {b.status === 'draft' && <button onClick={() => act(b.id, 'submit')} disabled={acting} className={BTN_P}>Submit</button>}
                    {b.status === 'pending' && <button onClick={() => act(b.id, 'approve')} disabled={acting} className={BTN_P}>Approve</button>}
                    {['draft', 'open'].includes(b.status) && <button onClick={() => { if (window.confirm(`Void ${b.billNumber}?`)) act(b.id, 'void'); }} disabled={acting} className="px-4 h-9 text-sm text-slate-500 hover:text-rose-600">Void</button>}
                    {['open', 'overdue', 'partially_paid'].includes(b.status) && (
                      <span className="flex items-center gap-2 ml-auto">
                        <input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} type="number" min={0} step="0.01" placeholder="Amount" className={`${INPUT} w-32`} />
                        <button onClick={() => pay(b.id)} disabled={acting} className={BTN_P}>Record Payment</button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}