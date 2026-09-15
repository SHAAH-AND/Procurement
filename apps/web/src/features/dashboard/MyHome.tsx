import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingBag } from 'lucide-react';
import { getMyPrs, getPendingPrs } from '../../api';

function fmtDate(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    awaiting: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-blue-50 text-blue-700 border-blue-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    processed: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  const label = status === 'awaiting' ? 'Awaiting Approval' : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium ${map[status] || map.draft}`}>{label}</span>;
}

export function MyHome() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    getPendingPrs()
      .then((r: any) => setPending(Array.isArray(r) ? r : r?.data || []))
      .catch(() => setPending([]))
      .finally(() => setLoadingPending(false));
    getMyPrs()
      .then((r: any) => {
        const arr = Array.isArray(r) ? r : r?.data || [];
        // most recent first assumed; take 5
        setRecent(arr.slice(0, 5));
      })
      .catch(() => setRecent([]))
      .finally(() => setLoadingRecent(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-2 sm:px-4 pb-8 space-y-10">
      {/* Quick Create Purchase Request */}
      <div>
        <h2 className="text-[16px] font-semibold text-slate-800 mb-3">Quick Create Purchase Request</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2">
          <button
            onClick={() => navigate('/workspace/items')}
            className="flex flex-col items-center justify-center gap-3 py-10 px-6 hover:bg-slate-50/60 transition-colors border-b sm:border-b-0 sm:border-r border-slate-200"
          >
            <div className="w-10 h-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-[#c2410c]">
              <ShoppingBag size={18} />
            </div>
            <span className="text-sm font-medium text-slate-700">Search Items</span>
          </button>
          <button
            onClick={() => navigate('/workspace/requests?new=1')}
            className="flex flex-col items-center justify-center gap-3 py-10 px-6 hover:bg-slate-50/60 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2563eb]">
              <Search size={18} />
            </div>
            <span className="text-sm font-medium text-slate-700">New Purchase Request</span>
          </button>
        </div>
      </div>

      {/* Pending Approvals */}
      <div>
        <h2 className="text-[16px] font-semibold text-slate-800 mb-3">Pending Approvals</h2>
        <div className="bg-[#f8fafc] border border-slate-200 rounded-t-lg grid grid-cols-4 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          <span>SUBMITTED BY</span>
          <span>ENTITY TYPE</span>
          <span>DETAILS</span>
          <span>STATUS</span>
        </div>
        {loadingPending ? (
          <div className="bg-white border-x border-b border-slate-200 rounded-b-lg py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="bg-white border-x border-b border-slate-200 rounded-b-lg py-14 text-center text-sm text-slate-500">
            There are no transactions pending your approval.
          </div>
        ) : (
          <div className="bg-white border-x border-b border-slate-200 rounded-b-lg divide-y divide-slate-100">
            {pending.slice(0, 5).map((pr: any) => (
              <div key={pr.id} className="grid grid-cols-4 px-4 py-3 text-sm items-center">
                <span className="truncate text-slate-700">{pr.requesterName || pr.createdBy?.email || '—'}</span>
                <span className="text-slate-600">Purchase Request</span>
                <span className="truncate text-slate-600">{pr.prNumber || pr.reason || `${pr.lines?.length ?? 0} lines`}</span>
                <span><StatusPill status={pr.status} /></span>
              </div>
            ))}
          </div>
        )}
        <div className="border-b border-slate-200 mt-0" />
      </div>

      {/* My Recent Requests */}
      <div>
        <h2 className="text-[16px] font-semibold text-slate-800 mb-3">My Recent Requests</h2>
        <div className="bg-[#f8fafc] border border-slate-200 rounded-t-lg grid grid-cols-6 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          <span>REQUEST#</span>
          <span>EXPECTED DATE</span>
          <span>STATUS</span>
          <span>SUBMITTED ON</span>
          <span>APPROVER</span>
          <span>AMOUNT</span>
        </div>
        {loadingRecent ? (
          <div className="bg-white border-x border-b border-slate-200 rounded-b-lg py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="bg-white border-x border-b border-slate-200 rounded-b-lg py-14 text-center text-sm text-slate-500">
            You haven&apos;t created any purchase requests yet.
          </div>
        ) : (
          <div className="bg-white border-x border-b border-slate-200 rounded-b-lg divide-y divide-slate-100">
            {recent.map((pr: any) => {
              const total = (pr.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.estimatedRate || 0), 0);
              return (
                <div key={pr.id} className="grid grid-cols-6 px-4 py-3 text-sm items-center">
                  <span className="font-medium text-slate-800 truncate">{pr.prNumber}</span>
                  <span className="text-slate-600">{pr.expectedDate ? fmtDate(pr.expectedDate) : '—'}</span>
                  <span><StatusPill status={pr.status} /></span>
                  <span className="text-slate-600">{fmtDate(pr.createdAt)}</span>
                  <span className="truncate text-slate-600">{pr.approverName || '—'}</span>
                  <span className="font-medium text-slate-800 tabular-nums">LKR {total.toLocaleString('en-LK')}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="border-b border-slate-200 mt-0" />
      </div>
    </div>
  );
}
