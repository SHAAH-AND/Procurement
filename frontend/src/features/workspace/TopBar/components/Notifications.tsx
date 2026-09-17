import { useState } from 'react';

interface NotificationsProps {
  onCloseAll: () => void;
}

export function Notifications({ onCloseAll }: NotificationsProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="relative hidden sm:block mx-1.5">
      <button
        onClick={() => { setNotifOpen(!notifOpen); onCloseAll(); }}
        className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/75 hover:text-white transition-colors relative"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {notifOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#0F172A]">Notifications</span>
            <span className="text-xs font-medium text-[#2084FA] cursor-pointer hover:underline">Mark all read</span>
          </div>
          <div className="px-4 py-10 text-center text-[13px] text-slate-400">No new notifications</div>
        </div>
      )}
    </div>
  );
}