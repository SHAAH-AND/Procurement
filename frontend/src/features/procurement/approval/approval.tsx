import { useState, useEffect } from 'react';
import { PrStatusPill, prTotal } from '../shared/hooks';
import { getPendingPrs, prAction } from '../../../api';

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

export function ApprovalsPage() {
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
      .then((r) => setData(Array.isArray(r) ? r : r?.data || []))
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
      {/* Title row — scope switcher */}
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

      {/* Filter row — request type */}
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

      {/* Column band */}
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

// Need PrDetail component - import from shared
import { PrDetail } from '../shared/components';