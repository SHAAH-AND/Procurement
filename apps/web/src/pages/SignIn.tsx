import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../features/auth/AuthContext';
import { RippleButton } from '../components/ui/RippleButton';

declare global {
  interface Window {
    catalyst?: {
      auth?: {
        signIn?: (containerId: string, opts?: Record<string, string>) => Promise<unknown> | void;
        signOut?: (redirect?: string) => void;
        isUserAuthenticated?: () => Promise<{ content?: Record<string, string> }>;
      };
    };
  }
}

export default function SignInPage() {
  const navigate = useNavigate();
  const { setUser: setAuthUser, loginDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const attemptRef = useState({ id: 0 })[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitState('loading');
    setLoading(true);
    const attempt = ++attemptRef.id;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Sign-in timed out after 12s — is the backend running on :3000?')), 12000)
    );
    try {
      const { login, setToken } = await import('../api');
      const res: any = await Promise.race([login(email.trim(), password.trim()), timeout]);
      if (attempt !== attemptRef.id) return; // user cancelled
      setToken(res.access_token);
      setAuthUser(res.access_token, { id: res.userId, email: email.trim(), name: res.userName || email.trim().split('@')[0], orgName: res.orgName });
      setSubmitState('success');
      navigate('/workspace', { state: { orgName: res.orgName } });
    } catch (err: any) {
      if (attempt !== attemptRef.id) return; // user cancelled
      // Fallback: if local backend down, try Catalyst SDK (skip on timeout/cancel)
      if (!err.message?.includes('timed out') && typeof window !== 'undefined' && window.catalyst?.auth?.signIn) {
        try {
          await window.catalyst.auth.signIn('auth-container');
          setSubmitState('success');
          return;
        } catch {}
      }
      setSubmitState('error');
      setError(err.message || 'Sign in failed. Check email/password and that backend is running on :3000.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    loginDemo();
    navigate('/workspace', { state: { orgName: 'Demo Hotel Group' } });
  };

  // Header strip stage follows the form: 0 idle → 1 email ok → 2 password → 3 in / -1 denied / 4 signing in
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailOk = emailBlurred && emailValid;
  const pwActive = pwFocused || password.length > 0;
  const pwOk = password.length > 0;
  const ready = emailOk && pwOk;
  const stage = submitState === 'success' ? 3 : submitState === 'error' ? -1 : submitState === 'loading' ? 4 : emailOk && pwActive ? 2 : emailOk ? 1 : 0;
  const stageText = stage === 3 ? 'Signed in — entering workspace' : stage === -1 ? 'Sign in failed — check your details and retry' : stage === 4 ? 'Signing in' : stage === 2 ? 'Password entry active' : stage === 1 ? 'Email accepted' : 'Sign-in progress';
  // Orbit ring travels: logo(0) → lock(1) → bolt(2) → check(3/4/-1)
  const orbitAt = stage <= 0 ? 'logo' : stage === 1 ? 'lock' : stage === 2 ? 'bolt' : 'check';
  const orbitColor = stage === 3 ? 'border-t-emerald-500' : stage === -1 ? 'border-t-rose-500' : orbitAt === 'lock' ? 'border-t-cyan-500' : orbitAt === 'bolt' ? 'border-t-amber-500' : 'border-t-[#2084FA]';
  const orbitSpeed = stage === 4 ? 0.7 : 2.2;
  const OrbitRing = ({ size = 'w-8 h-8' }: { size?: string }) => (
    <motion.span
      layoutId="signin-orbit"
      className={`absolute ${size} rounded-full border-2 border-transparent ${orbitColor} pointer-events-none`}
      animate={{ rotate: 360 }}
      transition={{ duration: orbitSpeed, repeat: Infinity, ease: 'linear', layout: { type: 'spring', stiffness: 200, damping: 26 } }}
    />
  );

  return (
    <div className="min-h-screen bg-[#E7EDF9] flex items-center justify-center p-3 sm:p-6 lg:p-10 antialiased text-slate-800 relative overflow-hidden">
      {/* Faint crate pattern only — Sign-In stays clean, workspace gets the P watermark */}
      <div className="absolute inset-0 pf-pattern-bg pointer-events-none select-none" aria-hidden="true" style={{ opacity: 0.22 }} />
      {/* soft gradient overlay to keep card readable */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/55 via-white/20 to-slate-900/[0.06] pointer-events-none" aria-hidden="true" />
      {/* Main Browser / Card Wrapper Window */}
      <main className="w-full max-w-6xl bg-white rounded-[32px] shadow-[0_25px_65px_-12px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col transition-all duration-300 relative z-10">
        {/* Browser Top Window Bar */}
        <header className="w-full h-11 bg-white border-b border-slate-100 flex items-center px-5 gap-2 select-none">
          {/* Mac Window Controls */}
          <div aria-hidden="true" className="flex items-center gap-2 mr-3">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] inline-block cursor-pointer"></span>
            <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] inline-block cursor-pointer"></span>
            <span className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] inline-block cursor-pointer"></span>
          </div>
          
          {/* Live secure-flow strip: stages follow the form (0 idle → 1 email → 2 password → 3 in / ✖ denied) */}
          <motion.div
            className="flex-1 max-w-md mx-auto h-8 flex items-center justify-center gap-2.5 select-none"
            animate={stage === -1 ? { x: [0, -7, 7, -5, 5, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="sr-only" aria-live="polite">{stageText}</span>
            {/* Official logo — orbit ring rests here while idle */}
            <div className="relative w-10 h-8 flex items-center justify-center">
              <img src="/img/procureflow-logo-full.png" alt="ProcureFlow" className="h-6 w-auto object-contain" />
              {orbitAt === 'logo' && <OrbitRing size="w-9 h-9" />}
            </div>
            {/* Icon flow: lock → bolt → check (orbit travels as the user fills the form) */}
            {[
              { key: 'lock', label: 'Email', done: stage === -1 || stage >= 1, path: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', idle: 'text-cyan-600', active: 'bg-cyan-500 border-cyan-500 text-white shadow-[0_0_12px_rgba(34,211,238,0.7)]' },
              { key: 'bolt', label: 'Password', done: stage === -1 || stage >= 2, path: 'M13 10V3L4 14h7v7l9-11h-7z', idle: 'text-amber-500', active: 'bg-amber-500 border-amber-500 text-white shadow-[0_0_12px_rgba(245,158,11,0.7)]' },
              { key: 'check', label: 'Verified', done: ready || stage >= 3, error: stage === -1, path: stage === -1 ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7', idle: 'text-emerald-600', active: 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.7)]' },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-2.5">
                {i > 0 && (
                  <motion.span
                    className={`w-5 h-px rounded-full ${stage >= i + 1 || stage === 4 ? 'bg-gradient-to-r from-[#2084FA] to-[#7F3EDD]' : 'bg-slate-300'}`}
                    animate={stage >= i + 1 || stage === 4 ? { opacity: [0.5, 1, 0.5], scaleX: [0.7, 1, 0.7] } : { opacity: 0.5, scaleX: 0.7 }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}
                <motion.span
                  title={s.label}
                  className={`relative w-6 h-6 rounded-full border flex items-center justify-center shadow-sm ${s.error ? 'bg-rose-500 border-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.7)]' : s.done ? s.active : 'bg-slate-50 border-slate-200'}`}
                  animate={stage === 4 ? { scale: [0.9, 1.15, 0.9] } : s.done || s.error ? { scale: 1 } : { opacity: [0.45, 1, 0.45], scale: [0.92, 1.08, 0.92] }}
                  transition={stage === 4 ? { duration: 0.6, repeat: Infinity, delay: i * 0.2 } : { duration: 2.4, repeat: Infinity, delay: i * 0.8 }}
                >
                  {orbitAt === s.key && <OrbitRing />}
                  <svg className={`w-3.5 h-3.5 ${s.done || s.error ? '' : s.idle}`} fill="none" stroke="currentColor" strokeWidth={stage === -1 && s.key === 'check' ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d={s.path} />
                  </svg>
                </motion.span>
              </div>
            ))}
            {/* Status pill */}
            <span className={`hidden sm:inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider ${stage === -1 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              <motion.span
                className={`w-1.5 h-1.5 rounded-full ${stage === -1 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
              {stage === 3 ? 'IN' : stage === -1 ? 'RETRY' : stage === 4 ? '···' : 'LIVE'}
            </span>
          </motion.div>
        </header>

        {/* Main Page Grid Structure */}
        <motion.div 
          className="p-6 md:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch bg-white relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* P-icon watermark - centred on the white part */}
          <div className="absolute inset-y-0 left-0 w-full lg:w-[50%] flex items-center justify-center overflow-hidden pointer-events-none select-none" aria-hidden="true">
            <img src="/img/procureflow-p-icon.png" alt="" className="w-[640px] max-w-[115%] h-auto opacity-[0.62]" />
          </div>
          {/* Left Column (Form & Social Trust Badge) */}
          <section className="lg:col-span-6 flex flex-col justify-center relative z-10">
            <div className="max-w-md w-full mx-auto lg:mx-0 pt-2 pb-6">
              {/* Brand Logo Header - official lockup with floating animation */}
              <motion.div 
                className="flex items-center gap-3 mb-8"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <motion.img
                  src="/img/procureflow-logo-full.png"
                  alt="ProcureFlow — Smarter Procurement. Simplified."
                  className="h-14 w-auto object-contain"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>

              {/* Headline & Description */}
              <div className="mb-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-2.5">
                  Welcome back to<br />ProcureFlow
                </h1>
                <p className="text-sm leading-relaxed text-slate-500 font-normal">
                  Autonomous procurement & spend management for hospitality leaders across multi-property portfolios.
                </p>
              </div>

              {/* Sign In Form - with staggered animations */}
              <form action="#" className="space-y-4" onSubmit={handleSubmit}>
                {/* Email Input */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="work-email">
                    Work Email
                  </label>
                  <div className="relative rounded-xl">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <svg className="h-4 w-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    </div>
                    <input
                      className="w-full text-sm pl-10 pr-4 py-2.5 border border-slate-200 bg-white rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all font-medium"
                      id="work-email"
                      name="work-email"
                      placeholder="finance@hotelgroup.com"
                      required
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailBlurred(false); if (submitState !== 'idle' && submitState !== 'loading') { setSubmitState('idle'); setError(''); } }}
                      onBlur={() => setEmailBlurred(true)}
                    />
                  </div>
                </motion.div>

                {/* Password Input - with staggered animation */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="password">
                      Password
                    </label>
                    <a href="#forgot" className="text-xs font-medium text-cyan-600 hover:text-cyan-700 hover:underline transition-colors">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative rounded-xl">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    </div>
                    <input
                      className="w-full text-sm pl-10 pr-11 py-2.5 border border-slate-200 bg-white rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                      id="password"
                      name="password"
                      placeholder="••••••••••••"
                      required
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (submitState !== 'idle' && submitState !== 'loading') { setSubmitState('idle'); setError(''); } }}
                      onFocus={() => setPwFocused(true)}
                      onBlur={() => setPwFocused(false)}
                    />
                    {/* Show / Hide Password Icon */}
                    <button
                      aria-label="Toggle password visibility"
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                      </svg>
                    </button>
                  </div>
                </motion.div>

              {/* Remember Me - with staggered animation */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                >
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/20 focus:outline-none"
                      />
                      <span className="text-xs text-slate-600 font-medium select-none">Remember this device for 30 days</span>
                    </label>
                  </div>
                </motion.div>

                {/* Primary Action CTA Button - with animation */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.7 }}
                  className="pt-2"
                >
                  <RippleButton type="submit" disabled={loading}>
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.span
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2"
                        >
                          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeLinecap="round"></circle>
                            <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path>
                          </svg>
                          Signing in...
                        </motion.span>
                      ) : (
                        <motion.span
                          key="default"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2"
                        >
                          Sign into ProcureFlow
                          <motion.svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            animate={{ x: [0, 3, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                          </motion.svg>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </RippleButton>
                </motion.div>
              </form>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium" role="alert">
                  {error}
                </div>
              )}

              {/* Demo entry */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.8 }}
                className="mt-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">or</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <RippleButton
                  type="button"
                  variant="outline"
                  onClick={handleDemo}
                >
                  <svg className="w-4 h-4 text-[#7F3EDD]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Explore the live demo
                </RippleButton>
                <p className="text-center text-[11px] text-slate-400 mt-2">Instant access with a sample hotel group — no sign-in required.</p>
              </motion.div>

              {/* Alternative Auth Switch */}
              <div className="text-center mt-5">
                <p className="text-xs text-slate-500">
                  Need hospitality organizational access?{' '}
                  <a className="font-semibold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors" href="/signup">
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
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400"
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
                      <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">PO #48291 Auto-Approved</p>
                        <p className="text-[11px] text-slate-500">Grand Hyatt F&B Procurement</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">99.8% Match</span>
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
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
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

      {/* Glassmorphism CSS */}
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
      `}</style>

      {/* Zoho-style Perfect Loader — replaces the old dark takeover */}
      <AnimatePresence>
        {submitState === 'loading' && (
          <motion.div
            key="perfect-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[100]"
          >
            <div className="absolute inset-0 bg-[#F8F9FB] flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-b from-white to-[#F6F8FC] pointer-events-none" aria-hidden="true" />
              <div className="relative flex flex-col items-center">
                <motion.div
                  className="relative flex items-center justify-center"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                >
                  <svg width="88" height="88" viewBox="0 0 88 88" fill="none" className="absolute" aria-hidden="true">
                    <path d="M44 6 L78.5 26 L78.5 62 L44 82 L9.5 62 L9.5 26 Z" stroke="#E9EDF3" strokeWidth="2.2" fill="white" strokeLinejoin="round" />
                  </svg>
                  <motion.div className="absolute w-[88px] h-[88px]" animate={{ scale: [1, 1.025, 1], opacity: [0.95, 1, 0.95] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} aria-hidden="true">
                    <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
                      <path d="M44 6 L78.5 26 L78.5 62 L44 82 L9.5 62 L9.5 26 Z" stroke="#E9EDF3" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
                    </svg>
                  </motion.div>
                  <motion.div className="relative w-[38px] h-[38px] flex items-center justify-center" animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <defs>
                        <linearGradient id="pf-signin-grad" x1="6" y1="6" x2="30" y2="28" gradientUnits="userSpaceOnUse">
                          <stop stopColor="#2084FA" />
                          <stop offset="1" stopColor="#7F3EDD" />
                        </linearGradient>
                      </defs>
                      <path d="M11 28.5 V9.5 H20.2 C24.0 9.5 26.8 12.0 26.8 16.0 C26.8 20.2 23.9 22.6 19.1 22.6 H13.5" stroke="url(#pf-signin-grad)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </motion.div>
                </motion.div>
                <motion.p className="mt-[22px] text-[13px] leading-5 text-[#2E3440] font-normal text-center tracking-[-0.01em] max-w-[360px] px-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.45 }}>
                  Please wait while we make everything perfect for you...
                </motion.p>
                <motion.p className="mt-3 text-[10px] font-semibold tracking-[0.14em] text-[#9AA8C2] uppercase" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                  ProcureFlow
                </motion.p>
                <motion.div className="mt-4 flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <motion.span key={i} className="w-1 h-1 rounded-full bg-[#CBD5E1]" animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }} />
                  ))}
                </motion.div>
                <button onClick={() => { attemptRef.id++; setSubmitState('idle'); setLoading(false); }} className="mt-6 text-xs font-medium text-[#9AA8C2] hover:text-[#64748B] underline underline-offset-2">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {submitState === 'success' && (
          <motion.div
            key="perfect-success"
            className="fixed inset-0 z-[100] bg-[#F8F9FB] flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white to-[#F6F8FC] pointer-events-none" aria-hidden="true" />
            <div className="relative flex flex-col items-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <p className="mt-4 text-sm font-semibold text-slate-900">Signed in — welcome back</p>
              <p className="mt-1 text-xs text-slate-500 truncate max-w-[260px]">{email.trim()}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
