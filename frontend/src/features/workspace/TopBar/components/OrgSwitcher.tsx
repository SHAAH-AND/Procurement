import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface OrgSwitcherProps {
  orgName: string;
}

export function OrgSwitcher({ orgName }: OrgSwitcherProps) {
  const navigate = useNavigate();
  const [orgOpen, setOrgOpen] = useState(false);

  return (
    <div className="relative hidden md:block">
      <button
        onClick={() => setOrgOpen((v) => !v)}
        className="flex items-center gap-2 h-8 px-2 rounded-lg hover:bg-white/10 text-[13px] font-medium text-white/90 transition-colors max-w-[180px]"
      >
        <span className="truncate">{orgName}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`text-white/50 transition-transform duration-200 ${orgOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {orgOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Organization</div>
            <div className="text-[13px] font-semibold mt-1 text-[#0F172A]">{orgName}</div>
          </div>
          <button
            onClick={() => { setOrgOpen(false); navigate('/workspace/settings/profile'); }}
            className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#2084FA" strokeWidth="1.5" /><path d="M12 16v-4M12 8h.01" stroke="#2084FA" strokeWidth="2" strokeLinecap="round" /></svg>
            Organization Settings
          </button>
        </div>
      )}
    </div>
  );
}