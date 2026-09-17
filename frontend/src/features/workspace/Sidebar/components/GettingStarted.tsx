interface GettingStartedProps {
  onClick: () => void;
  collapsed: boolean;
}

export function GettingStarted({ onClick, collapsed }: GettingStartedProps) {
  if (collapsed) return null;
  return (
    <button onClick={onClick} className="mx-3 mt-3 mb-2.5 rounded-xl bg-[#eef2ff] border border-[#e0e7ff] p-3 text-left hover:bg-[#e6edff] transition-colors shrink-0">
      <span className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-medium text-[#1e293b]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
          Getting Started
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-500"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </span>
      <span className="mt-3 block h-[6px] rounded-full bg-white border border-[#e0e7ff] overflow-hidden">
        <span className="block h-full w-[18%] rounded-full bg-[#2084FA]" />
      </span>
    </button>
  );
}