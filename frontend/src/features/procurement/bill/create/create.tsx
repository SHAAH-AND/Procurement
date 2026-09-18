import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createBill, updateBill, getBill, billAction, getVendors, getItems } from '../../../../api';
import { useAccounts, useTaxes, taxIdForTaxes, useTermsDefault, usePdfTemplate, evaluateRules } from '../../../settings/bind';

type Row = {
  itemName: string;
  account: string;
  quantity: string;
  rate: string;
  tax: string;
  customer: string;
};

const PAYMENT_TERMS = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due end of month', 'Advance', 'COD'];

const INPUT =
  'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addDays = (iso: string, days: number) => {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return todayISO();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDisplay = (iso: string) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isoDay = (v: any): string => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function BillCreatePage({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const isEdit = !!editId;
  const [vendors, setVendors] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [editLoading, setEditLoading] = useState(isEdit);
  const [editStatus, setEditStatus] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [billNo, setBillNo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [paymentTerms, setPaymentTerms] = useState('Due on Receipt');
  const [subject, setSubject] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none', customer: '' },
  ]);
  const [discountPct, setDiscountPct] = useState('0');
  const [adjustment, setAdjustment] = useState('');
  const [adjLabel, setAdjLabel] = useState('Adjustment');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'draft' | 'open' | null>(null);

  // Settings-driven lists (Chart of Accounts, Taxes) with safe fallbacks
  const accounts = useAccounts();
  const taxes = useTaxes();
  const termsDefault = useTermsDefault();
  const pdfTemplate = usePdfTemplate();

  useEffect(() => {
    getVendors()
      .then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
    getItems()
      .then((r: any) => setCatalog(Array.isArray(r) ? r : r?.data || []))
      .catch(() => {});
  }, []);

  // Bills module default payment terms (Settings → Module Settings → Bills)
  useEffect(() => {
    if (!isEdit && termsDefault && termsDefault !== 'Due on Receipt') {
      setPaymentTerms((p) => (p === 'Due on Receipt' ? termsDefault : p));
    }
  }, [isEdit, termsDefault]);

  // Edit mode: prefill the form with the bill's data
  useEffect(() => {
    if (!editId) return;
    setEditLoading(true);
    getBill(editId)
      .then((b: any) => {
        const bill = b?.data ?? b;
        setEditStatus(bill.status || '');
        setEditNumber(bill.billNumber || '');
        setVendorName(bill.vendorName || '');
        setBillNo(bill.vendorBillNo || '');
        setOrderNumber(bill.orderNumber || '');
        setBillDate(isoDay(bill.issueDate) || todayISO());
        setDueDate(isoDay(bill.dueDate) || todayISO());
        setPaymentTerms(bill.paymentTerms || 'Due on Receipt');
        setSubject(bill.subject || '');
        setDiscountPct(String(bill.discountPercent ?? 0));
        setAdjustment(bill.adjustment != null ? String(bill.adjustment) : '');
        setAdjLabel(bill.adjustmentLabel || 'Adjustment');
        setNotes(bill.notes || '');
        try {
          const docs = bill.documents ? JSON.parse(bill.documents) : [];
          if (Array.isArray(docs)) setFiles(docs.filter((x) => typeof x === 'string'));
        } catch { /* documents not a file list — ignore */ }
        const lines = Array.isArray(bill.lines) ? bill.lines : [];
        if (lines.length) {
          setRows(
            lines.map((l: any) => ({
              itemName: l.itemName || '',
              account: l.account || '',
              quantity: String(l.quantity ?? 1),
              rate: String(l.rate ?? 0),
              tax: taxIdForTaxes(taxes, l.tax),
              customer: l.customer || '',
            })),
          );
        }
      })
      .catch((e: any) => setError(e?.message || 'Failed to load bill'))
      .finally(() => setEditLoading(false));
  }, [editId]);

  // Non-draft bills already moved accruals/payments — lines stay locked, header stays editable.
  const locked = isEdit && editStatus !== '' && editStatus !== 'draft';

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onTermsChange = (terms: string) => {
    setPaymentTerms(terms);
    const base = billDate || todayISO();
    if (terms === 'Due on Receipt' || terms === 'COD' || terms === 'Advance') setDueDate(base);
    else if (terms === 'Net 15') setDueDate(addDays(base, 15));
    else if (terms === 'Net 30') setDueDate(addDays(base, 30));
    else if (terms === 'Net 45') setDueDate(addDays(base, 45));
    else if (terms === 'Net 60') setDueDate(addDays(base, 60));
    else if (terms === 'Due end of month') {
      const d = new Date(`${base}T00:00:00`);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      setDueDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`);
    }
  };

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
    const taxAmt = parsed.reduce((s, r) => {
      const share = sub > 0 ? r.line / sub : 0;
      return s + r.taxAmt * (1 - discPct / 100) * (sub > 0 ? 1 : 1) - 0 + (sub > 0 ? 0 : 0) + (share * 0);
    }, 0);
    // simpler: tax on discounted line proportionally
    const taxAdj = parsed.reduce((s, r) => s + r.taxAmt, 0) * (1 - discPct / 100);
    void taxAmt;
    const adj = Number(adjustment) || 0;
    return { sub, discAmt, tax: taxAdj, adj, total: Math.max(0, sub - discAmt + taxAdj + adj) };
  }, [rows, discountPct, adjustment]);

  const validate = (): string => {
    if (!vendorName.trim()) return 'Select a vendor';
    if (!billNo.trim()) return 'Enter a Bill#';
    if (!billDate) return 'Select a Bill Date';
    if (locked) return '';
    const named = rows.filter((r) => r.itemName.trim());
    if (!named.length) return 'Add at least one item row';
    for (const r of named) {
      if ((Number(r.quantity) || 0) <= 0) return 'Quantity must be greater than 0';
      if ((Number(r.rate) || 0) < 0) return 'Rate cannot be negative';
    }
    return '';
  };

  const buildPayload = () => {
    const v = vendors.find((x: any) => (x.name || x.Name) === vendorName.trim());
    const header: any = {
      vendorBillNo: billNo.trim(),
      orderNumber: orderNumber.trim() || undefined,
      issueDate: billDate,
      dueDate: dueDate || undefined,
      paymentTerms,
      subject: subject.trim() || undefined,
      notes: notes.trim() || undefined,
      documents: files.length ? JSON.stringify(files) : undefined,
    };
    if (!locked) {
      header.vendorId = v?.id;
      header.vendorName = vendorName.trim();
      header.discountPercent = Number(discountPct) || 0;
      header.adjustment = Number(adjustment) || 0;
      header.adjustmentLabel = adjLabel;
      header.lines = rows
        .filter((r) => r.itemName.trim())
        .map((r) => ({
          itemName: r.itemName.trim(),
          quantity: Number(r.quantity) || 1,
          rate: Number(r.rate) || 0,
          account: r.account || undefined,
          tax: r.tax === 'none' ? undefined : taxes.find((t: any) => t.id === r.tax)?.label || r.tax,
          customer: r.customer.trim() || undefined,
        }));
    }
    return header;
  };

  const save = async (mode: 'draft' | 'open' | 'update') => {
    const problem = validate();
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving(mode === 'update' ? 'draft' : mode);
    setError('');
    try {
      if (mode === 'update' && editId) {
        await updateBill(editId, buildPayload());
        navigate('/workspace/bills');
        return;
      }
      // Workflow guard: submit-time block rules from Settings → Automation
      if (mode === 'open') {
        const gate = await evaluateRules('bill.submit', calc.total);
        if (gate.blocked) {
          setError(gate.blocked);
          window.scrollTo({ top: 0 });
          setSaving(null);
          return;
        }
      }
      const created: any = await createBill(buildPayload());
      const id = created?.id || created?.data?.id;
      if (mode === 'open' && id) {
        await billAction(id, 'submit');
        await billAction(id, 'approve');
      }
      navigate('/workspace/bills');
    } catch (e: any) {
      setError(e?.message || 'Failed to save bill');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — Zoho style */}
      <div className="flex items-center justify-between px-1 pt-1 pb-3">
        <h2 className="flex items-center gap-2.5 text-[20px] font-medium text-slate-900">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-slate-800">
            <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
            <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
          </svg>
          {isEdit ? `Edit Bill${editNumber ? ` ${editNumber}` : ''}` : 'New Bill'}
        </h2>
        <button
          onClick={() => navigate('/workspace/bills')}
          className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {error && (
        <div
          className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3"
          role="alert"
        >
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {editLoading && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800" role="status">
          Loading bill…
        </div>
      )}
      {locked && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-amber-50 border-amber-200 text-amber-800" role="note">
          This bill is {editStatus} — item lines, vendor, discount and adjustment are locked. Header fields below remain editable.
        </div>
      )}

      <div className="flex-1 overflow-auto pb-4">
        {/* Vendor */}
        <div className="bg-slate-50/60 border-y border-slate-100 px-1 py-3">
          <div className="grid grid-cols-12 gap-3 items-center max-w-6xl">
            <label className={`${LABEL} col-span-2`}>
              Vendor Name<span className={REQ}>*</span>
            </label>
            <div className="col-span-7 flex">
              <select
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                disabled={locked || editLoading}
                className={`${INPUT} flex-1 rounded-r-none border-r-0 ${vendorName ? 'text-slate-900' : 'text-slate-400'} disabled:bg-slate-100 disabled:text-slate-400`}
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
                className="w-10 h-9 rounded-r-lg bg-[#2084FA] text-white flex items-center justify-center hover:bg-[#1a6fd6]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} />
                  <path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Bill header fields */}
        <div className="grid grid-cols-12 gap-x-6 gap-y-4 px-1 py-5 max-w-6xl">
          <label className={`${LABEL} col-span-2 pt-2`}>
            Bill#<span className={REQ}>*</span>
          </label>
          <input
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            className={`${INPUT} col-span-4`}
          />
          <span className="col-span-6" />

          <label className={`${LABEL} col-span-2 pt-2`}>Order Number</label>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className={`${INPUT} col-span-4`}
          />
          <span className="col-span-6" />

          <label className={`${LABEL} col-span-2 pt-2`}>
            Bill Date<span className={REQ}>*</span>
          </label>
          <div className="col-span-4">
            <input
              type="date"
              value={billDate}
              onChange={(e) => {
                setBillDate(e.target.value);
                if (paymentTerms !== 'Due on Receipt') onTermsChange(paymentTerms);
              }}
              className={`${INPUT} w-full ${billDate ? '' : 'text-slate-400'}`}
              placeholder="dd MMM yyyy"
            />
            {!billDate && <div className="text-xs text-slate-400 mt-1">dd MMM yyyy</div>}
          </div>
          <span className="col-span-6" />

          <label className={`${LABEL} col-span-2 pt-2`}>Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${INPUT} col-span-4`}
          />
          <label className={`${LABEL} col-span-1 pt-2`}>Payment Terms</label>
          <select
            value={paymentTerms}
            onChange={(e) => onTermsChange(e.target.value)}
            className={`${INPUT} col-span-4 bg-white`}
          >
            {PAYMENT_TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {(billDate || dueDate) && (
            <>
              <span className="col-span-2" />
              <div className="col-span-10 text-xs text-slate-400 -mt-2">
                {billDate ? fmtDisplay(billDate) : ''} → {dueDate ? fmtDisplay(dueDate) : ''}
              </div>
            </>
          )}
        </div>

        {/* Subject */}
        <div className="grid grid-cols-12 gap-3 px-1 py-3 border-t border-slate-100 max-w-6xl">
          <label className={`${LABEL} col-span-2 pt-2 flex items-center gap-1.5`}>
            Subject
            <span title="Subject appears on the bill" className="w-4 h-4 rounded-full bg-slate-400 text-white text-[10px] flex items-center justify-center cursor-help">
              i
            </span>
          </label>
          <textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 250))}
            rows={2}
            placeholder="Enter a subject within 250 characters"
            className="col-span-4 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y placeholder:text-slate-400"
          />
        </div>

        {/* Item table — Zoho columns */}
        <div className="px-1 pt-4 max-w-7xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-semibold text-[#1f5fa8]">
              Item Table{locked && <span className="ml-2 text-xs font-medium text-slate-400">Locked — {editStatus} bill</span>}
            </h3>
            <button className="text-[13px] text-[#2084FA] font-medium flex items-center gap-1 hover:underline">
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
                <span className="col-span-1 px-3 py-2.5 border-r border-slate-100 text-right">
                  Rate <span className="inline-block ml-1 text-slate-400">▦</span>
                </span>
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
                        list="bill-items"
                        disabled={locked}
                        placeholder="Type or click to select an item."
                        className="w-full h-9 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-400 disabled:text-slate-400"
                      />
                      <datalist id="bill-items">
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
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.quantity}
                        onChange={(e) => setRow(i, { quantity: e.target.value })}
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={locked}
                        className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded disabled:text-slate-400"
                      />
                    </span>
                    <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={r.rate}
                        onChange={(e) => setRow(i, { rate: e.target.value })}
                        type="number"
                        min={0}
                        step="0.01"
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
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
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
                          <option key={v.id} value={v.name || v.Name}>
                            {v.name || v.Name}
                          </option>
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
          <div className="relative mt-3">
            <div className="flex">
              <button
                onClick={() =>
                  setRows((rs) => [...rs, { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none', customer: '' }])
                }
                className="pl-3 pr-2 h-9 rounded-l-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5"
              >
                <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
                Add New Row
              </button>
              <button
                onClick={() => setAddRowOpen((v) => !v)}
                className="w-8 h-9 rounded-r-md bg-slate-100 text-slate-500 hover:bg-slate-200 border-l border-white flex items-center justify-center"
                aria-label="More row options"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {addRowOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-20">
                <button
                  onClick={() => {
                    setRows((rs) => [...rs, { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none', customer: '' }]);
                    setAddRowOpen(false);
                  }}
                  className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50"
                >
                  Add empty row
                </button>
                <button
                  onClick={() => {
                    const first = catalog[0];
                    if (first)
                      setRows((rs) => [
                        ...rs,
                        { itemName: first.name || first.Name || '', account: '', quantity: '1.00', rate: String(first.rate || first.costPrice || 0), tax: 'none', customer: '' },
                      ]);
                    setAddRowOpen(false);
                  }}
                  className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50"
                >
                  Add from catalog
                </button>
              </div>
            )}
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
                    type="number"
                    min={0}
                    max={100}
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
                    type="number"
                    step="0.01"
                    disabled={locked}
                    className="w-28 h-9 px-2 rounded-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA] disabled:text-slate-400"
                  />
                  <span title="Adjustment adds to the total" className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 text-[10px] flex items-center justify-center cursor-help">
                    ?
                  </span>
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

          {/* Notes + attachments */}
          <div className="grid grid-cols-12 gap-6 mt-8 border-t border-slate-100 pt-6">
            <div className="col-span-7">
              <label className={`${LABEL} block mb-1.5 font-medium`}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y"
              />
              <p className="text-xs text-slate-400 mt-1">It will not be shown in PDF</p>
            </div>
            <div className="col-span-5">
              <label className={`${LABEL} block mb-1.5 font-medium`}>Attach File(s) to Bill</label>
              <div className="relative">
                <div className="flex">
                  <label className="inline-flex items-center gap-2 px-3 h-9 rounded-l-md border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Upload File
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const names = Array.from(e.target.files || []).map((f) => f.name);
                        setFiles((fs) => [...fs, ...names].slice(0, 5));
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    onClick={() => setUploadOpen((v) => !v)}
                    className="w-8 h-9 rounded-r-md border border-l-0 border-slate-300 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center"
                    aria-label="Upload options"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                {uploadOpen && (
                  <div className="absolute left-0 top-full mt-1 w-52 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-20">
                    <button
                      onClick={() => setUploadOpen(false)}
                      className="w-full px-4 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50"
                    >
                      Attach From Desktop
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">You can upload a maximum of 5 files, 10MB each</p>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-[13px] text-slate-700">
                  {files.map((f, i) => (
                    <li key={`${f}-${i}`} className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-100 px-2.5 py-1.5">
                      <span className="truncate">{f}</span>
                      <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 ml-2" aria-label={`Remove ${f}`}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-[13px] text-slate-500 mt-8">
            <span className="font-semibold">Additional Fields:</span> Start adding custom fields for your payments made by going to{' '}
            <span className="italic">Settings ➔ Purchases ➔ Bills.</span>
          </p>
        </div>
      </div>

      {/* Footer — Zoho style */}
      <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-200 px-1 pb-1 bg-white sticky bottom-0">
        <div className="flex items-center gap-2">
          {isEdit ? (
            <button
              onClick={() => save('update')}
              disabled={saving !== null || editLoading}
              className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
            >
              {saving !== null ? 'Saving…' : 'Save Changes'}
            </button>
          ) : (
            <>
              <button
                onClick={() => save('draft')}
                disabled={saving !== null}
                className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {saving === 'draft' ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                onClick={() => save('open')}
                disabled={saving !== null}
                className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
              >
                {saving === 'open' ? 'Saving…' : 'Save as Open'}
              </button>
            </>
          )}
          <button
            onClick={() => navigate('/workspace/bills')}
            className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[13px]">
          <span className="text-slate-900 font-medium">
            PDF Template: <span className="text-slate-400 font-normal">'{pdfTemplate}'</span>
          </span>
          <button className="text-[#2084FA] hover:underline">Change</button>
          <span className="text-slate-200">|</span>
          <button className="text-[#2084FA] font-medium flex items-center gap-1.5 hover:underline">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth={1.7} />
              <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
            Make Recurring
          </button>
        </div>
      </div>
    </div>
  );
}

export function BillEditPage() {
  const { id } = useParams<{ id: string }>();
  return <BillCreatePage editId={id} />;
}
