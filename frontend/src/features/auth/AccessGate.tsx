import { motion } from 'framer-motion';
import { useAuth } from './AuthContext';
import { RippleButton } from '../../components/ui/RippleButton';

// The screens between "signed in" and "in the workspace". Each says which of
// the very different things went wrong, and what the person can do about it.

function Shell({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#E7EDF9] flex items-center justify-center p-4 sm:p-8 antialiased text-slate-800 relative">
      <div className="absolute inset-0 pf-pattern-bg pointer-events-none select-none" aria-hidden="true" style={{ opacity: 0.22 }} />
      <motion.main
        className="w-full max-w-lg bg-white rounded-[28px] shadow-[0_25px_65px_-12px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.05)] relative z-10 p-8 sm:p-10 text-center"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      >
        <img src="/app/img/procureflow-logo-full.png" alt="ProcureFlow" className="h-10 w-auto object-contain mx-auto mb-6" />
        <div className="text-4xl mb-3" aria-hidden="true">{icon}</div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <div className="text-sm text-slate-500 mt-3 leading-relaxed">{children}</div>
      </motion.main>
    </div>
  );
}

export function AccessGate() {
  const { state, error, identity, logout, refresh } = useAuth();

  if (state === 'not-member') {
    return (
      <Shell icon="🔒" title="This account has not been invited">
        <p>
          <strong className="text-slate-700">{identity?.email}</strong> is a valid Zoho Account, but it has not been
          added to this Procurement workspace. Ask an administrator to add you in <em>Settings → Users</em>.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <RippleButton type="button" variant="outline" onClick={() => refresh()}>Check again</RippleButton>
          <RippleButton type="button" onClick={logout}>Use a different Zoho Account</RippleButton>
        </div>
      </Shell>
    );
  }
  if (state === 'inactive') {
    return (
      <Shell icon="⛔" title="Access deactivated">
        <p>{error || 'Your account has been deactivated.'} Contact your Procurement administrator to restore access.</p>
        <div className="mt-6"><RippleButton type="button" onClick={logout}>Sign out</RippleButton></div>
      </Shell>
    );
  }
  if (state === 'backend-down') {
    return (
      <Shell icon="📡" title="Can't reach ProcureFlow">
        <p>{error}</p>
        <div className="mt-6"><RippleButton type="button" onClick={() => refresh()}>Try again</RippleButton></div>
      </Shell>
    );
  }
  if (state === 'sdk-failed') {
    return (
      <Shell icon="⚠️" title="Sign-in service unavailable">
        <p>{error}</p>
        <div className="mt-6"><RippleButton type="button" onClick={() => window.location.reload()}>Reload</RippleButton></div>
      </Shell>
    );
  }
  return (
    <Shell icon="⚠️" title="Something went wrong starting up">
      <p>{error || 'Unexpected error while loading your workspace.'}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <RippleButton type="button" variant="outline" onClick={() => refresh()}>Try again</RippleButton>
        <RippleButton type="button" onClick={logout}>Sign out</RippleButton>
      </div>
    </Shell>
  );
}
