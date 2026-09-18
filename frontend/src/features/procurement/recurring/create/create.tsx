import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createBill, createRecurrence, getRecurrence, getBill, updateRecurrence, updateBill, getVendors, getItems } from '../../../../api';
import { useAccounts, useTaxes, taxIdForTaxes } from '../../../settings/bind';

type Row = {
  itemName: string;
  account: string;
  quantity: string;
  rate: string;
  tax: string;
  customer: string;
};

const FREQUENCIES = [
  { id: 'weekly', label: 'Week' },
  { id: 'monthly', label: 'Month' },
  { id: 'quarterly', label: 'Quarter' },
  { id: 'yearly', label: 'Year' },
];
const PAYMENT_TERMS = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due end of month', 'Advance', 'COD'];

const INPUT =
  'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isoDay = (v: any): string => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const taxIdFor = (stored: any, taxes: { id: string; label: string }[]): string => taxIdForTaxes(taxes, stored);

export function RecurringBillCreatePage({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const isEdit = !!editId;
  const [vendors, setVendors] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [editLoading, setEditLoading] = useState(isEdit);
  const [templateId, setTemplateId] = useState('');
  const [tplStatus, setTplStatus] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [startOn, setStartOn] = useState(todayISO());
  const [endsOn, setEndsOn] = useState('');
  const [neverExpires, setNeverExpires] = useState(true);
  const [paymentTerms, setPaymentTerms] = useState('Due on Receipt');
  const [taxMode, setTaxMode] = useState('Tax Exclusive');
  const [taxLevel, setTaxLevel] = useState('At Transaction Level');
  const [rows, setRows] = useState<Row[]>([
    { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none', customer: '' },
  ]);
  const [discountPct, setDiscountPct] = useState('0');
  const [adjustment, setAdjustment] = useState('');
  const [adjLabel, setAdjLabel] = useState('Adjustment');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const accounts = useAccounts();
  const taxes = useTaxes();

  useEffect(() => {
    getVendors()
      .then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
    getItems()
      .then((r: any) => setCatalog(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
  }, []);

  // Edit mode: prefill schedule + template bill
  useEffect(() => {
    if (!editId) return;
    setEditLoading(true);
    (async () => {
      try {
        const rec: any = await getRecurrence(editId);
        const r = rec?.data ?? rec;
        setProfileName(r.profileName || '');
        const freq = String(r.frequency || 'monthly').toLowerCase();
        setFrequency(['weekly', 'monthly', 'quarterly', 'yearly'].includes(freq) ? freq : 'monthly');
        setStartOn(isoDay(r.startDate) || todayISO());
        if (r.endDate) { setEndsOn(isoDay(r.endDate)); setNeverExpires(false); }
        else { setEndsOn(''); setNeverExpires(true); }
        if (!r.templateBillId) throw new Error('Schedule has no template bill');
        setTemplateId(r.templateBillId);
        const b: any = await getBill(r.templateBillId);
        const bill = b?.data ?? b;
        setTplStatus(bill.status || '');
        setVendorName(bill.vendorName || '');
        setPaymentTerms(bill.paymentTerms || 'Due on Receipt');
        setDiscountPct(String(bill.discountPercent ?? 0));
        setAdjustment(bill.adjustment != null ? String(bill.adjustment) : '');
        setAdjLabel(bill.adjustmentLabel || 'Adjustment');
        const rawNotes = String(bill.notes || '');
        setNotes(rawNotes.replace(/^Recurring template — "[^"]*"\n?/, ''));
        const lines = Array.isArray(bill.lines) ? bill.lines : [];
        if (lines.length) {
          setRows(
            lines.map((l: any) => ({
              itemName: l.itemName || '',
              account: l.account || '',
              quantity: String(l.quantity ?? 1),
              rate: String(l.rate ?? 0),
              tax: taxIdFor(l.tax, taxes),
              customer: l.customer || '',
            })),
          );
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load schedule');
      } finally {
        setEditLoading(false);
      }
    })();
  }, [editId]);

  // Template bills that left draft already moved accruals/payments — items stay locked.
  const locked = isEdit && tplStatus !== '' && tplStatus !== 'draft';

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const calc = useMemo(() => {
    const parsed = rows.map((r) => {
      const qty = Number(r.quantity) || 0;
      const rate = Number(r.rate) || 0;
      const taxRate = taxes.find((t: any) => t.id === r.tax)?.rate || 0;
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
    if (!profileName.trim()) return 'Enter a profile name';
    if (!frequency) return 'Choose how often the bill repeats';
    if (!startOn) return 'Select a start date';
    if (!neverExpires && !endsOn) return 'Select an end date or tick Never Expires';
    if (!neverExpires && endsOn && endsOn < startOn) return 'End date cannot be before the start date';
    if (locked) return '';
    const named = rows.filter((r) => r.itemName.trim());
    if (!named.length) return 'Add at least one item row';
    for (const r of named) {
      if ((Number(r.quantity) || 0) <= 0) return 'Quantity must be greater than 0';
      if ((Number(r.rate) || 0) < 0) return 'Rate cannot be negative';
    }
    return '';
  };

  const buildBillLines = () =>
    rows
      .filter((r) => r.itemName.trim())
      .map((r) => ({
        itemName: r.itemName.trim(),
        quantity: Number(r.quantity) || 1,
        rate: Number(r.rate) || 0,
        account: r.account || undefined,
        tax: r.tax === 'none' ? undefined : taxes.find((t: any) => t.id === r.tax)?.label || r.tax,
        customer: r.customer.trim() || undefined,
      }));

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit && editId) {
        await updateRecurrence(editId, {
          profileName: profileName.trim(),
          frequency,
          startDate: startOn,
          endDate: neverExpires ? null : endsOn || null,
        });
        if (templateId) {
          const header: any = {
            subject: profileName.trim(),
            notes: [`Recurring template — "${profileName.trim()}"`, notes.trim()].filter((s) => s).join('\n') || undefined,
            paymentTerms,
          };
          if (!locked) {
            const v = vendors.find((x: any) => (x.name || x.Name) === vendorName.trim());
            header.vendorId = v?.id;
            header.vendorName = vendorName.trim();
            header.discountPercent = Number(discountPct) || 0;
            header.adjustment = Number(adjustment) || 0;
            header.adjustmentLabel = adjLabel;
            header.lines = buildBillLines();
          }
          await updateBill(templateId, header);
        }
        navigate('/workspace/recurring');
        return;
      }
      const v = vendors.find((x: any) => (x.name || x.Name) === vendorName.trim());
      // Step 1: template bill carries the vendor + items the schedule repeats.
      const tpl: any = await createBill({
        vendorId: v?.id,
        vendorName: vendorName.trim(),
        paymentTerms,
        subject: profileName.trim(),
        notes: [`Recurring template — "${profileName.trim()}"`, notes.trim()].filter((s) => s).join('\n') || undefined,
        discountPercent: Number(discountPct) || 0,
        adjustment: Number(adjustment) || 0,
        adjustmentLabel: adjLabel,
        lines: buildBillLines(),
      });
      const tplId = tpl?.id || tpl?.data?.id;
      if (!tplId) throw new Error('Template bill was not created');
      // Step 2: schedule that stamps out bills from the template.
      await createRecurrence({
        templateBillId: tplId,
        profileName: profileName.trim(),
        frequency,
        startDate: startOn,
        endDate: neverExpires ? undefined : endsOn || undefined,
      });
      navigate('/workspace/recurring');
    } catch (e: any) {
      setError(e?.message || 'Failed to save recurring bill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — Zoho style */}
      <div className="flex items-center justify-between px-1 pt-1 pb-3 shrink-0">
        <h2 className="flex items-center gap-2.5 text-[20px] font-medium text-slate-900">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-800">
            <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
            <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          </svg>
          {isEdit ? `Edit Recurring Bill${profileName ? ` — ${profileName}` : ''}` : 'New Recurring Bill'}
        </h2>
        <button
          onClick={() => navigate('/workspace/recurring')}
          className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {error && (
        <div
          className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3 shrink-0"
          role="alert"
        >
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {editLoading && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 shrink-0" role="status">
          Loading schedule…
        </div>
      )}
      {locked && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-amber-50 border-amber-200 text-amber-800 shrink-0" role="note">
          The template bill is {tplStatus} — vendor, items, discount and adjustment are locked. Schedule and header fields remain editable.
        </div>
      )}

      {/* Body scrolls vertically; wide sections scroll horizontally */}
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
                disabled={locked || editLoading}
                className={`${INPUT} flex-1 min-w-0 rounded-r-none border-r-0 ${vendorName ? 'text-slate-900' : 'text-slate-400'} disabled:bg-slate-100 disabled:text-slate-400`}
              >
                <option value="">Select a Vendor</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.name || v.Name}>
                    {v.name || v.Name}
                  </option>
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

        {/* Schedule fields */}
        <div className="px-1 py-5 max-w-6xl">
          <div className="grid grid-cols-12 gap-x-6 gap-y-4 items-center">
            <label className={`${LABEL} col-span-12 sm:col-span-2`}>
              Profile Name<span className={REQ}>*</span>
            </label>
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className={`${INPUT} col-span-12 sm:col-span-4`}
            />
            <span className="hidden sm:block sm:col-span-6" />

            <label className={`${LABEL} col-span-12 sm:col-span-2`}>
              Repeat Every<span className={REQ}>*</span>
            </label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4 bg-white`}>
              {FREQUENCIES.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <span className="hidden sm:block sm:col-span-6" />

            <label className={`${LABEL} col-span-6 sm:col-span-2`}>Start On</label>
            <input
              type="date"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value)}
              className={`${INPUT} col-span-6 sm:col-span-3`}
            />
            <label className={`${LABEL} col-span-6 sm:col-span-1 sm:text-right sm:pr-1`}>Ends On</label>
            <input
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              disabled={neverExpires}
              placeholder="dd MMM yyyy"
              className={`${INPUT} col-span-6 sm:col-span-2 disabled:bg-slate-100 disabled:text-slate-400`}
            />
            <label className="col-span-12 sm:col-span-3 flex items-center gap-2 text-[13px] text-slate-800 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={neverExpires}
                onChange={(e) => { setNeverExpires(e.target.checked); if (e.target.checked) setEndsOn(''); }}
                className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]"
              />
              Never Expires
            </label>

            <label className={`${LABEL} col-span-12 sm:col-span-2`}>Payment Terms</label>
            <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={`${INPUT} col-span-12 sm:col-span-4 bg-white`}>
              {PAYMENT_TERMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
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
            <h3 className="text-[15px] font-semibold text-slate-900">
              Item Table{locked && <span className="ml-2 text-xs font-medium text-slate-400">Locked — {tplStatus} template</span>}
            </h3>
            <button className="text-[13px] text-[#2084FA] font-medium flex items-center gap-1 hover:underline whitespace-nowrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.7} />
                <path d="M8.5 12.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Bulk Actions
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-12 gap-0 bg-white border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span className="col-span-3 px-3 py-2.5 border-r border-slate-100">Item Details</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Account</span>
                <span className="col-span-1 px-3 py-2.5 border-r border-slate-100 text-right">Quantity</span>
                <span className="col-span-1 px-3 py-2.5 border-r border-slate-100 text-right">Rate</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Tax</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Customer Details</span>
                <span className="col-span-1 px-3 py-2.5 text-right">Amount</span>
              </div>
              {rows.map((r, i) => {
                const amt = (Number(r.quantity) || 0) * (Number(r.rate) || 0);
                return (
                  <div key={i} className="grid grid-cols-12 gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white">
                    <span className="col-span-3 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.itemName}
                        onChange={(e) => setRow(i, { itemName: e.target.value })}
                        list="rec-items"
                        disabled={locked}
                        placeholder="Type or click to select an item."
                        className="w-full h-9 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-400 disabled:text-slate-400"
                      />
                      <datalist id="rec-items">
                        {catalog.map((c: any) => (
                          <option key={c.id} value={c.name || c.Name} />
                        ))}
                      </datalist>
                    </span>
                    <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                      <select
                        value={r.account}
                        onChange={(e) => setRow(i, { account: e.target.value })}
                        disabled={locked}
                        className={`w-full h-9 text-[13px] bg-transparent focus:outline-none disabled:text-slate-400 ${r.account ? 'text-slate-800' : 'text-slate-400'}`}
                      >
                        <option value="">Select an account</option>
                        {accounts.map((a: string) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </span>
                    <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.quantity}
                        onChange={(e) => setRow(i, { quantity: e.target.value })}
                        type="number" min={0} step="0.01"
                        disabled={locked}
                        className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded disabled:text-slate-400"
                      />
                    </span>
                    <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.rate}
                        onChange={(e) => setRow(i, { rate: e.target.value })}
                        type="number" min={0} step="0.01"
                        disabled={locked}
                        className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded disabled:text-slate-400"
                      />
                    </span>
                    <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                      <select
                        value={r.tax}
                        onChange={(e) => setRow(i, { tax: e.target.value })}
                        disabled={locked}
                        className={`w-full h-9 text-[13px] bg-transparent focus:outline-none disabled:text-slate-400 ${r.tax === 'none' ? 'text-slate-400' : 'text-slate-800'}`}
                      >
                        {taxes.map((t: { id: string; label: string }) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </span>
                    <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                      <select
                        value={r.customer}
                        onChange={(e) => setRow(i, { customer: e.target.value })}
                        disabled={locked}
                        className={`w-full h-9 text-[13px] bg-transparent focus:outline-none disabled:text-slate-400 ${r.customer ? 'text-slate-800' : 'text-slate-400'}`}
                      >
                        <option value="">Select Customer</option>
                        <option value="Walk-in">Walk-in</option>
                        {vendors.map((v: any) => (
                          <option key={v.id} value={v.name || v.Name}>{v.name || v.Name}</option>
                        ))}
                      </select>
                    </span>
                    <span className="col-span-1 px-3 py-1.5 flex items-center justify-end gap-2">
                      <span className="tabular-nums font-semibold">{fmtMoney(amt)}</span>
                      {rows.length > 1 && !locked && (
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

          {!locked && (
          <div className="flex mt-3">
            <button
              onClick={() => setRows((rs) => [...rs, { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none', customer: '' }])}
              className="pl-3 pr-2 h-9 rounded-l-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5"
            >
              <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
              Add New Row
            </button>
            <span className="w-8 h-9 rounded-r-md bg-slate-100 border-l border-white flex items-center justify-center text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </div>
          )}

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
                    disabled={locked}
                    className="w-20 h-9 px-2 rounded-l-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA] disabled:text-slate-400"
                  />
                  <span className="h-9 px-2 rounded-r-md border border-l-0 border-slate-200 bg-white text-slate-500 flex items-center text-[13px]">%</span>
                </span>
                <span className="tabular-nums w-16 text-right">{fmtMoney(calc.discAmt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <select
                  value={adjLabel}
                  onChange={(e) => setAdjLabel(e.target.value)}
                  disabled={locked}
                  className="h-9 px-2 rounded-md border border-dashed border-slate-300 bg-white text-[13px] text-slate-600 focus:outline-none disabled:text-slate-400"
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
                    disabled={locked}
                    className="w-28 h-9 px-2 rounded-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA] disabled:text-slate-400"
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

          {/* Notes */}
          <div className="mt-8 border-t border-slate-100 pt-6 max-w-4xl">
            <label className={`${LABEL} block mb-1.5 font-medium`}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y"
            />
            <p className="text-xs text-slate-400 mt-1">It will not be shown in PDF</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-200 px-1 pb-1 bg-white sticky bottom-0 shrink-0">
        <button
          onClick={save}
          disabled={saving || editLoading}
          className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save'}
        </button>
        <button
          onClick={() => navigate('/workspace/recurring')}
          className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function RecurringBillEditPage() {
  const { id } = useParams<{ id: string }>();
  return <RecurringBillCreatePage editId={id} />;
}
