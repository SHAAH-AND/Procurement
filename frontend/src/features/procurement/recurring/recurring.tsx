import { useState, useEffect } from 'react';
import { useDocList, DocStatusPill } from '../shared/hooks';
import { getRecurrences, createRecurrence, runRecurrence, disableRecurrence, getBills } from '../../../api';

const INPUT = 'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

export function RecurringBillsPage() {
  const { data, setData, loading, error, setError } = useDocList(getRecurrences);
  const [bills, setBills] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [tpl, setTpl] = useState('');
  const [profile, setProfile] = useState('');
  const [freq, setFreq] = useState('monthly');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!tpl || !profile.trim()) { setError('Pick a template bill + profile name'); return; }
    setActing(true);
    try {
      const rec = await createRecurrence({ templateBillId: tpl, profileName: profile.trim(), frequency: freq, startDate: start || undefined, endDate: end || undefined });
      setData((ds) => [rec, ...ds]);
      setShowNew(false); setTpl(''); setProfile(''); setStart(''); setEnd('');
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  const run = async (id: string, action: 'run' | 'disable') => {
    setActing(true);
    try {
      const fn = action === 'run' ? runRecurrence : disableRecurrence;
      const updated = await fn(id);
      if (updated?.id) setData((ds) => ds.map((d) => (d.id === updated.id ? updated : d)));
      else {
        const fresh: any = await getRecurrences();
        setData(Array.isArray(fresh) ? fresh : []);
      }
    } catch (e: any) { setError(e?.message || 'Failed'); } finally { setActing(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Recurring Bills</h2>
          <p className="text-sm text-slate-500 mt-1">Automate regular vendor spend — child bills generate on schedule</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="px-4 py-2 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-blue-700 shadow-sm">+ New Profile</button>
      </div>
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex justify-between"><span>{error}</span><button onClick={() => setError('')} className="underline">Dismiss</button></div>}
      {showNew && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
          <input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="Profile name *" className={`${INPUT} w-full`} />
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={`${INPUT} bg-white w-full`}>
            <option value="">Template bill…</option>
            {bills.map((b: any) => <option key={b.id} value={b.id}>{b.billNumber} — {b.vendorName}</option>)}
          </select>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Repeat every</label>
              <select value={freq} onChange={(e) => setFreq(e.target.value)} className={`${INPUT} mt-1 bg-white w-full`}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Start date</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">End date (optional)</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${INPUT} mt-1 w-full`} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
            <button onClick={create} disabled={acting} className="px-5 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold disabled:opacity-60">Create Profile</button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-sm text-slate-400 rounded-2xl bg-white border border-slate-200">Loading…</div>
          : data.length === 0 ? <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 text-sm text-slate-500">No recurring profiles yet.</div>
          : data.map((r: any) => (
            <div key={r.id} className="px-4 py-3 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="font-bold text-slate-900 w-20 flex-shrink-0">{r.profileName}</span>
                <span className="flex-1 text-slate-700 truncate">{r.templateBill?.billNumber || '—'} · {r.frequency}</span>
                <DocStatusPill status={r.status} />
                <span className="text-xs text-slate-500">Next: {r.nextRun ? String(r.nextRun).slice(0, 10) : '—'}</span>
                {r.status === 'active' && <button onClick={() => run(r.id, 'run')} disabled={acting} className="text-xs font-semibold text-blue-700 hover:underline">Run now</button>}
                {r.status === 'active' && <button onClick={() => run(r.id, 'disable')} disabled={acting} className="text-xs text-slate-400 hover:text-rose-600">Disable</button>}
              </div>
              <div className="text-xs text-slate-400 mt-1">Created {new Date(r.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
      </div>
    </div>
  );
}