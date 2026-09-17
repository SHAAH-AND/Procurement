import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createReceiveFromPo, receiveAction, getPos, getVendors } from '../../../../api';

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function ReceiveCreatePage() {
  const navigate = useNavigate();
  const [pos, setPos] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [poId, setPoId] = useState('');
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);

  useEffect(() => {
    getPos().then((r: any) => setPos(Array.isArray(r) ? r : [])).catch(() => {});
    getVendors().then((r: any) => setVendors(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const receivablePos = useMemo(
    () => pos.filter((p: any) => ['issued', 'approved', 'partially_received', 'received', 'partially_billed'].includes(p.status)),
    [pos],
  );
  const vendorPos = useMemo(
    () => (vendorId ? receivablePos.filter((p: any) => p.vendorId === vendorId || p.vendorName === vendors.find((v: any) => v.id === vendorId)?.name) : receivablePos),
    [receivablePos, vendorId, vendors],
  );
  const po = pos.find((p: any) => p.id === poId);
  const unlocked = !!vendorId && !!poId;

  useEffect(() => { setPoId(''); setQtys({}); }, [vendorId]);

  const lines = useMemo(() => {
    if (!po) return [];
    return (po.lines || []).map((l: any) => {
      const ordered = Number(l.quantity || 0);
      const received = Number(l.receivedQty || 0);
      const open = Math.max(0, ordered - received);
      const input = Math.min(open, Math.max(0, Number(qtys[l.id] ?? 0)));
      return { ...l, ordered, received, open, input, inTransit: Math.max(0, open - input) };
    });
  }, [po, qtys]);

  const buildPayload = () => ({
    poId,
    lines: lines.filter((l: any) => l.input > 0).map((l: any) => ({ poLineId: l.id, quantity: l.input })),
    notes: notes.trim() || undefined,
    tracking: tracking.trim() || undefined,
    trackingUrl: trackingUrl.trim() || undefined,
    receivedAt: receivedDate || undefined,
    documents: files.length ? JSON.stringify(files) : undefined,
  });

  const save = async (mode: 'draft' | 'received' | 'new') => {
    if (!vendorId) { setError('Select a vendor'); return; }
    if (!poId) { setError('Select a purchase order'); return; }
    if (!lines.some((l: any) => l.input > 0)) { setError('Enter a received quantity for at least one item'); return; }
    setSaving(true);
    setError('');
    try {
      const created: any = await createReceiveFromPo(buildPayload());
      const id = created?.id || created?.data?.id;
      if (mode === 'received' && id) await receiveAction(id, 'complete');
      if (mode === 'new') {
        setQtys({});
        setNotes('');
        setTracking('');
        setTrackingUrl('');
        setFiles([]);
        setSaveMenuOpen(false);
        return;
      }
      navigate('/workspace/receives');
    } catch (e: any) { setError(e?.message || 'Failed to save receive'); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pt-1 pb-3">
        <h2 className="flex items-center gap-2 text-[20px] font-medium text-slate-900">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-slate-800"><path d="M3 7h11v9H3z M14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><circle cx="7" cy="18" r="1.8" stroke="currentColor" strokeWidth={1.7} /><circle cx="17" cy="18" r="1.8" stroke="currentColor" strokeWidth={1.7} /></svg>
          New Purchase Receive
        </h2>
        <button onClick={() => navigate('/workspace/receives')} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="Close">×</button>
      </div>

      {error && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Gate fields */}
        <div className="grid grid-cols-12 gap-x-6 gap-y-4 px-1 py-4 bg-slate-50/60 border-y border-slate-100 max-w-5xl rounded-lg">
          <label className={`${LABEL} col-span-2 pt-2`}>Vendor Name<span className={REQ}>*</span></label>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={`${INPUT} col-span-5 text-slate-500`}>
            <option value="">Select a Vendor</option>
            {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name || v.Name}</option>)}
          </select>
          <span className="col-span-5" />
          <label className={`${LABEL} col-span-2 pt-2`}>Purchase Order#<span className={REQ}>*</span></label>
          <select value={poId} onChange={(e) => { setPoId(e.target.value); setQtys({}); }} className={`${INPUT} col-span-5 text-slate-500`}>
            <option value="">Select a Purchase Order</option>
            {vendorPos.map((p: any) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendorName}</option>)}
          </select>
        </div>

        <fieldset disabled={!unlocked} className={unlocked ? '' : 'opacity-50 select-none'}>
          {/* Numbers */}
          <div className="grid grid-cols-12 gap-x-6 gap-y-4 px-1 py-4 max-w-5xl">
            <label className={`${LABEL} col-span-2 pt-2`}>Purchase Receive#<span className={REQ}>*</span></label>
            <div className="col-span-3 relative">
              <input value="Auto-generated" disabled className={`${INPUT} w-full bg-slate-50 text-slate-500 pr-9`} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.7} /><path d="M19 12a7 7 0 01-.4 2.3l2 1.6-2 3.4-2.4-.9a7 7 0 01-2 1.2L14 22h-4l-.2-2.4a7 7 0 01-2-1.2l-2.4.9-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.4-2.3l-2-1.6 2-3.4 2.4.9a7 7 0 012-1.2L10 2h4l.2 2.4a7 7 0 012 1.2l2.4-.9 2 3.4-2 1.6c.2.7.4 1.5.4 2.3z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg>
              </span>
            </div>
            <span className="col-span-7" />
            <label className={`${LABEL} col-span-2 pt-2`}>Received Date<span className={REQ}>*</span></label>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className={`${INPUT} col-span-3`} />
            <span className="col-span-7" />
            <label className={`${LABEL} col-span-2 pt-2`}>Tracking#</label>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} className={`${INPUT} col-span-3`} />
            <span className="col-span-7" />
            <label className={`${LABEL} col-span-2 pt-2`}>Tracking URL</label>
            <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://" className={`${INPUT} col-span-3`} />
          </div>

          {/* Item table */}
          <div className="px-1 max-w-6xl">
            <h3 className="text-[14px] font-semibold text-slate-900 mb-2">Item Table</h3>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-12 gap-0 bg-white border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span className="col-span-5 px-3 py-2.5 border-r border-slate-100">Items & Description</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right">Ordered</span>
                <span className="col-span-1 px-3 py-2.5 border-r border-slate-100 text-right">Received</span>
                <span className="col-span-2 px-3 py-2.5 border-r border-slate-100 text-right">In Transit</span>
                <span className="col-span-2 px-3 py-2.5 text-right">Quantity to Receive</span>
              </div>
              {lines.length === 0 ? (
                <div className="py-10 text-center text-[13px] text-slate-400">Select a purchase order to load its items.</div>
              ) : (
                lines.map((l: any) => (
                  <div key={l.id} className="grid grid-cols-12 gap-0 border-b border-slate-100 last:border-0 text-[13px] items-center">
                    <span className="col-span-5 px-3 py-2.5 min-w-0">
                      <span className="block font-medium text-slate-900 truncate">{l.itemName}</span>
                      <span className="block text-xs text-slate-400 truncate">{l.description || ''}</span>
                    </span>
                    <span className="col-span-2 px-3 py-2.5 text-right tabular-nums text-slate-600">{l.ordered}</span>
                    <span className="col-span-1 px-3 py-2.5 text-right tabular-nums text-slate-600">{l.received}</span>
                    <span className="col-span-2 px-3 py-2.5 text-right tabular-nums text-slate-600">{l.inTransit}</span>
                    <span className="col-span-2 px-3 py-2.5">
                      <input
                        type="number" min={0} max={l.open} step="any"
                        value={qtys[l.id] ?? ''}
                        onChange={(e) => setQtys((q) => ({ ...q, [l.id]: e.target.value }))}
                        placeholder="0"
                        className="w-full h-9 px-2 rounded-md border border-slate-200 text-right tabular-nums text-[13px] focus:outline-none focus:border-[#2084FA]"
                      />
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Notes */}
            <label className={`${LABEL} block mt-6 mb-1.5`}>Notes (For Internal Use)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full max-w-3xl px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] resize-y" />

            {/* Files */}
            <label className={`${LABEL} block mt-6 mb-1.5`}>Attach File(s) to Purchase Receive</label>
            <label className="inline-flex items-center gap-2 px-3 h-9 rounded-md border border-slate-300 bg-white text-[13px] text-slate-700 hover:bg-slate-50 cursor-pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
              Upload File
              <input
                type="file" multiple className="hidden"
                onChange={(e) => {
                  const names = Array.from(e.target.files || []).map((f) => f.name);
                  setFiles((fs) => [...fs, ...names].slice(0, 5));
                  e.target.value = '';
                }}
              />
            </label>
            <p className="text-xs text-slate-400 mt-1.5">You can upload a maximum of 5 files, 10MB each</p>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-[13px] text-slate-700 max-w-md">
                {files.map((f, i) => (
                  <li key={`${f}-${i}`} className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-100 px-2.5 py-1.5">
                    <span className="truncate">{f}</span>
                    <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 ml-2" aria-label={`Remove ${f}`}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </fieldset>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200 px-1 pb-1">
        <button onClick={() => save('draft')} disabled={saving || !unlocked} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Save as Draft</button>
        <div className="relative flex">
          <button onClick={() => save('received')} disabled={saving || !unlocked} className="px-4 h-9 rounded-l-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-50 shadow-sm">Save as Received</button>
          <button onClick={() => setSaveMenuOpen((v) => !v)} disabled={saving || !unlocked} className="w-8 h-9 rounded-r-md bg-[#2084FA] text-white hover:bg-[#1a6fd6] border-l border-white/30 disabled:opacity-50 flex items-center justify-center" aria-label="More save options">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {saveMenuOpen && (
            <div className="absolute left-0 bottom-full mb-1 w-44 rounded-lg bg-white border border-slate-200 shadow-xl py-1 z-30">
              <button onClick={() => { setSaveMenuOpen(false); save('received'); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50">Save as Received</button>
              <button onClick={() => { setSaveMenuOpen(false); save('draft'); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50">Save as Draft</button>
              <button onClick={() => { setSaveMenuOpen(false); save('new'); }} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50">Save and New</button>
            </div>
          )}
        </div>
        <button onClick={() => navigate('/workspace/receives')} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}
