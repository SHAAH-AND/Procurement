import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TooltipProvider } from '../../../components/ui/tooltip';
import { GettingStarted } from './components/GettingStarted';
import { SidebarToggle } from './components/SidebarToggle';
import { NavItem } from './components/NavItem';
import { NAV_ITEMS, PROCUREMENT_CHILDREN, PAYABLES_CHILDREN } from './data/navItems';
import { QUICK_PATHS } from './data/quickPaths';

interface SidebarProps {
  active: string;
  setActive: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function Sidebar({ active, setActive, collapsed, setCollapsed }: SidebarProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const quickAdd = (id: string) => {
    if (id === 'requests') {
      setActive('requests');
      return;
    }
    const base = QUICK_PATHS[id];
    if (base) navigate(`${base}?new=1`);
    else setActive(id);
  };

  const toggleExpand = (id: string) => {
    const opening = !expanded.has(id);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (id === 'procurement' || id === 'payables') {
          next.delete('procurement');
          next.delete('payables');
        }
        next.add(id);
      }
      return next;
    });
    if (opening) {
      requestAnimationFrame(() => {
        rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  // Auto-minimize: leaving procurement/payables for Home/other tabs collapses expanded sections (like Zoho)
  useEffect(() => {
    const isInProcurement = PROCUREMENT_CHILDREN.has(active);
    const isInPayables = PAYABLES_CHILDREN.has(active);
    const isParent = active === 'procurement' || active === 'payables';
    if (!isInProcurement && !isInPayables && !isParent) {
      if (expanded.size > 0) setExpanded(new Set());
    }
  }, [active]);

  return (
    <aside className={`${collapsed ? 'w-[76px]' : 'w-[240px]'} flex-shrink-0 bg-[#f3f5fb] border-r border-[#e2e8f0] flex flex-col relative transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}>
      {/* Getting Started — above Home for quick visibility (Zoho pattern) */}
      <GettingStarted onClick={() => setActive('home')} collapsed={collapsed} />

      <TooltipProvider delayDuration={150}>
        <nav className={`pf-sidebar-scroll flex-1 min-h-0 overflow-y-scroll overscroll-contain pb-8 ${collapsed ? 'px-1.5 py-1.5 space-y-1' : 'px-2 py-2 space-y-[2px]'}`} style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' as any }}>
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.id && !item.children;
            const isParentActive = item.children?.some(c => c.id === active) ?? false;
            return (
              <NavItem
                key={item.id}
                item={item}
                active={active}
                isActive={isActive}
                isParentActive={isParentActive}
                collapsed={collapsed}
                expanded={expanded}
                quickAdd={quickAdd}
                setActive={setActive}
                toggleExpand={toggleExpand}
                rowRefs={rowRefs}
              />
            );
          })}
        </nav>

        {/* Zoho-style toggle — bigger, state-aware */}
        <SidebarToggle collapsed={collapsed} setCollapsed={setCollapsed} />
      </TooltipProvider>
    </aside>
  );
}