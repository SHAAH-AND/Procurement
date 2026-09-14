import { motion } from 'framer-motion';

interface PerfectLoaderProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

/**
 * ProcureFlow Native Loader — premium, distinct from Zoho
 * Light canvas with subtle pattern, floating speedy P, gradient shimmer bar
 */
export default function PerfectLoader({
  message = 'Please wait while we make everything perfect for you...',
  fullScreen = true,
  className = '',
}: PerfectLoaderProps) {
  return (
    <div
      className={`${fullScreen ? 'fixed inset-0 z-[100]' : 'relative'} flex flex-col items-center justify-center bg-[#F8F9FB] overflow-hidden ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* Subtle ProcureFlow pattern — very faint, brand-native */}
      <div className="absolute inset-0 pf-pattern-bg pointer-events-none" style={{ opacity: 0.06 }} aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#F8FAFF]/60 to-[#EEF2FF]/40 pointer-events-none" aria-hidden="true" />

      {/* Soft glow behind logo — brand gradient aura */}
      <motion.div
        className="absolute w-[280px] h-[280px] rounded-full blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(32,132,250,0.12) 0%, rgba(127,61,221,0.08) 45%, transparent 70%)' }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col items-center px-6">
        {/* Logo — floating speedy P */}
        <motion.div
          className="relative"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* White card behind P — soft shadow like SignIn */}
          <div className="w-[84px] h-[84px] rounded-[22px] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08),0_1px_0_rgba(15,23,42,0.06)] border border-slate-100 flex items-center justify-center">
            <img
              src="/img/procureflow-p-icon.png"
              alt="ProcureFlow"
              className="w-[56px] h-[56px] object-contain"
              draggable={false}
            />
          </div>
          {/* Tiny orbiting ring — ProcureFlow style, not Zoho */}
          <motion.span
            className="absolute -inset-[6px] rounded-[26px] border-2 border-transparent border-t-[#2084FA]/30 border-r-[#7F3EDD]/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
            aria-hidden="true"
          />
        </motion.div>

        {/* Shimmer bar — ProcureFlow gradient, premium */}
        <div className="mt-8 w-[180px] h-[3px] rounded-full bg-slate-200/70 overflow-hidden">
          <motion.div
            className="h-full w-[64px] rounded-full"
            style={{ background: 'linear-gradient(90deg, #2084FA 0%, #7F3EDD 100%)' }}
            animate={{ x: [-64, 180] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Message */}
        <motion.p
          className="mt-5 text-[13.5px] leading-5 text-[#1E293B] font-medium text-center tracking-[-0.01em] max-w-[360px]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {message}
        </motion.p>

        <motion.p
          className="mt-2 text-[11px] font-semibold tracking-[0.14em] text-[#94A3B8] uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          ProcureFlow — Smarter Procurement. Simplified.
        </motion.p>
      </div>

      {/* Bottom tiny — hospitality hint, not Zoho */}
      <motion.div
        className="absolute bottom-6 text-[11px] text-[#94A3B8] tracking-wide"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Securing your workspace…
      </motion.div>
    </div>
  );
}

export { PerfectLoader };
