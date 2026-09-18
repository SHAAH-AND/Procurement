import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCredit, getVendors, getItems } from '../../../../api';

type Row = {
  itemName: string;
  account: string;
  quantity: string;
  rate: string;
  tax: string;
};

const ACCOUNTS = [
  'Cost of Goods Sold',
  'Office Supplies Expense',
  'Raw Materials',
  'Services Expense',
  'Maintenance Expense',
  'Rent Expense',
  'Other',
];
const TAXES = [
  { id: 'none', label: 'Select a Tax', rate: 0 },
  { id: 'vat0', label: 'No Tax', rate: 0 },
  { id: 'vat18', label: 'VAT 18%', rate: 0.18 },
  { id: 'sscl', label: 'SSCL 2.5%', rate: 0.025 },
];

const INPUT =
  'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';
const DRAFT_KEY = 'pf-credit-draft';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function VendorCreditCreatePage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [vendorName, setVendorName] = useState('');
  const [creditNo, setCreditNo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [creditDate, setCreditDate] = useState(todayISO());
  const [subject, setSubject] = useState('');
  const [taxMode, setTaxMode] = useState('Tax Exclusive');
  const [taxLevel, setTaxLevel] = useState('At Transaction Level');
  const [rows, setRows] = useState<Row[]>([
    { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none' },
  ]);
  const [discountPct, setDiscountPct] = useState('0');
  const [adjustment, setAdjustment] = useState('');
  const [adjLabel, setAdjLabel] = useState('Adjustment');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<'draft' | 'open' | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSel, setBulkSel] = useState<string[]>([]);

  useEffect(() => {
    getVendors()
      .then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
    getItems()
      .then((r: any) => setCatalog(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setVendorName(d.vendorName || '');
        setCreditNo(d.creditNo || '');
        setOrderNumber(d.orderNumber || '');
        setCreditDate(d.creditDate || todayISO());
        setSubject(d.subject || '');
        setDiscountPct(d.discountPct || '0');
        setAdjustment(d.adjustment || '');
        if (Array.isArray(d.rows) && d.rows.length) setRows(d.rows);
        setNotice('Draft restored from this device.');
      }
    } catch { /* ignore */ }
  }, []);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const calc = useMemo(() => {
    const parsed = rows.map((r) => {
      const qty = Number(r.quantity) || 0;
      const rate = Number(r.rate) || 0;
      const taxRate = TAXES.find((t) => t.id === r.tax)?.rate || 0;
      const line = qty * rate;
      return { line, taxAmt: line * taxRate };
    });
    const sub = parsed.reduce((s, r) => s + r.line, 0);
    const discPct = Math.min(100, Math.max(0, Number(discountPct) || 0));
    const discAmt = sub * (discPct / 100);
    const taxAdj = parsed.reduce((s, r) => s + r.taxAmt, 0) * (1 - discPct / 100);
    const adj = Number(adjustment) || 0;
    return { sub, discAmt, tax: taxAdj, adj, total: Math.max(0, sub - discAmt + taxAdj + adj) };
  }, [rows, discountPct, adjustment]);

  const validate = (): string => {
    if (!vendorName.trim()) return 'Select a vendor';
    if (!creditNo.trim()) return 'Enter a Credit Note#';
    const named = rows.filter((r) => r.itemName.trim());
    if (!named.length) return 'Add at least one item row';
    for (const r of named) {
      if ((Number(r.quantity) || 0) <= 0) return 'Quantity must be greater than 0';
      if ((Number(r.rate) || 0) < 0) return 'Rate cannot be negative';
    }
    if (!(calc.total > 0)) return 'Credit total must be greater than 0';
    return '';
  };

  const buildNotes = () =>
    [
      creditNo.trim() ? `Credit Note: ${creditNo.trim()}` : '',
      orderNumber.trim() ? `Order: ${orderNumber.trim()}` : '',
      subject.trim() ? `Subject: ${subject.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n') || undefined;

  const saveDraft = () => {
    if (!vendorName.trim() && !creditNo.trim() && !rows.some((r) => r.itemName.trim())) {
      setError('Nothing to save yet');
      return;
    }
    setSaving('draft');
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ vendorName, creditNo, orderNumber, creditDate, subject, discountPct, adjustment, rows }),
      );
      setNotice('Draft saved on this device.');
    } finally {
      setSaving(null);
    }
  };

  const saveOpen = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving('open');
    setError('');
    try {
      await createCredit({
        vendorName: vendorName.trim(),
        amount: Math.round(calc.total * 100) / 100,
        source: 'return',
        notes: buildNotes(),
      });
      localStorage.removeItem(DRAFT_KEY);
      navigate('/workspace/credits', { state: { notice: `Vendor credit of ${fmtMoney(calc.total)} recorded as open.` } });
    } catch (e: any) {
      setError(e?.message || 'Failed to save vendor credit');
    } finally {
      setSaving(null);
    }
  };

  const addBulk = () => {
    const picked = catalog.filter((c: any) => bulkSel.includes(c.id));
    if (picked.length) {
      setRows((rs) => {
        const base = rs.length === 1 && !rs[0].itemName ? [] : rs;
        return [
          ...base,
          ...picked.map((c: any) => ({
            itemName: c.name || c.Name || '',
            account: '',
            quantity: '1.00',
            rate: String(c.rate ?? c.costPrice ?? 0),
            tax: 'none' as string,
          })),
        ];
      });
    }
    setBulkSel([]);
    setBulkOpen(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — Zoho style */}
      <div className="flex items-center justify-between px-1 pt-1 pb-3 shrink-0">
        <h2 className="flex items-center gap-2.5 text-[20px] font-medium text-slate-900">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-800">
            <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
            <path d="M9 8h6M9 12h4" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          </svg>
          New Vendor Credit
        </h2>
        <button
          onClick={() => navigate('/workspace/credits')}
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
            <div className="col-span-12 sm:col-span-7 flex">
              <select
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className={`${INPUT} flex-1 min-w-0 rounded-r-none border-r-0 ${vendorName ? 'text-slate-900' : 'text-slate-400'}`}
              >
                <option value="">Select a Vendor</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.name || v.Name}>{v.name || v.Name}</option>
                ))}
              </select>
              <button
                onClick={() => navigate('/workspace/vendors')}
                title="Search vendors"
                className="w-10 h-9 rounded-r-lg bg-[#2084FA] text-white flex items-center justify-center hover:bg-[#1a6fd6] shrink-0"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} />
                  <path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Credit fields */}
        <div className="grid grid-cols-12 gap-x-6 gap-y-4 px-1 py-5 max-w-6xl">
          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>
            Credit Note#<span className={REQ}>*</span>
          </label>
          <div className="col-span-12 sm:col-span-4 relative">
            <input value={creditNo} onChange={(e) => setCreditNo(e.target.value)} className={`${INPUT} w-full pr-9`} />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300" title="Numbering settings">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.7} /><path d="M19 12a7 7 0 01-.4 2.3l2 1.6-2 3.4-2.4-.9a7 7 0 01-2 1.2L14 22h-4l-.2-2.4a7 7 0 01-2-1.2l-2.4.9-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.4-2.3l-2-1.6 2-3.4 2.4.9a7 7 0 012-1.2L10 2h4l.2 2.4a7 7 0 012 1.2l2.4-.9 2 3.4-2 1.6c.2.7.4 1.5.4 2.3z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg>
            </span>
          </div>
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>Order Number</label>
          <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4`} />
          <span className="hidden sm:block sm:col-span-6" />

          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2`}>Vendor Credit Date</label>
          <input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4`} />
          <span className="hidden sm:block sm:col-span-6" />
        </div>

        {/* Subject */}
        <div className="grid grid-cols-12 gap-3 px-1 py-3 border-t border-slate-100 max-w-6xl">
          <label className={`${LABEL} col-span-12 sm:col-span-2 sm:pt-2 flex items-center gap-1.5`}>
            Subject
            <span title="Subject is stored with the credit" className="w-4 h-4 rounded-full bg-slate-400 text-white text-[10px] flex items-center justify-center cursor-help">i</span>
          </label>
          <textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 250))}
            rows={2}
            placeholder="Enter a subject within 250 characters"
            className="col-span-12 sm:col-span-4 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y placeholder:text-slate-400"
          />
        </div>

        {/* Tax mode */}
        <div className="px-1 max-w-6xl">
          <div className="flex items-center gap-4 py-3 border-t border-slate-100 overflow-x-auto whitespace-nowrap">
            <span className="flex items-center gap-1.5 text-[13px] text-slate-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M5 8h14l-1.2 12H6.2L5 8z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><path d="M8.5 8V6.5a3.5 3.5 0 017 0V8" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value)} className="h-8 text-[13px] text-slate-700 bg-transparent focus:outline-none cursor-pointer">
                <option>Tax Exclusive</option>
                <option>Tax Inclusive</option>
              </select>
            </span>
            <span className="w-px h-5 bg-slate-200" />
            <span className="flex items-center gap-1.5 text-[13px] text-slate-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-slate-400"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.6} /><path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></svg>
              <select value={taxLevel} onChange={(e) => setTaxLevel(e.target.value)} className="h-8 text-[13px] text-slate-700 bg-transparent focus:outline-none cursor-pointer">
                <option>At Transaction Level</option>
                <option>At Line Item Level</option>
              </select>
            </span>
          </div>
        </div>

        {/* Item table — horizontal scroll on narrow screens */}
        <div className="px-1 pt-2 max-w-7xl">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="text-[15px] font-semibold text-slate-900">Item Table</h3>
            <button className="text-[13px] text-[#2084FA] font-medium flex items-center gap-1 hover:underline whitespace-nowrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.7} />
                <path d="M8.5 12.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Bulk Actions
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-12 gap-0 bg-white border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span className="col-span-4 px-3 py-2.5 border-r border-slate-100">Item Details</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Account</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right">Quantity</span>
                <span className="col-span-1 px-3 py-2.5 border-r border-slate-100 text-right">Rate</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Tax</span>
                <span className="col-span-1 px-3 py-2.5 text-right">Amount</span>
              </div>
              {rows.map((r, i) => {
                const amt = (Number(r.quantity) || 0) * (Number(r.rate) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white">
                    <span className="col-span-4 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.itemName}
                        onChange={(e) => setRow(i, { itemName: e.target.value })}
                        list="credit-items"
                        placeholder="Type or click to select an item."
                        className="w-full h-9 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-400"
                      />
                      <datalist id="credit-items">
                        {catalog.map((c: any) => (
                          <option key={c.id} value={c.name || c.Name} />
                        ))}
                      </datalist>
                    </span>
                    <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                      <select
                        value={r.account}
                        onChange={(e) => setRow(i, { account: e.target.value })}
                        className={`w-full h-9 text-[13px] bg-transparent focus:outline-none ${r.account ? 'text-slate-800' : 'text-slate-400'}`}
                      >
                        <option value="">Select an account</option>
                        {ACCOUNTS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </span>
                    <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.quantity}
                        onChange={(e) => setRow(i, { quantity: e.target.value })}
                        type="number" min={0} step="0.01"
                        className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded"
                      />
                    </span>
                    <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.rate}
                        onChange={(e) => setRow(i, { rate: e.target.value })}
                        type="number" min={0} step="0.01"
                        className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded"
                      />
                    </span>
                    <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                      <select
                        value={r.tax}
                        onChange={(e) => setRow(i, { tax: e.target.value })}
                        className={`w-full h-9 text-[13px] bg-transparent focus:outline-none ${r.tax === 'none' ? 'text-slate-400' : 'text-slate-800'}`}
                      >
                        {TAXES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </span>
                    <span className="col-span-1 px-3 py-1.5 flex items-center justify-end gap-2">
                      <span className="tabular-nums font-semibold">{fmtMoney(amt)}</span>
                      {rows.length > 1 && (
                        <button
                          onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                          className="text-slate-300 hover:text-rose-500 text-base leading-none"
                          aria-label="Remove row"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => setRows((rs) => [...rs, { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none' }])}
              className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5"
            >
              <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
              Add New Row
            </button>
            <button
              onClick={() => setBulkOpen(true)}
              className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5"
            >
              <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
              Add Items in Bulk
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-4">
            <div className="w-full max-w-md rounded-xl bg-slate-50/70 p-4 space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-[14px]">Sub Total</span>
                <span className="tabular-nums font-bold">{fmtMoney(calc.sub)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">Discount</span>
                <span className="flex items-center">
                  <input
                    value={discountPct}
                    onChange={(e) => setDiscountPct(e.target.value)}
                    type="number" min={0} max={100}
                    className="w-20 h-9 px-2 rounded-l-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA]"
                  />
                  <span className="h-9 px-2 rounded-r-md border border-l-0 border-slate-200 bg-white text-slate-500 flex items-center text-[13px]">%</span>
                </span>
                <span className="tabular-nums w-16 text-right">{fmtMoney(calc.discAmt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <select
                  value={adjLabel}
                  onChange={(e) => setAdjLabel(e.target.value)}
                  className="h-9 px-2 rounded-md border border-dashed border-slate-300 bg-white text-[13px] text-slate-600 focus:outline-none"
                >
                  <option>Adjustment</option>
                  <option>Less</option>
                  <option>Round off</option>
                </select>
                <span className="flex items-center gap-1.5">
                  <input
                    value={adjustment}
                    onChange={(e) => setAdjustment(e.target.value)}
                    type="number" step="0.01"
                    className="w-28 h-9 px-2 rounded-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA]"
                  />
                  <span title="Adjustment adds to the total" className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 text-[10px] flex items-center justify-center cursor-help">?</span>
                </span>
                <span className="tabular-nums w-16 text-right">{fmtMoney(calc.adj)}</span>
              </div>
              {(calc.tax > 0.005 || rows.some((r) => r.tax !== 'none')) && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Tax</span>
                  <span className="tabular-nums">{fmtMoney(calc.tax)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <span className="font-bold text-slate-900 text-[15px]">Total</span>
                <span className="tabular-nums font-bold text-[15px]">{fmtMoney(calc.total)}</span>
              </div>
            </div>
          </div>
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
          onClick={saveOpen}
          disabled={saving !== null}
          className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
        >
          {saving === 'open' ? 'Saving…' : 'Save as Open'}
        </button>
        <button
          onClick={() => navigate('/workspace/credits')}
          className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      {/* Bulk picker */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4" onClick={() => { setBulkOpen(false); setBulkSel([]); }}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-auto bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add Items from Catalog</h3>
              <button onClick={() => { setBulkOpen(false); setBulkSel([]); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-1 max-h-[50vh] overflow-auto">
              {catalog.length === 0 && <div className="text-sm text-slate-500 text-center py-8">No catalog items.</div>}
              {catalog.map((c: any) => (
                <label key={c.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkSel.includes(c.id)}
                    onChange={(e) => setBulkSel((s) => e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id))}
                    className="w-4 h-4 accent-[#2084FA]"
                  />
                  <span className="flex-1 truncate">{c.name || c.Name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setBulkOpen(false); setBulkSel([]); }} className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
              <button onClick={addBulk} disabled={!bulkSel.length} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-50">Add Selected</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
