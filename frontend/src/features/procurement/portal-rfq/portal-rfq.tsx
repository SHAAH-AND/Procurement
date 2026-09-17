import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { portalView, portalQuote } from '../../../api';

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

export function PortalRfqPage() {
  const { token } = useParams();
  const [rfq, setRfq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [lead, setLead] = useState<Record<string, string>>({});
  const [validTill, setValidTill] = useState('');
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    portalView(token).then(setRfq).catch((e: any) => setError(e?.message || 'Invalid link')).finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!token) return;
    const lines = Object.entries(prices).filter(([, p]) => Number(p) >= 0 && p !== '').map(([rfqLineId, p]) => ({
      rfqLineId, quantity: Number((rfq.lines as any[]).find((l) => l.rfqLineId === rfqLineId)?.quantity || 0),
      unitPrice: Number(p), leadDays: lead[rfqLineId] ? Number(lead[rfqLineId]) : undefined,
    }));
    if (!lines.length) { setError('Enter at least one price'); return; }
    setSending(true);
    try {
      await portalQuote(token, { lines, validTill: validTill || undefined });
      setDone(true);
    } catch (e: any) { setError(e?.message || 'Submit failed'); } finally { setSending(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (error && !rfq) return <div className="min-h-screen flex items-center justify-center text-sm text-rose-700">{error}</div>;

  return (
    <div className="min-h-screen bg-[#E7EDF9] px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pf-pattern-bg opacity-70 pointer-events-none select-none" aria-hidden="true" />
      <div className="max-w-2xl mx-auto relative z-10">
        <div className="flex justify-center mb-5">
          <img src="/img/procureflow-logo-full.png" alt="ProcureFlow — Smarter Procurement. Simplified." className="h-12 w-auto object-contain" />
        </div>
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-[#2084FA] to-[#7F3EDD]" />
          <div className="p-6 space-y-4">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Vendor Quotation</div>
          <h1 className="text-lg font-bold text-slate-900 mt-1">{rfq.rfqNumber}</h1>
          <p className="text-sm text-slate-500">Hello {rfq.vendorName} — submit your best prices below.</p>
        </div>
        {rfq.message && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{rfq.message}</div>}
        {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
        {done ? (
          <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-4 font-medium">Quotation submitted. We will notify you of the outcome.</div>
        ) : (
          <>
            {(rfq.lines || []).map((l: any) => (
              <div key={l.rfqLineId} className="grid grid-cols-12 gap-2 items-center text-sm">
                <span className="col-span-5 font-medium text-slate-900">{l.itemName} <span className="text-slate-400">× {l.quantity}</span></span>
                <input value={prices[l.rfqLineId] || ''} onChange={(e) => setPrices((p) => ({ ...p, [l.rfqLineId]: e.target.value }))} type="number" min={0} step="0.01" placeholder="Unit price" className={`${INPUT} col-span-4`} />
                <input value={lead[l.rfqLineId] || ''} onChange={(e) => setLead((p) => ({ ...p, [l.rfqLineId]: e.target.value }))} type="number" min={0} placeholder="Lead days" className={`${INPUT} col-span-3`} />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold text-slate-700">Quote valid till</label>
              <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
            <button onClick={submit} disabled={sending} className="w-full py-3 rounded-xl bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">Submit Quotation</button>
          </>
        )}
          </div>
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-400">
            Secured by ProcureFlow · Smarter Procurement. Simplified.
          </div>
        </div>
      </div>
    </div>
  );
}

