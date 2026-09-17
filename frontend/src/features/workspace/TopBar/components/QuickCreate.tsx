import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUICK_CREATE } from '../constants';

export function QuickCreate() {
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const navigate = useNavigate();

  const closeAll = () => {
    setQuickCreateOpen(false);
  };

  return (
    <div className="relative mr-1">
      <button
        onClick={() => setQuickCreateOpen((v) => !v)}
        className="w-9 h-9 rounded-lg bg-[#2084FA] hover:bg-[#1a6fd6] flex items-center justify-center text-white shadow-sm transition-colors"
        title="Quick Create"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" /></svg>
      </button>
      {quickCreateOpen && (
        <div className="absolute top-full right-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
          <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Create New</div>
          {QUICK_CREATE.map((item) => (
            <button
              key={item.label}
              onClick={() => { closeAll(); navigate(item.path); }}
              className="w-full text-left px-3.5 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
            >
              <span className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#2084FA] shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}