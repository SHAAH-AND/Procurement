import { Tooltip, TooltipTrigger, TooltipContent } from '../../../../components/ui/tooltip';

interface SidebarToggleProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function SidebarToggle({ collapsed, setCollapsed }: SidebarToggleProps) {
  if (collapsed) {
    return (
      <div className="mx-1.5 mb-1.5 h-[38px] rounded-lg bg-[#eef2ff] border border-[#e0e7ff] flex items-center justify-center shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsed(false)}
              className="w-full h-full flex items-center justify-center text-slate-600 hover:text-slate-800 transition-colors"
              aria-label="Expand sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 8h3M14 12h3M14 16h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
              </svg>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand</TooltipContent>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="absolute bottom-5 -right-3.5 z-20">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setCollapsed(true)}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-800 hover:border-slate-300 hover:shadow-xl transition-all"
            aria-label="Collapse sidebar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 8h3M17 12h3M17 16h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Collapse</TooltipContent>
      </Tooltip>
    </div>
  );
}