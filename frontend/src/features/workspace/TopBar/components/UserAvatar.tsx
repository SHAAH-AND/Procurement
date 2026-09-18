import { useState } from 'react';
import { useAuth } from '../../../auth/AuthContext';

interface UserAvatarProps {
  user: { name?: string; email?: string; orgName?: string } | null;
  onCloseAll: () => void;
}

export function UserAvatar({ user, onCloseAll }: UserAvatarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const { user: session, logout } = useAuth();
  const email = user?.email || session?.email || '';
  const displayName = user?.name || session?.name || email.split('@')[0] || 'U';
  const initials = displayName[0]?.toUpperCase() || 'U';

  return (
    <div className="relative">
      <button
        onClick={() => { setProfileOpen(!profileOpen); onCloseAll(); }}
        className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/20 hover:border-white/40 transition-colors ml-2"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="w-full h-full text-white/75"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {profileOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'linear-gradient(135deg, #2DC5FB 0%, #2084FA 50%, #7F3EDD 100%)' }}>{initials}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate text-[#0F172A]">{displayName}</div>
              <div className="text-xs text-slate-500 truncate">{email}</div>
            </div>
          </div>
          <button className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            My Profile
          </button>
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button onClick={logout} className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2.5 text-rose-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}