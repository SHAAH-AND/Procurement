import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../features/auth/AuthContext';
import { RippleButton } from '../components/ui/RippleButton';

// Sign-in is Catalyst hosted authentication. The Zoho Accounts form is
// embedded in #catalyst-login-container by the Catalyst web SDK; this page
// never sees a password. Membership is invitation-only: the account must have
// been added by an administrator (Settings → Users) or through the Catalyst
// console before the workspace lets it in.
const HOSTED_LOGIN = '/__catalyst/auth/login';
const APP_HOME = `${window.location.origin}/app/`;

export default function SignInPage() {
  const navigate = useNavigate();
  const { state, error: bootError, identity, logout, refresh } = useAuth();
  const [widgetError, setWidgetError] = useState('');
  const [widgetReady, setWidgetReady] = useState(false);
  const mounted = useRef(false);

  // Already signed in: the workspace decides what to show next.
  useEffect(() => {
    if (state === 'ready' || state === 'setup-required' || state === 'not-member' || state === 'inactive') {
      navigate('/workspace', { replace: true });
    }
  }, [state, navigate]);

  // Mount the embedded Zoho Accounts widget once the SDK is present and we
  // know there is no session. The SDK owns the frame from here on.
  useEffect(() => {
    if (state !== 'signed-out' || mounted.current) return;
    const auth = window.catalyst?.auth;
    if (!auth || typeof auth.signIn !== 'function') { setWidgetError('The secure sign-in panel could not load. Use the button below instead.'); return; }
    mounted.current = true;
    try {
      // Called as a method: the SDK relies on `this`.
      const result: any = auth.signIn('catalyst-login-container', { service_url: APP_HOME });
      setWidgetReady(true);
      if (result && typeof result.catch === 'function') {
        result.catch(() => { /* the frame is the authority once mounted */ });
      }
    } catch {
      mounted.current = false;
      setWidgetError('The secure sign-in panel could not load. Use the button below instead.');
    }
  }, [state]);

  const stage = state === 'booting' ? 4 : state === 'backend-down' || state === 'sdk-failed' || state === 'error' ? -1 : 0;
  const stageText = stage === 4 ? 'Checking your session' : stage === -1 ? 'Sign-in unavailable' : 'Ready to sign in';

  return (
    <div className="min-h-screen bg-[#E7EDF9] flex items-center justify-center p-3 sm:p-6 lg:p-10 antialiased text-slate-800 relative overflow-hidden">
      <div className="absolute inset-0 pf-pattern-bg pointer-events-none select-none" aria-hidden="true" style={{ opacity: 0.22 }} />
      <div className="absolute inset-0 bg-gradient-to-br from-white/55 via-white/20 to-slate-900/[0.06] pointer-events-none" aria-hidden="true" />
      <main className="w-full max-w-6xl bg-white rounded-[32px] shadow-[0_25px_65px_-12px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col transition-all duration-300 relative z-10">
        <header className="w-full h-11 bg-white border-b border-slate-100 flex items-center px-5 gap-2 select-none">
          <div aria-hidden="true" className="flex items-center gap-2 mr-3">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] inline-block"></span>
          </div>
          <div className="flex-1 max-w-md mx-auto h-8 flex items-center justify-center gap-2.5 select-none">
            <span className="sr-only" aria-live="polite">{stageText}</span>
            <img src="/app/img/procureflow-logo-full.png" alt="ProcureFlow" className="h-6 w-auto object-contain" />
            <span className={`hidden sm:inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider ${stage === -1 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
              <motion.span
                className={`w-1.5 h-1.5 rounded-full ${stage === -1 ? 'bg-rose-500' : 'bg-blue-500'}`}
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
              {stage === -1 ? 'OFFLINE' : stage === 4 ? '···' : 'SECURE'}
            </span>
          </div>
        </header>

        <motion.div
          className="p-6 md:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch bg-white relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="absolute inset-y-0 left-0 w-full lg:w-[50%] flex items-center justify-center overflow-hidden pointer-events-none select-none" aria-hidden="true">
            <img src="/app/img/procureflow-p-icon.png" alt="" className="w-[640px] max-w-[115%] h-auto opacity-[0.62]" />
          </div>

          {/* Left column: embedded Zoho Accounts sign-in */}
          <section className="lg:col-span-6 flex flex-col justify-center relative z-10">
            <div className="max-w-md w-full mx-auto lg:mx-0 pt-2 pb-6">
              <motion.div
                className="flex items-center gap-3 mb-8"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <motion.img
                  src="/app/img/procureflow-logo-full.png"
                  alt="ProcureFlow — Smarter Procurement. Simplified."
                  className="h-14 w-auto object-contain"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>

              <div className="mb-6">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-2.5">
                  Welcome back to<br />ProcureFlow
                </h1>
                <p className="text-sm leading-relaxed text-slate-500 font-normal">
                  Sign in with the Zoho Account linked to your invitation. Your workspace is ready when you are.
                </p>
              </div>

              {(bootError || widgetError) && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 text-sm font-medium flex items-start gap-2" role="alert">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
                  <span>{widgetError || bootError}</span>
                </div>
              )}

              {state === 'booting' && (
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-500 flex items-center gap-3">
                  <svg className="w-4 h-4 animate-spin text-[#2084FA]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0110 10" strokeWidth="2" strokeLinecap="round" /></svg>
                  Checking your session…
                </div>
              )}

              {(state === 'backend-down' || state === 'sdk-failed' || state === 'error') && (
                <RippleButton type="button" onClick={() => refresh()}>Try again</RippleButton>
              )}

              {state === 'signed-out' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                  {/* The Catalyst web SDK renders the Zoho Accounts form here. */}
                  <div
                    id="catalyst-login-container"
                    className="catalyst-login rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[380px]"
                    aria-live="polite"
                  />
                  {!widgetReady && !widgetError && (
                    <p className="text-xs text-slate-400 mt-2">Loading the secure sign-in panel…</p>
                  )}
                  <div className="mt-4">
                    <a href={HOSTED_LOGIN} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                      Open the sign-in page instead
                    </a>
                  </div>
                </motion.div>
              )}

              {identity && state !== 'ready' && state !== 'booting' && state !== 'signed-out' && (
                <div className="mt-4 text-xs text-slate-500">
                  Signed in as <strong>{identity.email}</strong>.{' '}
                  <button type="button" onClick={logout} className="font-semibold text-cyan-600 hover:underline">Use a different Zoho Account</button>
                </div>
              )}

              <div className="text-center mt-6">
                <p className="text-xs text-slate-500">
                  Need access to your hotel group&apos;s workspace?{' '}
                  <a className="font-semibold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors" href="#/signup">
                    Request a seat
                  </a>
                </p>
              </div>
            </div>
          </section>

          {/* Right Column (Visual Feature Showcase Card) - with animations */}
          <section className="lg:col-span-6">
            <motion.div
              className="relative w-full h-full min-h-[560px] rounded-[28px] overflow-hidden bg-gradient-to-br from-[#2084FA] to-[#7F3EDD] p-7 sm:p-9 flex flex-col justify-between shadow-inner text-white"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              {/* Subtle Atmospheric Background Glows - with floating animation */}
              <motion.div
                aria-hidden="true"
                className="absolute -top-24 -right-24 w-80 h-80 bg-white/20 rounded-full blur-3xl pointer-events-none"
                animate={{
                  x: [0, 10, 0, -10, 0],
                  y: [0, -10, 0, 10, 0]
                }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              ></motion.div>
              <motion.div
                aria-hidden="true"
                className="absolute -bottom-20 -left-20 w-72 h-72 bg-slate-900/30 rounded-full blur-2xl pointer-events-none"
                animate={{
                  x: [0, -8, 0, 8, 0],
                  y: [0, 8, 0, -8, 0]
                }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              ></motion.div>

              {/* Feature Header Caption - with staggered animation */}
              <motion.div
                className="relative z-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 backdrop-blur-md mb-3 text-[11px] font-semibold uppercase tracking-wider text-cyan-200">
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  ></motion.span>
                  Hospitality Autonomous Spend Engine
                </div>
                <motion.h2
                  className="text-white text-2xl sm:text-3xl font-bold tracking-tight leading-snug max-w-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                >
                  Autonomous procurement orchestration for modern hospitality.
                </motion.h2>
              </motion.div>

              {/* Center SaaS Flow Telemetry Preview Card - with staggered animation */}
              <motion.div
                className="relative z-10 my-4 flex flex-col gap-3 max-w-sm w-full mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                {/* Floating Notification Card - with hover animation */}
                <motion.div
                  className="bg-white/95 rounded-2xl p-4 text-slate-800 shadow-2xl backdrop-blur-md border border-white/40"
                  whileHover={{ y: -4, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.2)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">PO #48291 Auto-Approved</p>
                        <p className="text-[11px] text-slate-500">Grand Hyatt F&B Procurement</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">99.8% Match</span>
                  </div>
                  {/* Metric Bar */}
                  <div className="flex items-center justify-between text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2 mt-2">
                    <span>Requisition: $14,280.00</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-cyan-700 font-semibold">3-Way Matched</span>
                  </div>
                </motion.div>

                {/* Mini Sub-Card: Live Spend Stream - with animation */}
                <motion.div
                  className="bg-white/20 border border-white/30 rounded-2xl p-3.5 backdrop-blur-md text-white flex items-center justify-between"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.8 }}
                >
                  <div className="flex items-center gap-2.5">
                    <motion.div
                      className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    ></motion.div>
                    <span className="text-xs font-semibold tracking-wide">Real-Time Budget Audit</span>
                  </div>
                  <span className="text-xs font-mono font-medium text-cyan-200">$4.2M Monitored Today</span>
                </motion.div>
              </motion.div>

              {/* Bottom Glassmorphism Control Widget - with animation */}
              <motion.div
                className="relative z-10 glass-dock rounded-2xl p-4 text-white"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.9 }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  {/* Left Status Pill */}
                  <div className="flex items-center">
                    <div className="inline-flex items-center glass-toggle rounded-full px-3 py-1 shadow-inner gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      <span className="text-xs font-semibold tracking-wide text-white">Live Orchestration</span>
                    </div>
                  </div>
                  {/* Right Circular Action Icon Buttons */}
                  <div className="flex items-center gap-1.5">
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label="Previous batch"
                      className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center hover:bg-white/20 transition-all text-white"
                      type="button"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label="Next batch"
                      className="w-8 h-8 rounded-full border border-white/40 flex items-center justify-center hover:bg-white/20 transition-all text-white"
                      type="button"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    </motion.button>
                  </div>
                </div>
                {/* Bottom Caption Inside Dock */}
                <p className="text-[12px] text-white/90 font-normal leading-relaxed">
                  Automate 3-way matching, dock GRN reconciliation, and multi-property vendor catalogs in real time.
                </p>
              </motion.div>
            </motion.div>
          </section>
        </motion.div>
      </main>

      <style>{`
        .glass-dock {
          background: rgba(7, 23, 90, 0.35);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.22);
        }
        .glass-toggle {
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.4);
        }
        .catalyst-login iframe { width: 100% !important; min-height: 380px; border: 0; display: block; }
      `}</style>
    </div>
  );
}
