import { useState, useEffect } from 'react';
import { useFetch, useQueryFilter, type FetchFn, PrStatusPill, prTotal, PR_CATEGORIES, EMPTY_LINE, type PrLineForm } from './hooks';
import { getItems, getPendingPrs } from '../../../api';

export function PrForm({ initial, submitting, onSubmit, onCancel }: {
  initial?: any; submitting: boolean;
  onSubmit: (payload: { expectedDate?: string; deliveryAddress?: string; reason?: string; notes?: string; reference?: string; lines: any[] }) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(initial?.reason || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [reference, setReference] = useState(initial?.reference || '');
  const [deliveryAddress, setDeliveryAddress] = useState(initial?.deliveryAddress || '');
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ? String(initial.expectedDate).slice(0, 10) : '');
  const [lines, setLines] = useState<PrLineForm[]>(
    initial?.lines?.length
      ? initial.lines.map((l: any) => ({ itemName: l.itemName || '', category: l.category || 'Other', quantity: String(l.quantity ?? 1), estimatedRate: l.estimatedRate != null ? String(l.estimatedRate) : '', discount: l.discount ? String(l.discount) : '', preferredVendor: l.preferredVendor || '', description: l.description || '' }))
      : [{ ...EMPTY_LINE }],
  );
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  useEffect(() => {
    getItems().then((r: any) => setCatalog(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const setLine = (i: number, patch: Partial<PrLineForm>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lines.filter((l) => l.itemName.trim());
    if (!clean.length) { setError('Add at least one line item'); return; }
    for (const l of clean) {
      if (Number(l.quantity) <= 0) { setError('Quantity must be greater than 0'); return; }
      if (l.estimatedRate !== '' && Number(l.estimatedRate) < 0) { setError('Rate cannot be negative'); return; }
      if (l.discount !== '' && (Number(l.discount) < 0 || Number(l.discount) > 100)) { setError('Discount must be 0–100'); return; }
    }
    setError('');
    onSubmit({
      expectedDate: expectedDate || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      reason: reason.trim() || undefined,
      notes: notes.trim() || undefined,
      reference: reference.trim() || undefined,
      lines: clean.map((l) => ({
        itemName: l.itemName.trim(),
        category: l.category || 'Other',
        quantity: Number(l.quantity) || 1,
        estimatedRate: l.estimatedRate === '' ? 0 : Number(l.estimatedRate),
        discount: l.discount === '' ? 0 : Number(l.discount),
        preferredVendor: l.preferredVendor.trim() || undefined,
        description: l.description.trim() || undefined,
      })),
    });
  };

  const input = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full';
  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-700">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this needed?" className={`${input} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Reference #</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className={`${input} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Expected Date</label>
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={`${input} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700">Delivery Address</label>
          <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Where should it be delivered?" className={`${input} mt-1`} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-slate-700">Notes to Approver</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Context for the approver" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-700">Line Items</div>
        <datalist id="pr-catalog">
          {catalog.map((c: any, i: number) => <option key={c.id || i} value={c.name || c.Name} />)}
        </datalist>
        {lines.map((l, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/50">
            <div className="grid grid-cols-12 gap-2 items-center">
              <input value={l.itemName} onChange={(e) => setLine(i, { itemName: e.target.value })} placeholder="Item name * (type or pick from catalog)" list="pr-catalog" className={`${input} col-span-5`} />
              <input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} type="number" min={0} step="any" placeholder="Qty" title="Quantity" className={`${input} col-span-2`} />
              <input value={l.estimatedRate} onChange={(e) => setLine(i, { estimatedRate: e.target.value })} type="number" min={0} step="0.01" placeholder="Est. rate" title="Estimated rate" className={`${input} col-span-2`} />
              <input value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} type="number" min={0} max={100} step="any" placeholder="Disc %" title="Discount %" className={`${input} col-span-2`} />
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} className="col-span-1 h-9 text-slate-400 hover:text-rose-600 disabled:opacity-30 text-lg leading-none" title="Remove line">×</button>
            </div>
            <div className="grid grid-cols-12 gap-2 items-center">
              <select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} className={`${input} col-span-3 bg-white`} title="Category">
                {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={l.preferredVendor} onChange={(e) => setLine(i, { preferredVendor: e.target.value })} placeholder="Preferred vendor" className={`${input} col-span-4`} />
              <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description (optional)" className={`${input} col-span-5`} />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])} className="text-xs font-semibold text-blue-700 hover:underline">+ Add Another Line</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium" role="alert">{error}</div>}
      <div className="flex gap-3 justify-end pt-1">
        <button type="button" onClick={onCancel} disabled={submitting} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">Cancel</button>
        <button type="submit" disabled={submitting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-sm min-w-[110px]">
          {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Save as Draft'}
        </button>
      </div>
    </form>
  );
}

export function PrDetail({ pr, onAction, acting, showApprove = false }: {
  pr: any; acting: boolean; showApprove?: boolean;
  onAction: (action: 'submit' | 'approve' | 'reject' | 'recall' | 'cancel' | 'process', body?: any) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const btn = 'px-4 h-9 rounded-lg text-sm font-semibold shadow-sm disabled:opacity-60';
  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
        <div>
          <div className="font-bold text-slate-900">{pr.prNumber}</div>
          <div className="text-xs text-slate-500">{pr.reason || 'No reason given'} · {new Date(pr.createdAt).toLocaleDateString()}</div>
        </div>
        <PrStatusPill status={pr.status} />
        <div className="ml-auto text-sm font-bold text-slate-900">LKR {prTotal(pr).toFixed(2)}</div>
      </div>
      {(pr.expectedDate || pr.deliveryAddress || pr.reference || pr.notes) && (
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {pr.expectedDate && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Expected</div><div className="text-slate-700 mt-0.5">{String(pr.expectedDate).slice(0, 10)}</div></div>}
          {pr.deliveryAddress && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Deliver To</div><div className="text-slate-700 mt-0.5">{pr.deliveryAddress}</div></div>}
          {pr.reference && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Reference</div><div className="text-slate-700 mt-0.5">{pr.reference}</div></div>}
          {pr.notes && <div><div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Notes</div><div className="text-slate-700 mt-0.5">{pr.notes}</div></div>}
        </div>
      )}
      {pr.status === 'rejected' && pr.rejectReason && (
        <div className="px-5 py-3 bg-rose-50/60 border-b border-rose-100 text-xs text-rose-800">
          <span className="font-semibold">Rejection reason: </span>{pr.rejectReason}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {(pr.lines || []).map((l: any) => (
          <div key={l.id} className="px-5 py-3 flex items-center gap-3 text-sm">
            <div className="flex-[2] min-w-0">
              <div className="font-medium text-slate-900 truncate">{l.itemName}</div>
              <div className="text-xs text-slate-500 truncate">{l.preferredVendor ? `Pref: ${l.preferredVendor}` : l.description || l.category}</div>
            </div>
            <span className="w-20 text-right text-slate-600">× {l.quantity}</span>
            <span className="w-28 text-right font-medium text-slate-900">LKR {(l.quantity * l.estimatedRate * (1 - (l.discount || 0) / 100)).toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-2 flex-wrap">
        {(pr.status === 'draft' || pr.status === 'rejected') && (
          <button onClick={() => onAction('submit')} disabled={acting} className={`${btn} bg-[#2084FA] text-white hover:bg-blue-700`}>Submit for Approval</button>
        )}
        {pr.status === 'awaiting' && (
          <>
            {showApprove && (
              <>
                <button onClick={() => { if (window.confirm(`Approve ${pr.prNumber}?`)) onAction('approve'); }} disabled={acting} className={`${btn} bg-[#2084FA] text-white hover:bg-blue-700`}>Approve</button>
                <button onClick={() => setRejecting((v) => !v)} disabled={acting} className={`${btn} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}>Reject</button>
              </>
            )}
            <button onClick={() => onAction('recall')} disabled={acting} className={`${btn} bg-white border border-slate-300 text-slate-700 hover:bg-slate-100`}>Recall</button>
          </>
        )}
        {pr.status === 'approved' && (
          <button onClick={() => onAction('process')} disabled={acting} className={`${btn} bg-slate-900 text-white hover:bg-slate-800`}>Mark as Processed</button>
        )}
        {['draft', 'awaiting', 'rejected'].includes(pr.status) && (
          <button onClick={() => { if (window.confirm('Cancel this request?')) onAction('cancel'); }} disabled={acting} className="px-4 h-9 rounded-lg text-sm font-medium text-slate-500 hover:text-rose-600">Cancel request</button>
        )}
        {pr.status === 'approved' && (
          <span className="text-xs text-slate-500 self-center ml-auto">Approved — PO conversion lands in Phase 2.</span>
        )}
      </div>
      {rejecting && (
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (required)" className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400" />
          <button
            onClick={() => { if (rejectReason.trim()) { onAction('reject', { reason: rejectReason.trim() }); setRejecting(false); setRejectReason(''); } }}
            disabled={acting || !rejectReason.trim()}
            className="px-4 h-9 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60"
          >
            Confirm Reject
          </button>
        </div>
      )}
    </div>
  );
}

interface PrListPageProps {
  title: string;
  fetchFn: FetchFn;
  scope: 'mine' | 'all';
  hint?: string;
}

export function PrListPage({ title, fetchFn, scope, hint }: PrListPageProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    setLoading(true);
    fetchFn()
      .then((r) => setData(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [fetchFn]);

  const refreshOne = (updated: any) => {
    setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
    if (editing?.id === updated.id) setEditing(null);
  };

  const handleCreate = async (payload: any) => {
    setSubmitting(true);
    try {
      const created = await createPr(payload);
      setData((ds) => [created, ...ds]);
      setShowCreate(false);
    } catch (e: any) { setError(e?.message || 'Failed to create'); } finally { setSubmitting(false); }
  };

  const handleUpdate = async (payload: any) => {
    if (!editing) return;
    setSubmitting(true);
    try {
      const updated = await updatePr(editing.id, payload);
      refreshOne(updated);
    } catch (e: any) { setError(e?.message || 'Failed to save'); } finally { setSubmitting(false); }
  };

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'reject' | 'recall' | 'cancel' | 'process', body: any = {}) => {
    setActing(true);
    try {
      const updated = await prAction(id, action, body);
      refreshOne(updated);
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const visible = statusFilter === 'all' ? data : data.filter((d) => d.status === statusFilter);

  useEffect(() => {
    if (scope !== 'mine') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowCreate(true); setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scope]);

  const isEmptyMine = scope === 'mine' && !loading && visible.length === 0 && statusFilter === 'all' && !showCreate && !editing;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{hint || `${visible.length}${visible.length !== data.length ? ` / ${data.length} filtered` : ''} records • connected to backend`}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="awaiting">Awaiting Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="processed">Processed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={() => { setShowCreate(true); setEditing(null); }} className="px-4 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
            + New {title.replace(/s$/, '')}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium" role="alert">{error}</div>}

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider overflow-x-auto">
          <span className="flex-1 min-w-[200px]">PR Number</span>
          <span className="flex-1 min-w-[180px]">Reason</span>
          <span className="w-32 text-center">Status</span>
          <span className="w-28 text-right">Total</span>
          <span className="w-24 text-right">Action</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading {title.toLowerCase()}…</div>
        ) : isEmptyMine ? (
          <div className="p-12 text-center">
            <div className="text-sm font-medium text-slate-700">No purchase requests yet</div>
            <div className="text-xs text-slate-500 mt-1">Create one to see it here — this proves end-to-end (frontend → backend) works before you paste Stitch.</div>
            <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">Create Your First PR</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No {title.toLowerCase()} match the selected filter.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.slice(0, 20).map((row: any, i: number) => (
              <div key={row.id || row.ROWID || i} className="px-4 py-3 flex items-center gap-4 text-sm hover:bg-slate-50/50 transition-colors">
                <span className="flex-1 min-w-[200px] font-medium text-slate-900 truncate">{row.prNumber || row.id || `PR-${i + 1}`}</span>
                <span className="flex-1 min-w-[180px] text-slate-500 truncate">{row.reason || 'No reason'}</span>
                <span className="w-32 text-center"><PrStatusPill status={row.status} /></span>
                <span className="w-28 text-right font-medium text-slate-900">LKR {prTotal(row).toFixed(2)}</span>
                <span className="w-24 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenId(openId === row.id ? null : row.id); }}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    {openId === row.id ? 'Close' : 'View'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <PrForm
          submitting={submitting}
          onSubmit={handleCreate}
          onCancel={() => { setShowCreate(false); setError(''); }}
        />
      )}

      {editing && (
        <PrForm
          initial={editing}
          submitting={submitting}
          onSubmit={handleUpdate}
          onCancel={() => { setEditing(null); setError(''); }}
        />
      )}

      {openId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <PrDetail
              pr={data.find((d: any) => d.id === openId)}
              onAction={handleAction}
              acting={acting}
              showApprove={scope === 'all'}
            />
          </div>
        </div>
      )}

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        Stitch-ready: replace this table with your Stitch markup. Data is live via <code className="bg-white px-1 py-0.5 rounded border">src/api.ts</code>.
      </div>
    </div>
  );
}

// Need to import these from api
import { createPr, updatePr, prAction } from '../../../api';

// ── ListPage — generic list page for simple modules ──
export function ListPage({ title, fetchFn, columns = ['Name', 'Status'], hint }: { title: string; fetchFn: FetchFn; columns?: string[]; hint?: string }) {
  const { data, loading, setData } = useFetch(fetchFn);
  const filtered = useQueryFilter(data);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setData((d) => [{ id: `tmp-${Date.now()}`, name: name.trim(), status: 'Active', _local: true }, ...d]);
    setName('');
    setShowCreate(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{hint || `${filtered.length}${filtered.length !== data.length ? ` / ${data.length} filtered` : ''} records • connected to backend`}</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">
          + New {title.replace(/s$/, '')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-xl bg-white border border-slate-200 p-4 flex gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${title.toLowerCase()} name`} className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          <button type="submit" className="px-4 h-9 rounded-lg bg-slate-900 text-white text-sm font-semibold">Create</button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-3 h-9 rounded-lg bg-slate-100 text-slate-600 text-sm">Cancel</button>
        </form>
      )}

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex gap-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {columns.map((c) => <span key={c} className="flex-1">{c}</span>)}
          <span className="w-24 text-right">Action</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading {title.toLowerCase()}…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm font-medium text-slate-700">No {title.toLowerCase()} yet</div>
            <div className="text-xs text-slate-500 mt-1">Create one to see it here — this proves end-to-end (frontend → backend) works before you paste Stitch.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.slice(0, 20).map((row: any, i: number) => (
              <div key={row.id || row.ROWID || i} className="px-4 py-3 flex items-center gap-4 text-sm">
                <span className="flex-1 font-medium text-slate-900 truncate">{row.name || row.Name || row.title || row.vendorName || row.number || `Row ${i + 1}`}</span>
                <span className="flex-1 text-slate-500 truncate">{row.status || row.Status || row.state || '—'}</span>
                <span className="w-24 text-right"><button className="text-xs font-semibold text-blue-700 hover:underline">View</button></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
        Stitch-ready: replace this table with your Stitch markup. Data is live via <code className="bg-white px-1 py-0.5 rounded border">src/api.ts</code>.
      </div>
    </div>
  );
}

// ── ApprovalsInbox — shared approvals queue ──
function ageOf(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

const chevDown = (cls: string) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={cls}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ApprovalsInbox() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getPendingPrs()
      .then((r: any) => setData(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleAction = async (id: string, action: 'approve' | 'reject', body: any = {}) => {
    setActing(true);
    try {
      const updated = await prAction(id, action, body);
      setData((ds) => ds.filter((d) => d.id !== updated.id));
      if (openId === id) setOpenId(null);
    } catch (e: any) { setError(e?.message || 'Action failed'); } finally { setActing(false); }
  };

  const visible = typeFilter === 'all'
    ? data
    : data.filter((d) => (d.entityType || 'prs') === typeFilter);

  return (
    <div className="w-full">
      <div className="relative px-1 py-3">
        <button onClick={() => { setScopeOpen((v) => !v); setTypeOpen(false); }} className="flex items-center gap-1 text-[17px] font-bold text-slate-900">
          All Approvals
          {chevDown('text-[#2084FA]')}
        </button>
        {scopeOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setScopeOpen(false)} />
            <div className="absolute top-full left-0 mt-1 w-60 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-20">
              <div className="px-3 py-2 text-[13px] font-semibold text-slate-800 flex items-center justify-between">
                Pending approvals
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div className="px-3 py-2 text-[13px] text-slate-400">Decision history — feed coming</div>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-slate-200" />

      <div className="relative px-1 py-3">
        <button onClick={() => { setTypeOpen((v) => !v); setScopeOpen(false); }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          {typeFilter === 'all' ? 'Select Request Type' : 'Purchase Requests'}
          {chevDown('text-slate-400')}
        </button>
        {typeOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setTypeOpen(false)} />
            <div className="absolute top-full left-0 mt-1 w-60 rounded-lg bg-white border border-slate-200 shadow-lg py-1 z-20">
              {[
                { id: 'all', label: 'All request types' },
                { id: 'prs', label: 'Purchase Requests' },
              ].map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setTypeFilter(o.id); setTypeOpen(false); }}
                  className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  {o.label}
                  {typeFilter === o.id && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
              {['Purchase Orders', 'Bills', 'Vendors', 'RFQ Awards'].map((label) => (
                <div key={label} className="px-3 py-2 text-[13px] text-slate-400">{label} — feed coming</div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="border-t border-slate-200" />

      <div className="grid grid-cols-12 gap-2 px-1 py-2.5 bg-[#f8fafc] text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
        <span className="col-span-4 md:col-span-3">Submitted by</span>
        <span className="hidden md:block md:col-span-2">Entity type</span>
        <span className="col-span-5 md:col-span-4">Details</span>
        <span className="col-span-3">Status</span>
      </div>
      <div className="border-t border-slate-200" />

      {error && (
        <div className="mx-1 mt-3 rounded-lg px-4 py-3 text-sm font-medium border shadow-sm bg-rose-50 border-rose-200 text-rose-800" role="alert">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading approvals…</div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-[15px] text-slate-500">No Records Found</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((pr: any) => {
            const submittedBy = pr.requesterName || pr.createdBy?.email || '—';
            const age = ageOf(pr.createdAt || pr.updatedAt);
            const open = openId === pr.id;
            return (
              <div key={pr.id}>
                <button
                  onClick={() => setOpenId(open ? null : pr.id)}
                  className="w-full grid grid-cols-12 gap-2 px-1 py-3 text-sm text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="col-span-4 md:col-span-3 min-w-0">
                    <span className="block text-slate-700 truncate">{submittedBy}</span>
                    {age && <span className="block text-xs text-slate-400">{age}</span>}
                  </span>
                  <span className="hidden md:block md:col-span-2 text-slate-600 truncate self-start pt-0.5">Purchase Request</span>
                  <span className="col-span-5 md:col-span-4 min-w-0">
                    <span className="block font-medium text-slate-800 truncate">{pr.prNumber} · {pr.reason || `${(pr.lines || []).length} line(s)`}</span>
                    <span className="block text-xs text-slate-400 tabular-nums">LKR {prTotal(pr).toFixed(2)}</span>
                  </span>
                  <span className="col-span-3 self-start pt-0.5"><PrStatusPill status={pr.status} /></span>
                </button>
                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-1 py-3">
                    <PrDetail pr={pr} acting={acting} showApprove onAction={(a, b) => handleAction(pr.id, a as 'approve' | 'reject', b)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

