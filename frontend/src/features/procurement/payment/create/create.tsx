import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVendors, getBills, multiPay } from '../../../../api';
import { evaluateRules } from '../../../settings/bind';

const PAYMENT_MODES = ['Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'Online', 'Other'];
const PAID_THROUGH = ['Petty Cash', 'Bank Account', 'Credit Card', 'Online Wallet', 'Other'];

const INPUT =
  'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';
const DRAFT_KEY = 'pf-payment-draft';

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

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const billTotal = (b: any) => Number(b.total ?? (b.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.rate || 0), 0));
const billDue = (b: any) => Number(b.balance ?? (billTotal(b) - Number(b.amountPaid || 0)));

export function RecordPaymentPage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [vendorName, setVendorName] = useState('');
  const [paymentNo, setPaymentNo] = useState('');
  const [tendered, setTendered] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [mode, setMode] = useState('');
  const [paidThrough, setPaidThrough] = useState('Petty Cash');
  const [refNo, setRefNo] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<'draft' | 'paid' | null>(null);

  useEffect(() => {
    getVendors()
      .then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
    getBills()
      .then((r: any) => setBills(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setVendorName(d.vendorName || '');
        setPaymentNo(d.paymentNo || '');
        setTendered(d.tendered || '');
        setPayDate(d.payDate || todayISO());
        setMode(d.mode || '');
        setPaidThrough(d.paidThrough || 'Petty Cash');
        setRefNo(d.refNo || '');
        setAmounts(d.amounts || {});
        setNotes(d.notes || '');
        setNotice('Draft restored from this device.');
      }
    } catch { /* ignore */ }
  }, []);

  const vendorBills = useMemo(() => {
    if (!vendorName.trim()) return [];
    return bills.filter(
      (b: any) =>
        (b.vendorName || '').toLowerCase() === vendorName.trim().toLowerCase() &&
        ['open', 'overdue', 'partially_paid'].includes(b.status) &&
        billDue(b) > 0.005,
    );
  }, [bills, vendorName]);

  const used = useMemo(
    () => Object.values(amounts).reduce((s, a) => s + (Number(a) || 0), 0),
    [amounts],
  );
  const tenderedNum = Number(tendered) || 0;
  const excess = Math.max(0, tenderedNum - used);

  const clearApplied = () => setAmounts({});

  const validate = (forPay: boolean): string => {
    if (!vendorName.trim()) return 'Select a vendor';
    if (!paymentNo.trim()) return 'Enter a Payment#';
    if (!(tenderedNum > 0)) return 'Enter the payment made amount';
    if (!payDate) return 'Select a payment date';
    if (!paidThrough) return 'Select which account the payment goes through';
    if (!vendorBills.length) return 'There are no unpaid bills for this vendor';
    for (const b of vendorBills) {
      const a = Number(amounts[b.id] || 0);
      if (a < 0) return 'Applied amounts cannot be negative';
      if (a - billDue(b) > 0.005) return `${b.billNumber}: applied exceeds the amount due`;
    }
    if (forPay) {
      if (!(used > 0)) return 'Apply an amount to at least one bill';
      if (used - tenderedNum > 0.005) return 'Applied amount exceeds the payment made';
    }
    return '';
  };

  const saveDraft = () => {
    const problem = validate(false);
    if (problem && !vendorName.trim()) {
      setError(problem);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving('draft');
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ vendorName, paymentNo, tendered, payDate, mode, paidThrough, refNo, amounts, notes }),
      );
      setNotice('Draft saved on this device.');
    } finally {
      setSaving(null);
    }
  };

  const savePaid = async () => {
    const problem = validate(true);
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving('paid');
    setError('');
    try {
      // Workflow guard: notify rules from Settings → Automation (blocks never apply to payments)
      const gate = await evaluateRules('payment.record', tenderedNum);
      if (gate.blocked) {
        setError(gate.blocked);
        window.scrollTo({ top: 0 });
        setSaving(null);
        return;
      }
      if (gate.notices.length) setNotice(gate.notices.join(' '));
      const entries = vendorBills
        .map((b) => ({ billId: b.id, amount: Number(amounts[b.id] || 0) }))
        .filter((l) => l.amount > 0);
      // Tendered remainder rides on the last bill — the backend books it as a vendor credit.
      const remainder = Math.round((tenderedNum - used) * 100) / 100;
      if (remainder > 0.005) entries[entries.length - 1].amount = Math.round((entries[entries.length - 1].amount + remainder) * 100) / 100;
      const reference = [paymentNo.trim() ? `#${paymentNo.trim()}` : '', refNo.trim(), notes.trim()].filter(Boolean).join(' · ') || undefined;
      const method = [mode, paidThrough].filter(Boolean).join(' · ') || undefined;
      await multiPay({ vendorName: vendorName.trim(), method, reference, paidAt: payDate, lines: entries });
      localStorage.removeItem(DRAFT_KEY);
      navigate('/workspace/payments', { state: { notice: `Payment of ${fmtMoney(tenderedNum)} recorded${remainder > 0.005 ? ` — ${fmtMoney(remainder)} excess kept as vendor credit` : ''}.` } });
    } catch (e: any) {
      setError(e?.message || 'Failed to record payment');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — Zoho style */}
      <div className="flex items-center justify-between px-1 pt-1 pb-3 shrink-0">
        <h2 className="flex items-center gap-2.5 text-[20px] font-medium text-slate-900">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-800">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.8} />
            <path d="M12 8v8M9 10.5c0-1.2 1.3-2 3-2s3 .8 3 2-1.3 2-3 2.5-3 1.3-3 2.5c0 1.2 1.3 2 3 2s3-.8 3-2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
          Record Payment
        </h2>
        <button
          onClick={() => navigate('/workspace/payments')}
          className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {error && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3 shrink-0" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3 shrink-0" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto pb-4">
        {/* Vendor */}
        <div className="bg-slate-50/60 border-y border-slate-100 px-1 py-3">
          <div className="grid grid-cols-12 gap-3 items-center max-w-6xl">
            <label className={`${LABEL} col-span-12 sm:col-span-2`}>
              Vendor Name<span className={REQ}>*</span>
            </label>
            <div className="col-span-12 sm:col-span-6">
              <select
                value={vendorName}
                onChange={(e) => { setVendorName(e.target.value); setAmounts({}); }}
                className={`${INPUT} w-full ${vendorName ? 'text-slate-900' : 'text-slate-400'}`}
              >
                <option value="">Select Vendor</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.name || v.Name}>{v.name || v.Name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Payment fields */}
        <div className="grid grid-cols-12 gap-x-6 gap-y-4 px-1 py-5 max-w-6xl">
          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>
            Payment #<span className={REQ}>*</span>
          </label>
          <input value={paymentNo} onChange={(e) => setPaymentNo(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4`} />
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>
            Payment Made<span className={REQ}>*</span>
          </label>
          <input value={tendered} onChange={(e) => setTendered(e.target.value)} type="number" min={0} step="0.01" className={`${INPUT} col-span-12 sm:col-span-4`} />
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>
            Payment Date<span className={REQ}>*</span>
          </label>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4`} />
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>Payment Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4 bg-white ${mode ? '' : 'text-slate-400'}`}>
            <option value="">Choose the payment term or type to add</option>
            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>
            Paid Through<span className={REQ}> *</span>
          </label>
          <select value={paidThrough} onChange={(e) => setPaidThrough(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4 bg-white`}>
            <option value="">Select an account</option>
            {PAID_THROUGH.map((p) => <option key={p}>{p}</option>)}
          </select>
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>Reference#</label>
          <input value={refNo} onChange={(e) => setRefNo(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4`} />
        </div>

        {/* Bills table */}
        <div className="px-1 max-w-7xl">
          <div className="flex items-center justify-end mb-1">
            <button onClick={clearApplied} className="text-[13px] text-slate-400 hover:text-[#2084FA] hover:underline">Clear Applied Amount</button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-12 gap-0 bg-white border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Date</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Bill#</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right">Bill Amount</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right">Amount Due</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Payment Made on <span title="Applied immediately on save" className="inline-flex w-3.5 h-3.5 rounded-full border border-slate-300 text-slate-400 text-[9px] items-center justify-center cursor-help">i</span></span>
                <span className="col-span-2 px-3 py-2.5 text-right">Payment</span>
              </div>
              {vendorBills.length === 0 ? (
                <div className="py-10 text-center text-[14px] text-slate-400">There are no bills for this vendor.</div>
              ) : (
                vendorBills.map((b: any) => (
                  <div key={b.id} className="grid grid-cols-12 gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white items-center">
                    <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-slate-600 tabular-nums">{fmtDate(b.issueDate)}</span>
                    <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 font-medium text-[#2084FA] truncate">{b.billNumber}</span>
                    <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right tabular-nums">{fmtMoney(billTotal(b))}</span>
                    <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right tabular-nums">{fmtMoney(billDue(b))}</span>
                    <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-slate-400 text-xs">On save</span>
                    <span className="col-span-2 px-3 py-2.5">
                      <input
                        value={amounts[b.id] ?? ''}
                        onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: e.target.value }))}
                        type="number" min={0} step="0.01" max={billDue(b)}
                        placeholder="0.00"
                        className="w-full h-9 px-2 rounded-md border border-slate-200 text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA]"
                      />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-3">
            <div className="w-full max-w-md rounded-xl bg-slate-50/70 p-4 space-y-2.5 text-[13px]">
              <div className="flex items-center justify-between text-slate-500">
                <span>Total :</span>
                <span className="tabular-nums">{fmtMoney(vendorBills.reduce((s, b) => s + billDue(b), 0))}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="tabular-nums font-semibold text-slate-900">{fmtMoney(tenderedNum)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Amount used for Payments:</span>
                <span className="tabular-nums">{fmtMoney(used)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">⚠ Amount in Excess:</span>
                <span className="tabular-nums">{fmtMoney(excess)}</span>
              </div>
              {excess > 0.005 && (
                <p className="text-xs text-amber-700">Excess is kept as a vendor credit on save.</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="mt-8 max-w-4xl">
            <label className={`${LABEL} block mb-1.5`}>Notes (Internal use. Not visible to vendor)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y"
            />
          </div>
          <p className="text-[13px] text-slate-500 mt-6">
            <span className="font-semibold">Additional Fields:</span> Start adding custom fields for your payments made by going to <span className="italic">Settings ➔ Purchases ➔ Payments Made.</span>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-200 px-1 pb-1 bg-white sticky bottom-0 shrink-0">
        <button
          onClick={saveDraft}
          disabled={saving !== null}
          className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {saving === 'draft' ? 'Saving…' : 'Save as Draft'}
        </button>
        <button
          onClick={savePaid}
          disabled={saving !== null}
          className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
        >
          {saving === 'paid' ? 'Saving…' : 'Save as Paid'}
        </button>
        <button
          onClick={() => navigate('/workspace/payments')}
          className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
