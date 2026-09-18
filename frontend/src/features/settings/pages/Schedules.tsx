import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecurrences, runRecurrence, disableRecurrence } from '../../../api';

// ── Schedules: the live bill-recurrence engine, surfaced in Settings ──

const fmtDate = (v?: any) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function SchedulesPage() {
  const navigate = useNavigate();
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(false);

  const load = () => {
    setLoading(true);
    getRecurrences()
      .then((r: any) => setRecs(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load schedules'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (id: string, action: 'run' | 'disable') => {
    setActing(true);
    setError('');
    try {
      if (action === 'run') {
        const bill: any = await runRecurrence(id);
        setNotice(`Bill generated${bill?.billNumber ? ` as ${bill.billNumber}` : ''}.`);
      } else {
        await disableRecurrence(id);
        setNotice('Schedule disabled.');
      }
      load();
    } catch (e: any) {
      setError(e?.message || 'Action failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <p className="text-[13px] text-slate-500 mb-3">
        Every active schedule stamps out a bill on its next run date. Manage profiles in{' '}
        <button onClick={() => navigate('/workspace/recurring')} className="text-[#2084FA] hover:underline font-medium">Recurring Bills</button>.
      </p>
      {error && (
        <div className="mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: 'minmax(160px,1.4fr) minmax(100px,0.8fr) minmax(110px,0.9fr) minmax(90px,0.7fr) 150px' }}>
          <span className="px-3 py-2.5 border-r border-slate-100">Schedule</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Repeats</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Next Run</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Status</span>
          <span className="px-3 py-2.5" />
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : recs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No schedules yet — create one from Recurring Bills.</div>
        ) : (
          recs.map((r: any) => (
            <div key={r.id} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white items-center" style={{ gridTemplateColumns: 'minmax(160px,1.4fr) minmax(100px,0.8fr) minmax(110px,0.9fr) minmax(90px,0.7fr) 150px' }}>
              <span className="px-3 py-2 border-r border-slate-100 font-medium text-slate-900 truncate">{r.profileName || '—'}</span>
              <span className="px-3 py-2 border-r border-slate-100 text-slate-600 capitalize">{r.frequency || '—'}</span>
              <span className="px-3 py-2 border-r border-slate-100 text-slate-600 tabular-nums">{fmtDate(r.nextRunDate)}</span>
              <span className="px-3 py-2 border-r border-slate-100">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${r.status === 'active' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
                  {r.status}
                </span>
              </span>
              <span className="px-3 py-2 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                {r.status === 'active' ? (
                  <>
                    <button onClick={() => act(r.id, 'run')} disabled={acting} className="text-[13px] font-semibold text-[#2084FA] hover:underline disabled:opacity-50">Run now</button>
                    <button onClick={() => act(r.id, 'disable')} disabled={acting} className="text-[13px] text-slate-400 hover:text-rose-600 disabled:opacity-50">Disable</button>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
