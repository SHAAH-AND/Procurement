import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setToken } from './api';


export default function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [cluster, setCluster] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password) as any;
      setToken(result.access_token);
      if (result.orgName) {
        navigate('/workspace', { state: { orgName: result.orgName, userName: result.userName, email } });
      } else {
        navigate('/workspace', { state: { orgName: 'Workspace', userName: email.split('@')[0], email } });
      }
    } catch (err: any) {
      setError(err.message || 'Sign in failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8faf9] flex flex-col">
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#144e3c] flex items-center justify-center text-white shadow-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M3 13h2v5H3v-5zm10 0h2v5h-2v-5zm-10 3h14v2H3v-2z" fill="white"/>
                </svg>
              </div>
              <span className="font-bold text-lg text-slate-900 tracking-tight">ProcureFlow</span>
            </a>
            <div className="hidden sm:block h-4 w-px bg-slate-200"/>
            <a href="/" className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 tracking-wide uppercase transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7.5 16.5L16.5 7.5M16.5 7.5H13.5v3H10.5L7.5 13.5M7.5 16.5H10.5v-3H13.5L16.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Return to Main Site
            </a>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
              <a href="/signin" className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-900 font-semibold">Sign In</a>
              <a href="/signup" className="px-3 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors">Request Access</a>
              <a href="/" className="px-3 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors">Security FAQs</a>
            </nav>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"/>
              SOC2 Type II
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px] w-full rounded-2xl shadow-sm border border-slate-200 overflow-hidden bg-white">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-5 bg-[#eaf4ee] p-8 sm:p-10 lg:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#d3e5da] relative">
            <div className="space-y-8 relative z-10">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-900/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-700"/>
                  Procurement, in perfect flow
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  Every purchase,<br/>
                  <span className="italic font-medium text-emerald-800">beautifully</span> in control.
                </h1>
                <p className="text-sm sm:text-base text-slate-700 font-normal leading-relaxed">
                  One calm command centre for the people, properties, and decisions behind every enterprise procurement commitment.
                </p>
              </div>
              {/* Procure to Pay Lifecycle Card */}
              <div className="bg-white/90 backdrop-blur rounded-xl p-4 border border-[#d3e5da] shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[11px] font-bold">PF</span>
                    <span className="text-xs font-bold text-slate-900">Procure to Pay</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Live Workflow</span>
                </div>
                <div className="space-y-2">
                  {[
                    { icon: '↗', title: 'Request PR-0284', desc: 'Linen & Amenities replenishment', badge: 'Raised', badgeColor: 'slate' },
                    { icon: '✓', title: 'Approval Clear', desc: 'Tier-2 Finance & Cluster GM sign-off', badge: 'Cleared', badgeColor: 'emerald' },
                    { icon: '⚡', title: 'Order PO-8819', desc: 'Dispatched to Global Textiles Ltd', badge: 'Issued', badgeColor: 'amber' },
                    { icon: '✓✓', title: 'Receive & Reconcile', desc: 'Automated 3-way line item match', badge: 'Verified', badgeColor: 'indigo' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100/80">
                      <div className="flex items-center gap-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={step.badgeColor === 'emerald' ? 'text-emerald-600' : step.badgeColor === 'amber' ? 'text-amber-600' : step.badgeColor === 'indigo' ? 'text-indigo-600' : 'text-sky-600'}>
                          {step.icon === '✓' ? <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> : step.icon === '✓✓' ? <path d="M5 13l4 4L19 7M9 13l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> : step.icon === '⚡' ? <path d="M13 13h10l-4-4M13 13l4 4M13 13H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> : <path d="M12 2l8 6-8 6v-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
                        </svg>
                        <div>
                          <div className="text-xs font-semibold text-slate-900">{step.title}</div>
                          <div className="text-[11px] text-slate-500">{step.desc}</div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${step.badgeColor === 'emerald' ? 'bg-emerald-100 text-emerald-800' : step.badgeColor === 'amber' ? 'bg-amber-100 text-amber-800' : step.badgeColor === 'indigo' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'}`}>
                        {step.badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Trust Points */}
              <div className="space-y-4 pt-1">
                {[
                  { n: '01', title: 'Invitation-only', desc: 'Access stays strictly sandboxed within your validated hotel group or operating partner tenant.' },
                  { n: '02', title: 'Role-bound', desc: 'Granular approval routing guarantees every procurement commitment automatically routes to the authorized signatory.' },
                  { n: '03', title: 'Always traceable', desc: 'Immutable enterprise audit trail with sub-second timestamps and dual-custody verification logs.' },
                ].map((p) => (
                  <div key={p.n} className="flex items-start gap-3">
                    <span className="text-xs font-bold text-emerald-800 bg-white border border-[#d3e5da] rounded-md px-2 py-1">{p.n}</span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{p.title}</h4>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-8 flex items-center justify-between text-[11px] font-semibold text-slate-500 tracking-wider">
              <span>SECURE GATEWAY CLUSTER // US-EAST-01</span>
              <span>BUILD 4.19.8</span>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-7 bg-white p-8 sm:p-12 lg:p-16 flex flex-col justify-center">
            <div className="max-w-xl mx-auto w-full space-y-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold tracking-wide uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"/>
                  Enterprise Portal
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Step into your procurement flow</h2>
                <p className="text-sm text-slate-600 leading-relaxed">Sign in with your verified corporate work email address.</p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800 tracking-wide" htmlFor="work-email">
                    Corporate Work Email Address
                  </label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 5l5 5-5 5M3 5l8 8M3 5v14h18V5M21 15v3H3v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <input
                      className="w-full h-11 pl-10 pr-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#144e3c] focus:border-transparent focus:bg-white transition-all"
                      id="work-email"
                      placeholder="e.g. j.doe@resortgroup.com"
                      required
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-800 tracking-wide" htmlFor="password">
                      Password
                    </label>
                    <a href="#forgot" className="text-xs font-semibold text-[#144e3c] hover:underline transition-colors">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none" width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M13 11v6M11 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    <input
                      className="w-full h-11 pl-10 pr-11 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#144e3c] focus:border-transparent focus:bg-white transition-all"
                      id="password"
                      placeholder="Enter your corporate passkey"
                      required
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={loading}
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1" onClick={() => setShowPw(!showPw)}>
                      {showPw ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5l-14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 5l14 14M19 5l-14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M16 5l4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-800 tracking-wide" htmlFor="cluster-id">
                    Property / Cluster Domain <span className="font-normal text-slate-500">(Optional fast-route)</span>
                  </label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12v7a2 2 0 002 2h14a2 2 0 002-2v-7M8 12V5a2 2 0 012-2h4a2 2 0 012 2v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <select
                      className="w-full h-11 pl-10 pr-10 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#144e3c] focus:border-transparent focus:bg-white transition-all appearance-none cursor-pointer"
                      id="cluster-id"
                      value={cluster}
                      onChange={e => setCluster(e.target.value)}
                    >
                      <option value="">Auto-detect workspace from domain</option>
                      <option value="luxury-resorts-north">The Grand Mirage - Aspen & Rockies</option>
                      <option value="pacific-hospitality">Pacific Bay Hotels & Suites Group</option>
                      <option value="euro-metro-collection">Metropolitan Continental Hotels (EU)</option>
                      <option value="central-holding">Corporate Executive & Procurement HQ</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[20px]" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 pt-1">
                  <input className="w-4 h-4 rounded border-slate-300 text-[#144e3c] focus:ring-[#144e3c] cursor-pointer" id="remember" type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                  <label className="text-xs text-slate-600 cursor-pointer select-none" htmlFor="remember">
                    Keep me signed in on this authorized workstation (30 days)
                  </label>
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-lg bg-[#144e3c] hover:bg-[#0f3d2f] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all active:scale-[0.99] disabled:opacity-70"
                  >
                    {loading ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                    ) : (
                      <>
                        <span>Step into your procurement flow</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {error && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
                  <svg className="text-red-600 text-[20px] flex-shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <div>
                    <h4 className="text-xs font-bold text-red-900">Sign in failed</h4>
                    <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{error}</p>
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                <svg className="text-amber-600 text-[20px] flex-shrink-0 mt-0.5" width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M12 8v4M12 17h.01M5 12a7 7 0 1114 0 7 7 0 01-14 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Need assistance signing in?</h4>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    Contact your internal Procurement Administrator to verify your invite or reset your password.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-1.5">
                  <svg className="text-emerald-600 text-[16px]" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/></svg>
                  <span>SOC2 TYPE II COMPLIANT</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="text-sky-600 text-[16px]" width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 11v5M17 11v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <span>256-BIT TLS ENCRYPTION</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="text-slate-600 text-[16px]" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3l8 1.5v6l-8 1.5L12 15l-8-1.5v-6l8-1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <span>ISO 27001 VERIFIED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full bg-white border-t border-slate-200 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <svg className="text-emerald-700" width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#10b981" strokeWidth="1.5"/><path d="M7 11v5M17 11v5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Bank-Grade 256-bit TLS Encryption
            </div>
            <div className="h-3.5 w-px bg-slate-200"/>
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <svg className="text-sky-700" width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="10" stroke="#0ea5e9" strokeWidth="1.5"/></svg>
              ISO/IEC 27001 Certified
            </div>
          </div>
          <div className="flex items-center gap-6 font-medium">
            <a href="#" className="hover:text-slate-900 transition-colors">Security Whitepaper</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Compliance Terms</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Privacy Shield</a>
          </div>
          <div>© 2025 ProcureFlow Financial Technologies. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
