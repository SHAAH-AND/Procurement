import { Tooltip, TooltipTrigger, TooltipContent } from '../../../../components/ui/tooltip';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../../../components/ui/collapsible';
import { NavIcon } from './NavIcon';
import { NAV_ITEMS, GROUP_START } from '../data/navItems';
import { QUICK_PATHS } from '../data/quickPaths';

interface NavItemProps {
  item: typeof NAV_ITEMS[0];
  active: string;
  isActive: boolean;
  isParentActive: boolean;
  collapsed: boolean;
  expanded: Set<string>;
  quickAdd: (id: string) => void;
  setActive: (tab: string) => void;
  toggleExpand: (id: string) => void;
  rowRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
}

export function NavItem({ item, active, isActive, isParentActive, collapsed, expanded, quickAdd, setActive, toggleExpand, rowRefs }: NavItemProps) {
  const iconSize = collapsed ? 22 : 15;
  const isExpandable = !!item.children;
  const isGroupStart = GROUP_START.has(item.id);

  if (collapsed) {
    const displayLabel = item.label.includes(' ') ? item.label : (item.label.length > 8 ? `${item.label.slice(0, 7)}...` : item.label);
    const isMultiWord = item.label.includes(' ');
    const collapsedCls = `w-full flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-lg text-[11px] font-medium leading-none transition-colors relative
      ${isActive
        ? 'bg-[#2084FA] text-white shadow-sm'
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
      ? 'bg-[#2084FA] text-white shadow-sm'
      : isParentActive
        ? 'text-[#1e40af] bg-[#eef2ff]'
        : 'text-[#3a4a62] hover:bg-[#eef2f8] hover:text-[#1e293b] hover:shadow-[0_1px_2px_rgba(15,23,42,0.04)]'}${item.quickAdd && !collapsed ? ' pr-8' : ''}`;

  const inner = (
    <>
      {isExpandable && (
        <span className={`w-3 flex items-center justify-center shrink-0 ${isParentActive ? 'text-[#1e40af]' : 'text-slate-600'}`}>
          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" className={`transition-transform duration-200 ${expanded.has(item.id) ? 'rotate-90' : ''}`}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}
      {!isExpandable && <span className="w-3 flex-shrink-0" />}
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
    const wrapperCls = !collapsed && isGroupStart ? 'mt-3' : '';
    return <div key={item.id} className={wrapperCls}>{tipped}</div>;
  }

  // Both Procurement and Payables expand BELOW — like Zoho screenshots
  // Payables row itself slides up (via scrollIntoView) when Procurement collapses, no drop-up
  const childrenBlock = !collapsed && (
    <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[collapsible-down_200ms_cubic-bezier(0.25,0.1,0.25,1)] data-[state=closed]:animate-[collapsible-up_200ms_cubic-bezier(0.25,0.1,0.25,1)]">
      <div className="ml-7 pl-3 border-l border-slate-200 space-y-[1px] mt-1 mb-1">
        {item.children!.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-[7px] rounded-md text-[13px] transition-colors
              ${active === c.id
                ? 'bg-[#2084FA] text-white font-medium shadow-sm'
                : 'text-slate-600 hover:bg-[#eef2ff]/60 hover:text-slate-900'}`}
          >
            <span className="flex-1 min-w-0 truncate text-left">{c.label}</span>
            {active === c.id && (
              <span
                onClick={(e) => { e.stopPropagation(); quickAdd(c.id); }}
                title={QUICK_PATHS[c.id] ? `New ${c.label}` : c.label}
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
      className={!collapsed && isGroupStart ? 'mt-3' : ''}
      ref={(el) => { rowRefs.current[item.id] = el; }}
    >
      <Collapsible open={expanded.has(item.id)} onOpenChange={() => toggleExpand(item.id)}>
        <CollapsibleTrigger asChild>{tipped}</CollapsibleTrigger>
        {childrenBlock}
      </Collapsible>
    </div>
  );
}