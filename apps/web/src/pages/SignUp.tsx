import { useState } from 'react';
import { motion } from 'framer-motion';
import SlideDownNotice from '../components/SlideDownNotice';
import { RippleButton } from '../components/ui/RippleButton';

export default function SignUpPage() {
  const [loading, setLoading] = useState(false);

  const handleRequestApproval = () => {
    setLoading(true);
    // Open email client to request approval
    const adminEmail = 'admin@procureflow.io';
    const subject = encodeURIComponent('Request ProcureFlow Access');
    const body = encodeURIComponent(
      `Hi Admin,\n\nI would like to request access to ProcureFlow.\n\nPlease approve my request.\n\nThank you.`
    );
    window.location.href = `mailto:${adminEmail}?subject=${subject}&body=${body}`;
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#E7EDF9] flex items-center justify-center p-3 sm:p-6 lg:p-10 antialiased text-slate-800">
      {/* Main Browser / Card Wrapper Window */}
      <main className="w-full max-w-6xl bg-white rounded-[32px] shadow-[0_25px_65px_-12px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.05)] overflow-hidden flex flex-col transition-all duration-300 relative">
        {/* Browser Top Window Bar */}
        <header className="w-full h-11 bg-white border-b border-slate-100 flex items-center px-5 gap-2 select-none">
          {/* Mac Window Controls */}
          <div aria-hidden="true" className="flex items-center gap-2 mr-3">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] inline-block cursor-pointer"></span>
            <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24] inline-block cursor-pointer"></span>
            <span className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29] inline-block cursor-pointer"></span>
          </div>
          
          <div aria-hidden="true" className="flex-1" />
        </header>

        <SlideDownNotice />

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
          {/* Left Column (Approval Request) */}
          <section className="lg:col-span-6 flex flex-col justify-center relative z-10">
            <div className="max-w-md w-full mx-auto lg:mx-0 pt-2 pb-6">
              {/* Brand Logo Header - official lockup */}
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
                  Request Access to<br />ProcureFlow
                </h1>
                <p className="text-sm leading-relaxed text-slate-500 font-normal">
                  This system is invitation-only. Please contact the administrator to request access.
                </p>
              </div>

              {/* Request Approval Button */}
              <div className="pt-2">
                <RippleButton
                  onClick={handleRequestApproval}
                  disabled={loading}
                  type="button"
                >
                  <span>Request Approval from Admin</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                  </svg>
                </RippleButton>
              </div>

              {/* Alternative Link */}
              <div className="text-center mt-5">
                <p className="text-xs text-slate-500">
                  Already have an account?{' '}
                  <a className="font-semibold text-cyan-600 hover:text-cyan-700 hover:underline transition-colors" href="/signin">
                    Sign In
                  </a>
                </p>
              </div>
            </div>
          </section>

          {/* Right Column (Visual Feature Showcase Card) */}
          <section className="lg:col-span-6">
            <div className="relative w-full h-full min-h-[560px] rounded-[28px] overflow-hidden bg-gradient-to-br from-[#2084FA] to-[#7F3EDD] p-7 sm:p-9 flex flex-col justify-between shadow-inner text-white">
              {/* Subtle Atmospheric Background Glows */}
              <div aria-hidden="true" className="absolute -top-24 -right-24 w-80 h-80 bg-white/20 rounded-full blur-3xl pointer-events-none"></div>
              <div aria-hidden="true" className="absolute -bottom-20 -left-20 w-72 h-72 bg-slate-900/30 rounded-full blur-2xl pointer-events-none"></div>

              {/* Feature Header Caption */}
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 backdrop-blur-md mb-3 text-[11px] font-semibold uppercase tracking-wider text-cyan-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Invitation-Only Access
                </div>
                <h2 className="text-white text-2xl sm:text-3xl font-bold tracking-tight leading-snug max-w-sm">
                  Secure, controlled access for authorized users only.
                </h2>
              </div>

              {/* Center Info Card */}
              <div className="relative z-10 my-4 flex flex-col gap-3 max-w-sm w-full mx-auto">
                {/* Info Card */}
                <div className="bg-white/95 rounded-2xl p-4 text-slate-800 shadow-2xl backdrop-blur-md border border-white/40 transform transition-transform hover:scale-[1.02] duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">Admin Approval Required</p>
                        <p className="text-[11px] text-slate-500">Contact admin@procureflow.io</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mini Sub-Card */}
                <div className="bg-white/20 border border-white/30 rounded-2xl p-3.5 backdrop-blur-md text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
                    <span className="text-xs font-semibold tracking-wide">Enterprise Security</span>
                  </div>
                  <span className="text-xs font-mono font-medium text-cyan-200">Invite-Only</span>
                </div>
              </div>

              {/* Bottom Glassmorphism Control Widget */}
              <div className="relative z-10 glass-dock rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center">
                    <div className="inline-flex items-center glass-toggle rounded-full px-3 py-1 shadow-inner gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-xs font-semibold tracking-wide text-white">Secure Access</span>
                    </div>
                  </div>
                </div>
                <p className="text-[12px] text-white/90 font-normal leading-relaxed">
                  Only authorized users with admin approval can access ProcureFlow.
                </p>
              </div>
            </div>
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
    </div>
  );
}
