import { useState } from 'react';
import { motion } from 'framer-motion';
import { setupWorkspace } from '../../api';
import { useAuth } from './AuthContext';
import { RippleButton } from '../../components/ui/RippleButton';

// First-run setup. Runs once per installation: it creates the workspace, the
// approval hierarchy, the permission profiles, the properties and the hotel
// item-master fields, and makes the signed-in person the administrator.
// A second attempt is refused by the server (409 ALREADY_SET_UP).

const COUNTRIES = ['Sri Lanka', 'India', 'Maldives', 'United Arab Emirates', 'Singapore', 'United Kingdom', 'United States', 'Other'];
const CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'MVR'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const INPUT = 'w-full text-sm px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] transition-all';

export default function SetupPage() {
  const { identity, refresh, logout } = useAuth();
  const [form, setForm] = useState({
    orgName: '', phone: '', address: '', country: 'Sri Lanka', currency: 'LKR',
    fiscalYearStart: 'April', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Colombo',
    adminName: identity?.name || '', adminApprovalLimit: '1000000', properties: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.orgName.trim()) { setError('Enter the hotel or group name.'); return; }
    setBusy(true); setError('');
    try {
      // "Name | Location | Cluster" per line; only "|" separates, because
      // commas and dashes appear inside real property names.
      const properties = form.properties.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
        const [Name, Location, Cluster] = line.split('|');
        return { Name: (Name || '').trim(), Location: (Location || '').trim(), Cluster: (Cluster || '').trim() };
      }).filter((p) => p.Name);
      await setupWorkspace({
        orgName: form.orgName.trim(), currency: form.currency, country: form.country,
        address: form.address.trim(), phone: form.phone.trim(), fiscalYearStart: form.fiscalYearStart,
        timezone: form.timezone, adminName: form.adminName.trim() || identity?.email || 'Administrator',
        adminApprovalLimit: Number(form.adminApprovalLimit) || 0,
        domain: (identity?.email || '').split('@')[1] || '', properties,
      });
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Setup failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E7EDF9] flex items-start justify-center p-4 sm:p-8 antialiased text-slate-800 relative overflow-y-auto">
      <div className="absolute inset-0 pf-pattern-bg pointer-events-none select-none" aria-hidden="true" style={{ opacity: 0.22 }} />
      <motion.main
        className="w-full max-w-2xl bg-white rounded-[28px] shadow-[0_25px_65px_-12px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.05)] relative z-10 p-6 sm:p-10"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <img src="/app/img/procureflow-logo-full.png" alt="ProcureFlow" className="h-12 w-auto object-contain" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Set up your hotel group</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          This runs once. Departments, purchasing categories, CapEx/OpEx rules, the approval hierarchy and the hotel
          item-master fields are configured for you — tell us the group details and which properties you run.
          Everything is editable later in Settings.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Signed in as <strong className="text-slate-600">{identity?.email}</strong>. You will become the administrator.{' '}
          <button type="button" onClick={logout} className="text-[#2084FA] hover:underline">Not you?</button>
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 text-sm font-medium" role="alert">{error}</div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Group details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2 block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Hotel or group name <span className="text-rose-500">*</span></span>
                <input className={INPUT} value={form.orgName} onChange={(e) => set('orgName', e.target.value)} placeholder="e.g. Galle Face Hotel Group" required />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Your name</span>
                <input className={INPUT} value={form.adminName} onChange={(e) => set('adminName', e.target.value)} placeholder="Administrator" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Company phone</span>
                <input className={INPUT} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+94 11 234 5678" />
              </label>
              <label className="sm:col-span-2 block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Business address</span>
                <input className={INPUT} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, city, postal code" />
              </label>
            </div>
          </section>

          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-900 leading-relaxed">
            🏨 <strong>Hotel procurement</strong> — your workspace is created with the departmental classification, the four
            expenditure classes (CapEx, OpEx, Repair, AMC), the approval hierarchy, standard payment terms and the
            item-master fields for UOM conversion, lead time, tax treatment and par levels.
          </div>

          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Your properties</h2>
            <textarea
              className={`${INPUT} min-h-[120px] font-mono text-[13px]`}
              value={form.properties}
              onChange={(e) => set('properties', e.target.value)}
              placeholder={'Galle Face Hotel Colombo | Colombo | Galle Face Hotel\nQueens Hotel Kandy | Kandy | Kandy hotels'}
            />
            <p className="text-xs text-slate-400 mt-1.5">
              One property per line as <code className="bg-slate-100 px-1 rounded">Name | Location | Cluster</code>. Leave empty to start from the standard group structure.
            </p>
          </section>

          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Regional settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Country</span>
                <select className={INPUT} value={form.country} onChange={(e) => set('country', e.target.value)}>
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Currency</span>
                <select className={INPUT} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Fiscal year starts</span>
                <select className={INPUT} value={form.fiscalYearStart} onChange={(e) => set('fiscalYearStart', e.target.value)}>
                  {MONTHS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Your approval limit ({form.currency})</span>
                <input className={INPUT} type="number" min={0} value={form.adminApprovalLimit} onChange={(e) => set('adminApprovalLimit', e.target.value)} />
              </label>
              <label className="sm:col-span-2 block">
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Timezone</span>
                <input className={INPUT} value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
              </label>
            </div>
          </section>

          <div className="pt-2">
            <RippleButton type="submit" disabled={busy}>{busy ? 'Setting up…' : 'Create workspace'}</RippleButton>
          </div>
        </form>
      </motion.main>
    </div>
  );
}
