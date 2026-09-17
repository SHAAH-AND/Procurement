import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPo, poAction, getVendors, getItems, getAllPrs } from '../../../../api';

type Row = { itemName: string; account: string; quantity: string; rate: string; tax: string };

const ACCOUNTS = ['Cost of Goods Sold', 'Office Supplies Expense', 'Raw Materials', 'Services Expense', 'Maintenance Expense', 'Other'];
const TAXES: { id: string; label: string; rate: number }[] = [
  { id: 'none', label: 'No Tax', rate: 0 },
  { id: 'vat18', label: 'VAT 18%', rate: 0.18 },
  { id: 'sscl', label: 'SSCL 2.5%', rate: 0.025 },
];
const PAYMENT_TERMS = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Advance', 'COD'];
const SHIP_PREFS = ['Standard Delivery', 'Express Delivery', 'Pickup', 'Courier'];

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PoCreatePage() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [prs, setPrs] = useState<any[]>([]);
  const [vendorName, setVendorName] = useState('');
  const [addressType, setAddressType] = useState<'org' | 'customer'>('org');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayISO());
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Due on Receipt');
  const [shipPref, setShipPref] = useState('');
  const [taxMode, setTaxMode] = useState('Tax Exclusive');
  const [taxLevel, setTaxLevel] = useState('At Transaction Level');
  const [rows, setRows] = useState<Row[]>([{ itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none' }]);
  const [discountPct, setDiscountPct] = useState('0');
  const [adjSign, setAdjSign] = useState<'+' | '-'>('+');
  const [adjustment, setAdjustment] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSel, setBulkSel] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [transTax, setTransTax] = useState('none');

  useEffect(() => {
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
    getItems().then((r: any) => setCatalog(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
    getAllPrs().then((r: any) => setPrs((Array.isArray(r) ? r : []).filter((p: any) => p.status === 'approved'))).catch(() => {});
  }, []);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const taxRateOf = (id: string) => TAXES.find((t) => t.id === id)?.rate || 0;

  const calc = useMemo(() => {
    const parsed = rows.map((r) => ({
      qty: Number(r.quantity) || 0,
      rate: Number(r.rate) || 0,
      tax: taxRateOf(r.tax),
    }));
    const sub = parsed.reduce((s, r) => s + r.qty * r.rate, 0);
    const discPct = Math.min(100, Math.max(0, Number(discountPct) || 0));
    const discAmt = sub * (discPct / 100);
    let taxAmt = 0;
    if (taxLevel === 'At Transaction Level') {
      taxAmt = (sub - discAmt) * taxRateOf(transTax);
    } else {
      const share = sub > 0 ? discAmt / sub : 0;
      taxAmt = parsed.reduce((s, r) => s + (r.qty * r.rate - r.qty * r.rate * share) * r.tax, 0);
    }
    const adj = (adjSign === '-' ? -1 : 1) * (Number(adjustment) || 0);
    return { sub, discAmt, taxAmt, adj, total: sub - discAmt + taxAmt + adj };
  }, [rows, discountPct, adjustment, adjSign, taxLevel, transTax]);

  const addBulk = () => {
    const lines: Row[] = [];
    prs.forEach((p: any) => {
      (p.lines || []).forEach((l: any) => {
        if (bulkSel.includes(l.id)) {
          lines.push({ itemName: l.itemName || '', account: '', quantity: String(l.quantity || 1), rate: String(l.estimatedRate || 0), tax: 'none' });
        }
      });
    });
    if (lines.length) {
      setRows((rs) => {
        const base = rs.length === 1 && !rs[0].itemName ? [] : rs;
        return [...base, ...lines];
      });
    }
    setBulkSel([]);
    setBulkOpen(false);
  };

  const validate = (): string => {
    if (!vendorName.trim()) return 'Select a vendor';
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
    return {
      vendorId: v?.id,
      vendorName: vendorName.trim(),
      expectedDate: deliveryDate || undefined,
      notes: notes.trim() || undefined,
      reference: reference.trim() || undefined,
      deliveryDate: deliveryDate || undefined,
      paymentTerms,
      shipmentPreference: shipPref.trim() || undefined,
      taxMode,
      taxLevel,
      discountPercent: Number(discountPct) || 0,
      adjustment: (adjSign === '-' ? -1 : 1) * (Number(adjustment) || 0),
      adjustmentLabel: adjSign === '-' ? 'Less' : 'Add',
      terms: terms.trim() || undefined,
      documents: files.length ? JSON.stringify(files) : undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      addressType,
      lines: rows.filter((r) => r.itemName.trim()).map((r) => ({
        itemName: r.itemName.trim(),
        quantity: Number(r.quantity) || 1,
        rate: Number(r.rate) || 0,
        tax: taxLevel === 'At Transaction Level' ? transTax : r.tax,
        description: r.account ? `Account: ${r.account}` : undefined,
      })),
    };
  };

  const save = async (send: boolean) => {
    const problem = validate();
    if (problem) { setError(problem); window.scrollTo({ top: 0 }); return; }
    setSaving(true);
    setError('');
    try {
      const created: any = await createPo(buildPayload());
      const id = created?.id || created?.data?.id;
      if (send && id) await poAction(id, 'submit');
      navigate('/workspace/po');
    } catch (e: any) { setError(e?.message || 'Failed to save purchase order'); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pt-1 pb-3">
        <h2 className="flex items-center gap-2 text-[20px] font-medium text-slate-900">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-slate-800"><path d="M5 8h14l-1.2 12H6.2L5 8z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><path d="M8.5 8V6.5a3.5 3.5 0 017 0V8" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
          New Purchase Order
        </h2>
        <button onClick={() => navigate('/workspace/po')} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="Close">×</button>
      </div>

      {error && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Vendor */}
        <div className="grid grid-cols-12 gap-3 items-center px-1 py-3">
          <label className={`${LABEL} col-span-2`}>Vendor Name<span className={REQ}>*</span></label>
          <div className="col-span-6 flex">
            <select value={vendorName} onChange={(e) => setVendorName(e.target.value)} className={`${INPUT} flex-1 rounded-r-none border-r-0 text-slate-500`}>
              <option value="">Select a Vendor</option>
              {vendors.map((v: any) => <option key={v.id} value={v.name || v.Name}>{v.name || v.Name}</option>)}
            </select>
            <button onClick={() => navigate('/workspace/vendors')} title="Manage vendors" className="w-10 h-9 rounded-r-lg bg-[#2084FA] text-white flex items-center justify-center hover:bg-[#1a6fd6]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        {/* Delivery address */}
        <div className="grid grid-cols-12 gap-3 px-1 py-3">
          <label className={`${LABEL} col-span-2 pt-1`}>Delivery Address<span className={REQ}>*</span></label>
          <div className="col-span-10">
            <div className="flex items-center gap-5 text-[13px] text-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={addressType === 'org'} onChange={() => setAddressType('org')} className="w-4 h-4 accent-[#2084FA]" /> Organization
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={addressType === 'customer'} onChange={() => setAddressType('customer')} className="w-4 h-4 accent-[#2084FA]" /> Customer
              </label>
            </div>
            <textarea
              value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
              rows={3}
              placeholder={addressType === 'org' ? 'Organization address' : 'Customer address'}
              className="mt-2 w-full max-w-md px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y"
            />
            <div className="text-[13px] text-slate-500 mt-1">SriLanka ,</div>
            <button onClick={() => setDeliveryAddress((d) => d)} className="text-[13px] text-[#2084FA] hover:underline mt-0.5">Change destination to deliver</button>
          </div>
        </div>

        {/* Numbers + dates */}
        <div className="grid grid-cols-12 gap-x-6 gap-y-4 px-1 py-3 max-w-5xl">
          <label className={`${LABEL} col-span-2 pt-2`}>Purchase Order#<span className={REQ}>*</span></label>
          <div className="col-span-4 relative">
            <input value="Auto-generated" disabled className={`${INPUT} w-full bg-slate-50 text-slate-500 pr-9`} />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.7} /><path d="M19 12a7 7 0 01-.4 2.3l2 1.6-2 3.4-2.4-.9a7 7 0 01-2 1.2L14 22h-4l-.2-2.4a7 7 0 01-2-1.2l-2.4.9-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.4-2.3l-2-1.6 2-3.4 2.4.9a7 7 0 012-1.2L10 2h4l.2 2.4a7 7 0 012 1.2l2.4-.9 2 3.4-2 1.6c.2.7.4 1.5.4 2.3z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg>
            </span>
          </div>
          <span className="col-span-6" />
          <label className={`${LABEL} col-span-2 pt-2`}>Reference#</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${INPUT} col-span-4`} />
          <span className="col-span-6" />
          <label className={`${LABEL} col-span-2 pt-2`}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} col-span-4`} />
          <span className="col-span-6" />
          <label className={`${LABEL} col-span-2 pt-2`}>Delivery Date</label>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={`${INPUT} col-span-4 text-slate-500`} />
          <label className={`${LABEL} col-span-1 pt-2`}>Payment Terms</label>
          <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={`${INPUT} col-span-4 bg-white`}>
            {PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}
          </select>
          <label className={`${LABEL} col-span-2 pt-2`}>Shipment Preference</label>
          <input value={shipPref} onChange={(e) => setShipPref(e.target.value)} list="po-ship" placeholder="Choose the shipment preference or type to add" className={`${INPUT} col-span-4`} />
          <datalist id="po-ship">{SHIP_PREFS.map((s) => <option key={s} value={s} />)}</datalist>
        </div>

        {/* Tax mode */}
        <div className="flex items-center gap-6 px-1 py-4 border-t border-slate-100 mt-2 max-w-5xl">
          <select value={taxMode} onChange={(e) => setTaxMode(e.target.value)} className="h-9 text-[13px] text-slate-700 bg-transparent focus:outline-none cursor-pointer">
            <option>Tax Exclusive</option>
            <option>Tax Inclusive</option>
          </select>
          <select value={taxLevel} onChange={(e) => setTaxLevel(e.target.value)} className="h-9 text-[13px] text-slate-700 bg-transparent focus:outline-none cursor-pointer">
            <option>At Transaction Level</option>
            <option>At Line Item Level</option>
          </select>
          {taxLevel === 'At Transaction Level' && (
            <select value={transTax} onChange={(e) => setTransTax(e.target.value)} className={`${INPUT} h-9 bg-white`}>
              {TAXES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          )}
        </div>

        {/* Item table */}
        <div className="px-1 max-w-6xl">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[14px] font-semibold text-slate-900">Item Table</h3>
            <span className="text-[13px] text-[#2084FA] font-medium">Bulk Actions</span>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-0 bg-white border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="col-span-4 px-3 py-2.5 border-r border-slate-100">Item Details</span>
              <span className="col-span-2 px-3 py-2.5 border-r border-slate-100">Account</span>
              <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right">Quantity</span>
              <span className="col-span-1 px-3 py-2.5 border-r border-slate-100 text-right">Rate</span>
              <span className="col-span-1 px-3 py-2.5 border-r border-slate-100">Tax</span>
              <span className="col-span-2 px-3 py-2.5 text-right">Amount</span>
            </div>
            {rows.map((r, i) => {
              const amt = (Number(r.quantity) || 0) * (Number(r.rate) || 0);
              return (
                <div key={i} className="grid grid-cols-12 gap-0 border-b border-slate-100 last:border-0 text-[13px]">
                  <span className="col-span-4 px-2 py-1.5 border-r border-slate-100">
                    <input value={r.itemName} onChange={(e) => setRow(i, { itemName: e.target.value })} list="po-items" placeholder="Type or click to select an item." className="w-full h-9 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-400" />
                    <datalist id="po-items">{catalog.map((c: any) => <option key={c.id} value={c.name || c.Name} />)}</datalist>
                  </span>
                  <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                    <select value={r.account} onChange={(e) => setRow(i, { account: e.target.value })} className="w-full h-9 text-[13px] text-slate-500 bg-transparent focus:outline-none">
                      <option value="">Select an account</option>
                      {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </span>
                  <span className="col-span-2 px-2 py-1.5 border-r border-slate-100">
                    <input value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} type="number" min={0} className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded" />
                  </span>
                  <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                    <input value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} type="number" min={0} step="0.01" className="w-full h-9 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 rounded" />
                  </span>
                  <span className="col-span-1 px-2 py-1.5 border-r border-slate-100">
                    {taxLevel === 'At Line Item Level' ? (
                      <select value={r.tax} onChange={(e) => setRow(i, { tax: e.target.value })} className="w-full h-9 text-[12px] text-slate-500 bg-transparent focus:outline-none">
                        {TAXES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </span>
                  <span className="col-span-2 px-3 py-1.5 flex items-center justify-end gap-2">
                    <span className="tabular-nums font-medium">{fmtMoney(amt)}</span>
                    {rows.length > 1 && (
                      <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500 text-base leading-none" aria-label="Remove row">×</button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setRows((rs) => [...rs, { itemName: '', account: '', quantity: '1.00', rate: '0.00', tax: 'none' }])} className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
              Add New Row
            </button>
            <button onClick={() => setBulkOpen(true)} className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
              Add Items in Bulk
            </button>
          </div>

          {/* Totals + notes */}
          <div className="grid grid-cols-12 gap-6 mt-4">
            <div className="col-span-5">
              <label className={`${LABEL} block mb-1.5`}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Will be displayed on purchase order" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y placeholder:text-slate-400" />
            </div>
            <div className="col-span-5 col-start-8 rounded-xl bg-slate-50/70 p-4 space-y-3 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">Sub Total</span>
                <span className="tabular-nums font-semibold">{fmtMoney(calc.sub)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">Discount</span>
                <span className="flex items-center gap-2">
                  <input value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} type="number" min={0} max={100} className="w-20 h-8 px-2 rounded-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA]" />
                  <span className="text-slate-500">%</span>
                </span>
                <span className="tabular-nums w-16 text-right">{fmtMoney(calc.discAmt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <select value={adjSign === '+' ? 'Adjustment' : 'Less'} onChange={(e) => setAdjSign(e.target.value === 'Less' ? '-' : '+')} className="h-8 px-2 rounded-md border border-dashed border-slate-300 bg-white text-[13px] text-slate-600 focus:outline-none">
                  <option>Adjustment</option>
                  <option>Less</option>
                </select>
                <input value={adjustment} onChange={(e) => setAdjustment(e.target.value)} type="number" className="w-24 h-8 px-2 rounded-md border border-slate-200 bg-white text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA]" />
                <span className="tabular-nums w-16 text-right">{fmtMoney(calc.adj)}</span>
              </div>
              {taxLevel === 'At Transaction Level' && calc.taxAmt > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Tax</span>
                  <span className="tabular-nums">{fmtMoney(calc.taxAmt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-900 text-[15px]">Total</span>
                <span className="tabular-nums font-bold text-[15px]">{fmtMoney(calc.total)}</span>
              </div>
            </div>
          </div>

          {/* Terms + files */}
          <div className="grid grid-cols-12 gap-6 mt-6">
            <div className="col-span-6">
              <label className={`${LABEL} block mb-1.5`}>Terms & Conditions</label>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={5} placeholder="Enter the terms and conditions of your business to be displayed in your transaction" className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y placeholder:text-slate-400" />
            </div>
            <div className="col-span-6">
              <label className={`${LABEL} block mb-1.5`}>Attach File(s) to Purchase Order</label>
              <label className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-50 cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                Upload File
                <input
                  type="file" multiple className="hidden"
                  onChange={(e) => {
                    const names = Array.from(e.target.files || []).map((f) => f.name);
                    setFiles((fs) => [...fs, ...names].slice(0, 10));
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-xs text-slate-400 mt-1.5">You can upload a maximum of 10 files, 10MB each</p>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-[13px] text-slate-700">
                  {files.map((f, i) => (
                    <li key={`${f}-${i}`} className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-100 px-2.5 py-1.5">
                      <span className="truncate">{f}</span>
                      <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 ml-2" aria-label={`Remove ${f}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="text-[13px] text-slate-500 mt-6"><span className="font-semibold">Additional Fields:</span> Start adding custom fields for your purchase orders by going to Settings ➔ Purchases ➔ Purchase Orders.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200 px-1 pb-1">
        <div className="flex items-center gap-2">
          <button onClick={() => save(false)} disabled={saving} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Save as Draft</button>
          <button onClick={() => save(true)} disabled={saving} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">Save and Send</button>
          <button onClick={() => navigate('/workspace/po')} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        </div>
        <span className="text-xs text-slate-500 hidden sm:block">PDF Template: <span className="text-slate-400">'Standard Template'</span> <button className="text-[#2084FA] hover:underline ml-1">Change</button></span>
      </div>

      {/* Bulk picker */}
      {bulkOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4" onClick={() => { setBulkOpen(false); setBulkSel([]); }}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-auto bg-white rounded-2xl shadow-xl p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add Items from Approved PRs</h3>
              <button onClick={() => { setBulkOpen(false); setBulkSel([]); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-1 max-h-[50vh] overflow-auto">
              {prs.length === 0 && <div className="text-sm text-slate-500 text-center py-8">No approved purchase requests.</div>}
              {prs.map((p: any) => (
                <div key={p.id} className="mb-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{p.prNumber}</div>
                  {(p.lines || []).map((l: any) => (
                    <label key={l.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={bulkSel.includes(l.id)} onChange={(e) => setBulkSel((s) => e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id))} className="w-4 h-4 accent-[#2084FA]" />
                      <span className="flex-1 truncate">{l.itemName} <span className="text-slate-400">× {l.quantity}</span></span>
                    </label>
                  ))}
                </div>
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
