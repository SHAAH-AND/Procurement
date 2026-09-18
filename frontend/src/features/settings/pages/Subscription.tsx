import { useState, useEffect } from 'react';
import { getTenantUsers, getBills, getVendors } from '../../../api';

// ── Plan + real usage counts (plan comes from the Organization row) ──

export function SubscriptionPage() {
  const [usage, setUsage] = useState({ users: 0, vendors: 0, bills: 0 });
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTenantUsers().then((r: any) => (Array.isArray(r) ? r : r?.data || []).length).catch(() => 0),
      getVendors().then((r: any) => (Array.isArray(r) ? r : r?.data || []).length).catch(() => 0),
      getBills().then((r: any) => (Array.isArray(r) ? r : r?.data || []).length).catch(() => 0),
    ]).then(([users, vendors, bills]) => {
      setUsage({ users, vendors, bills });
      setLoading(false);
    });
    try {
      const u = JSON.parse(localStorage.getItem('pf_user') || '{}');
      if (u.orgName) setOrgName(u.orgName);
    } catch { /* ignore */ }
  }, []);

  const cards = [
    { label: 'Seats Used', value: usage.users, of: 'unlimited (trial)' },
    { label: 'Vendors', value: usage.vendors, of: 'live count' },
    { label: 'Bills', value: usage.bills, of: 'live count' },
  ];

  return (
    <div className="max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0B1B4D] to-[#1E3A8A] text-white px-6 py-5 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">Current Plan</div>
          <div className="text-[22px] font-bold mt-0.5">Professional Trial</div>
          <div className="text-[13px] text-white/70 mt-0.5">{orgName || 'Your organization'} · all modules unlocked</div>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-[12px] font-semibold">Trial active</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 mt-4">
        {loading ? (
          <div className="sm:col-span-3 py-8 text-center text-sm text-slate-400">Measuring usage…</div>
        ) : (
          cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
              <div className="text-[24px] font-bold text-slate-900 tabular-nums mt-1">{c.value}</div>
              <div className="text-xs text-slate-400">{c.of}</div>
            </div>
          ))
        )}
      </div>
      <p className="text-[13px] text-slate-500 mt-4">
        Plan changes and billing are not connected yet — contact your administrator to upgrade. Usage above is measured live from your workspace data.
      </p>
    </div>
  );
}
