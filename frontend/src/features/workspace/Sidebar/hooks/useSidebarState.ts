import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUICK_PATHS } from '../data/quickPaths';
import { PROCUREMENT_CHILDREN, PAYABLES_CHILDREN } from '../data/navItems';

interface UseSidebarStateProps {
  active: string;
  setActive: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export function useSidebarState({ active, setActive }: UseSidebarStateProps) {
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

  return {
    expanded,
    setExpanded,
    rowRefs,
    quickAdd,
    toggleExpand,
  };
}