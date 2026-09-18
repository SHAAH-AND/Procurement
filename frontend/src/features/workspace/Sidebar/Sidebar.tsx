import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TooltipProvider } from '../../../components/ui/tooltip';
import { GettingStarted } from './components/GettingStarted';
import { SidebarToggle } from './components/SidebarToggle';
import { NavItem } from './components/NavItem';
import { NAV_ITEMS, PROCUREMENT_CHILDREN, PAYABLES_CHILDREN } from './data/navItems';
import { NAV_MODULE_MAP } from '../../access/catalog';
import { QUICK_PATHS } from './data/quickPaths';
import { useWebTabs } from '../../settings/bind';
import { useAccess, canDo } from '../../access/resolver';
import { useCustomModules } from '../../settings/pages/CustomModules';

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
  // Custom web tabs from Settings → Customization → Web Tabs
  const webTabs = useWebTabs();
  // Access gating (Zoho parity): hide modules the user cannot view.
  const access = useAccess();
  const customModules = useCustomModules();

  const visibleItems = NAV_ITEMS.map((item) => {
    if (access.loading || access.full) return item;
    if (!item.children) {
      const mod = NAV_MODULE_MAP[item.id];
      if (mod && !canDo(access, mod, 'view')) return null;
      return item;
    }
    const children = item.children.filter((c) => {
      const mod = NAV_MODULE_MAP[c.id];
      return !mod || canDo(access, mod, 'view');
    });
    if (!children.length) return null;
    return { ...item, children };
  }).filter(Boolean) as typeof NAV_ITEMS;

  const quickAdd = (id: string) => {
    if (id === 'requests') {
      setActive('requests');
      return;
    }
    const base = QUICK_PATHS[id];
    if (base) navigate(`${base}?new=1`);
    else setActive(id);
  };

  const toggleExpand = (id: string) => {    const opening = !expanded.has(id);
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
          {visibleItems.map((item) => {
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
          {/* Custom modules (Settings → Custom Modules) — gated by custom:<id>:view */}
          {!access.loading && customModules.filter((m) => access.full || canDo(access, `custom:${m.id}`, 'view') || canDo(access, m.id, 'view')).length > 0 && (
            <div className={collapsed ? 'pt-2' : 'pt-2'}>
              {!collapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom</div>
              )}
              {customModules
                .filter((m) => access.full || canDo(access, `custom:${m.id}`, 'view') || canDo(access, m.id, 'view'))
                .map((m) => {
                  const tab = `custom/${m.id}`;
                  const isActive = active === tab;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setActive(tab)}
                      title={m.name}
                      className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] transition-colors ${collapsed ? 'justify-center px-1.5 py-2' : 'px-3 py-2'} ${isActive ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className={`${isActive ? 'text-[#2084FA]' : 'text-slate-400'} shrink-0`}><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /></svg>
                      {!collapsed && <span className="truncate">{m.name}</span>}
                    </button>
                  );
                })}
            </div>
          )}
          {/* Custom web tabs (Settings → Customization → Web Tabs) */}
          {webTabs.length > 0 && (
            <div className={collapsed ? 'pt-2' : 'pt-2'}>
              {!collapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Web Tabs</div>
              )}
              {webTabs.map((t) => (
                <a
                  key={`${t.label}${t.url}`}
                  href={t.url.startsWith('http') ? t.url : `https://${t.url}`}
                  target="_blank"
                  rel="noreferrer"
                  title={t.label}
                  className={`flex items-center gap-2.5 rounded-lg text-[13px] text-slate-600 hover:bg-white hover:text-slate-900 transition-colors ${collapsed ? 'justify-center px-1.5 py-2' : 'px-3 py-2'}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-slate-400 shrink-0"><path d="M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></svg>
                  {!collapsed && <span className="truncate">{t.label}</span>}
                </a>
              ))}
            </div>
          )}
        </nav>

        {/* Zoho-style toggle — bigger, state-aware */}
        <SidebarToggle collapsed={collapsed} setCollapsed={setCollapsed} />
      </TooltipProvider>
    </aside>
  );
}