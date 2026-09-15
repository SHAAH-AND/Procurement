import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../components/ui/collapsible';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../components/ui/tooltip';

interface SidebarProps {
  active: string;
  setActive: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

interface NavChild {
  id: string;
  label: string;
}

interface NavEntry {
  id: string;
  label: string;
  icon: string;
  quickAdd?: 'nav' | 'new';
  children?: NavChild[];
}

const QUICK_PATHS: Record<string, string> = {
  items: '/workspace/items',
  vendors: '/workspace/vendors',
};

export function Sidebar({ active, setActive, collapsed, setCollapsed }: SidebarProps) {
  const navigate = useNavigate();

  const quickAdd = (id: string) => {
    if (id === 'requests') {
      setActive('requests');
      return;
    }
    const base = QUICK_PATHS[id];
    if (base) navigate(`${base}?new=1`);
  };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleExpand = (id: string) => {
    const opening = !expanded.has(id);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // Zoho accordion: Procurement ↓ below, Payables ↑ above — only one open so no scroll needed
        if (id === 'procurement' || id === 'payables') {
          next.delete('procurement');
          next.delete('payables');
        }
        next.add(id);
      }
      return next;
    });
    // Scroll animation: glide the newly expanded group into view (Zoho behavior)
    if (opening) {
      requestAnimationFrame(() => {
        rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  // Auto-minimize: leaving procurement/payables for Home/other tabs collapses expanded sections (like Zoho)
  useEffect(() => {
    const procurementChildren = new Set(['pr', 'rfq', 'po', 'receives']);
    const payablesChildren = new Set(['bills', 'payments', 'recurring', 'batch']);
    const isInProcurement = procurementChildren.has(active);
    const isInPayables = payablesChildren.has(active);
    const isParent = active === 'procurement' || active === 'payables';
    // If active is not inside any expandable group, collapse all
    if (!isInProcurement && !isInPayables && !isParent) {
      if (expanded.size > 0) setExpanded(new Set());
    }
  }, [active]);

  // Flat Zoho order: Home → My Requests (+) → Approvals → Items → Vendors → Procurement > → Payables > → Budgets → Analytics
  const navItems: NavEntry[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'requests', label: 'My Requests', icon: 'requests', quickAdd: 'nav' },
    { id: 'approvals', label: 'Approvals', icon: 'approvals' },
    { id: 'items', label: 'Items', icon: 'items', quickAdd: 'new' },
    { id: 'vendors', label: 'Vendors', icon: 'vendors', quickAdd: 'new' },
    {
      id: 'procurement',
      label: 'Procurement',
      icon: 'procurement',
      children: [
        { id: 'pr', label: 'Purchase Requests' },
        { id: 'rfq', label: 'Request for Quotes' },
        { id: 'po', label: 'Purchase Orders' },
        { id: 'receives', label: 'Goods Receipt Notes' },
      ],
    },
    {
      id: 'payables',
      label: 'Payables',
      icon: 'payables',
      children: [
        { id: 'bills', label: 'Bills' },
        { id: 'payments', label: 'Payments Made' },
        { id: 'recurring', label: 'Recurring Bills' },
        { id: 'batch', label: 'Batch Payments' },
      ],
    },
    { id: 'budgets', label: 'Budgets', icon: 'budgets' },
    { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  ];

  // Zoho grouping: [Home] [My Requests, Approvals] [Items, Vendors] [Procurement, Payables] [Budgets, Analytics]
  const groupStart = new Set(['requests', 'items', 'procurement', 'budgets']);
  const renderRow = (item: NavEntry) => {
    const isActive = active === item.id && !item.children;
    const isParentActive = item.children?.some(c => c.id === active);
    const iconSize = collapsed ? 22 : 15;
    const isExpandable = !!item.children;
    // Minimized Zoho: labels under icons, wrapped My Requests, truncated Procure..., triangle badge for expandables
    if (collapsed) {
      const displayLabel = item.label.includes(' ') ? item.label : (item.label.length > 8 ? `${item.label.slice(0, 7)}...` : item.label);
      const isMultiWord = item.label.includes(' ');
      const collapsedCls = `w-full flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-lg text-[11px] font-medium leading-none transition-colors relative
        ${isActive
          ? 'bg-[#3b82f6] text-white shadow-sm'
          : isParentActive
            ? 'bg-[#eef2ff] text-[#1e40af] border border-[#e0e7ff]'
            : 'text-[#334155] hover:bg-white hover:shadow-sm hover:border hover:border-slate-200 border border-transparent'}`;
      const collapsedInner = (
        <>
          <NavIcon name={item.icon} size={20} active={isActive || isParentActive} />
          <span className={`w-full text-center px-0.5 ${isMultiWord ? 'leading-[1.15] whitespace-normal break-words' : 'truncate leading-none tracking-tight'}`}>
            {displayLabel}
          </span>
          {isExpandable && (
            <span className="absolute bottom-1 right-1 w-2 h-2 pointer-events-none">
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" className="text-slate-400">
                <path d="M10 0 L10 10 L0 10 Z" fill="currentColor" />
              </svg>
            </span>
          )}
        </>
      );
      const btn = <button className={collapsedCls}>{collapsedInner}</button>;
      return (
        <div key={item.id}>
          <Tooltip>
            <TooltipTrigger asChild>{btn}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    const rowCls = `w-full group flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[13px] font-[500] tracking-[-0.01em] transition-colors duration-150 ease-out relative
      ${isActive
        ? 'bg-[#3b82f6] text-white shadow-sm'
        : isParentActive
          ? 'text-[#1e40af] bg-[#eef2ff]'
          : 'text-[#3a4a62] hover:bg-[#eef2f8] hover:text-[#1e293b] hover:shadow-[0_1px_2px_rgba(15,23,42,0.04)]'}${item.quickAdd && !collapsed ? ' pr-8' : ''}`;

    const inner = (
      <>
        {item.children && !collapsed ? (
          <span className={`w-3 flex items-center justify-center shrink-0 ${isParentActive ? 'text-[#1e40af]' : 'text-slate-600'}`}>
            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${expanded.has(item.id) ? 'rotate-90' : ''}`}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        ) : (
          <span className="w-3 shrink-0" aria-hidden="true" />
        )}
        <NavIcon name={item.icon} size={iconSize} active={isActive || isParentActive} />
        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
        {item.quickAdd && !collapsed && (
          <span
            onClick={(e) => { e.stopPropagation(); quickAdd(item.id); }}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-md flex items-center justify-center text-[14px] leading-none transition-opacity duration-150 ${isActive ? 'bg-white/25 text-white opacity-100' : 'bg-[#e0e7ff] text-slate-600 opacity-0 group-hover:opacity-100'}`}
          >
            +
          </span>
        )}
      </>
    );

    // Collapsed rail: icon buttons with tooltips (shadcn pattern)
    const btn = item.children ? (
      <button className={rowCls}>{inner}</button>
    ) : (
      <button onClick={() => setActive(item.id)} className={rowCls}>{inner}</button>
    );
    const tipped = collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    ) : btn;

    if (!item.children) {
      const wrapperCls = !collapsed && groupStart.has(item.id) ? 'mt-3' : '';
      return <div key={item.id} className={wrapperCls}>{tipped}</div>;
    }

    // Both Procurement and Payables expand BELOW — like Zoho screenshots
    // Payables row itself slides up (via scrollIntoView) when Procurement collapses, no drop-up
    const childrenBlock = !collapsed && (
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[collapsible-down_200ms_cubic-bezier(0.25,0.1,0.25,1)] data-[state=closed]:animate-[collapsible-up_200ms_cubic-bezier(0.25,0.1,0.25,1)]">
        <div className="ml-7 pl-3 border-l border-slate-200 space-y-[1px] mt-1 mb-1">
          {item.children.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-[7px] rounded-md text-[13px] transition-colors
                ${active === c.id
                  ? 'bg-[#3b82f6] text-white font-medium'
                  : 'text-slate-600 hover:bg-[#eef2ff]/60 hover:text-slate-900'}`}
            >
              <span className="truncate text-left">{c.label}</span>
              {active === c.id && (
                <span
                  onClick={(e) => { e.stopPropagation(); setActive(c.id); }}
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-white/20 text-white hover:bg-white/30"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                </span>
              )}
            </button>
          ))}
        </div>
      </CollapsibleContent>
    );

    return (
      <div
        key={item.id}
        className={!collapsed && groupStart.has(item.id) ? 'mt-3' : ''}
        ref={(el) => {
          rowRefs.current[item.id] = el;
        }}
      >
        <Collapsible open={expanded.has(item.id)} onOpenChange={() => toggleExpand(item.id)}>
          <CollapsibleTrigger asChild>{tipped}</CollapsibleTrigger>
          {childrenBlock}
        </Collapsible>
      </div>
    );
  };

  return (
    <aside className={`${collapsed ? 'w-[76px]' : 'w-[220px]'} flex-shrink-0 bg-[#f3f5fb] border-r border-[#e2e8f0] flex flex-col relative transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}>
      {/* Getting Started — above Home for quick visibility (Zoho pattern) */}
      {!collapsed && (
        <button onClick={() => setActive('home')} className="mx-3 mt-3 mb-2.5 rounded-xl bg-[#eef2ff] border border-[#e0e7ff] p-3 text-left hover:bg-[#e6edff] transition-colors shrink-0">
          <span className="w-full flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium text-[#1e293b]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>
              Getting Started
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-500"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span className="mt-3 block h-[6px] rounded-full bg-white border border-[#e0e7ff] overflow-hidden">
            <span className="block h-full w-[18%] rounded-full bg-[#3b82f6]" />
          </span>
        </button>
      )}
      <TooltipProvider delayDuration={150}>
        <nav className={`pf-sidebar-scroll flex-1 min-h-0 overflow-y-scroll overscroll-contain pb-8 ${collapsed ? 'px-1.5 py-1.5 space-y-1' : 'px-2 py-2 space-y-[2px]'}`} style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' as any }}>
          {navItems.map(renderRow)}
        </nav>
        {/* Zoho-style toggle — bigger, state-aware */}
        {collapsed ? (
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
        ) : (
          <div className="absolute bottom-5 -right-3.5 z-20">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCollapsed(true)}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-800 hover:border-slate-300 hover:shadow-xl transition-all"
                  aria-label="Collapse sidebar"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M17 8h3M17 12h3M17 16h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Collapse</TooltipContent>
            </Tooltip>
          </div>
        )}
      </TooltipProvider>
    </aside>
  );
}

// Standard sidebar icon set — one file per entry, all processed identically
// (128px, emboldened strokes, near-black ink, transparent bg), rendered at `size`.
const ICON_SRC: Record<string, string> = {
  home: '/img/icon-home.png',
  requests: '/img/icon-requests.png',
  approvals: '/img/icon-approvals.png',
  items: '/img/icon-items.png',
  vendors: '/img/icon-vendors.png',
  procurement: '/img/icon-procurement.png',
  payables: '/img/icon-payables.png',
  budgets: '/img/icon-budgets.png',
  analytics: '/img/icon-analytics.png',
};

function NavIcon({ name, size = 16, active = false }: { name: string; size?: number; active?: boolean }) {
  const src = ICON_SRC[name];
  if (src) {
    return <img src={src} alt={name} width={size} height={size} className={`flex-shrink-0 object-contain ${active ? 'brightness-0 invert' : 'opacity-[0.82]'}`} style={{ width: size, height: size, filter: active ? 'brightness(0) invert(1) drop-shadow(0 0.5px 0 rgba(15,23,42,0.08))' : 'drop-shadow(0 0.5px 0 rgba(15,23,42,0.04))' }} />;
  }
  const color = active ? 'white' : '#64748b';
  const icons: Record<string, React.ReactNode> = {
    home: <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      {icons[name] || icons.home}
    </svg>
  );
}
