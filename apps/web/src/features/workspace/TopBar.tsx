import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  user: { name?: string; email?: string; orgName?: string } | null;
}

const SEARCH_MODULES = [
  { id: 'dashboard', label: 'Dashboard', path: '/workspace' },
  { id: 'my-requests', label: 'My Requests', path: '/workspace/requests' },
  { id: 'approvals', label: 'Approvals', path: '/workspace/approvals' },
  { id: 'items', label: 'Items', path: '/workspace/items' },
  { id: 'vendors', label: 'Vendors', path: '/workspace/vendors' },
  { id: 'pr', label: 'Purchase Requests', path: '/workspace/pr' },
  { id: 'rfq', label: 'Request for Quotes', path: '/workspace/rfq' },
  { id: 'po', label: 'Purchase Orders', path: '/workspace/po' },
  { id: 'receives', label: 'Goods Receipt Notes', path: '/workspace/receives' },
  { id: 'bills', label: 'Bills', path: '/workspace/bills' },
  { id: 'payments', label: 'Payments Made', path: '/workspace/payments' },
  { id: 'recurring', label: 'Recurring Bills', path: '/workspace/recurring' },
  { id: 'batch', label: 'Batch Payments', path: '/workspace/batch' },
  { id: 'budgets', label: 'Budgets', path: '/workspace/budgets' },
  { id: 'analytics', label: 'Analytics', path: '/workspace/analytics' },
];

const QUICK_CREATE = [
  { label: 'Purchase Request', path: '/workspace/pr' },
  { label: 'Request for Quote', path: '/workspace/rfq' },
  { label: 'Purchase Order', path: '/workspace/po' },
  { label: 'Goods Receipt', path: '/workspace/receives' },
  { label: 'Bill', path: '/workspace/bills' },
  { label: 'Vendor', path: '/workspace/vendors' },
  { label: 'Item', path: '/workspace/items' },
];

export function TopBar({ user }: TopBarProps) {
  const navigate = useNavigate();
  const [orgOpen, setOrgOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [searchModule, setSearchModule] = useState(SEARCH_MODULES[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Keep selected module in sync with current route (so dropdown reflects active page)
  useEffect(() => {
    const path = window.location.pathname;
    const match = SEARCH_MODULES.find(m => path.startsWith(m.path) && m.path !== '/workspace') || (path === '/workspace' ? SEARCH_MODULES[0] : null);
    if (match) setSearchModule(match);
  }, [searchOpen]);

  const displayName = user?.name || user?.email?.split('@')[0] || 'U';
  const initials = displayName[0]?.toUpperCase() || 'U';
  const orgName = user?.orgName || 'Demo Cloud Partner';

  const closeAll = () => {
    setOrgOpen(false);
    setProfileOpen(false);
    setNotifOpen(false);
    setQuickCreateOpen(false);
    setSearchOpen(false);
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    if (searchOpen) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchOpen]);

  // Keyboard shortcut "/" to focus search (Zoho pattern: / )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        document.getElementById('pf-global-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`${searchModule.path}?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    } else {
      navigate(searchModule.path);
    }
    setSearchOpen(false);
  };

  return (
    <header className="h-12 bg-[#0F172A] text-white flex items-center px-3 gap-2 z-50 relative shrink-0 select-none border-b border-white/10 shadow-[0_2px_12px_rgba(2,6,23,0.45)]">
      {/* Left: brand + Procurement */}
      <div
        className="flex items-center gap-2.5 shrink-0 cursor-pointer"
        onClick={() => { closeAll(); navigate('/workspace'); }}
      >
        {/* P mark — use real asset for brand accuracy */}
        <img src="/img/procureflow-logo.png" alt="ProcureFlow" className="h-7 w-7 object-contain rounded-md" />
        <span className="font-semibold text-[15px] tracking-tight hidden sm:inline">Procurement</span>
      </div>

      {/* Vertical divider + refresh */}
      <div className="hidden sm:flex items-center gap-1.5 ml-1">
        <span className="w-px h-6 bg-white/15 mx-1" aria-hidden="true" />
        <button
          onClick={() => window.location.reload()}
          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          title="Refresh"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 11-2.64-6.36M21 3v5h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* Zoho-style search: magnifier + module pill + input */}
      <div ref={searchRef} className="relative flex items-center ml-2 sm:ml-3 flex-1 max-w-[420px] sm:max-w-[460px]">
        <form onSubmit={onSearchSubmit} className="flex items-center w-full h-9 rounded-lg bg-[#1E293B] border border-white/12 hover:border-white/20 hover:bg-[#232F47] focus-within:border-[#3B82F6]/60 focus-within:ring-2 focus-within:ring-[#3B82F6]/20 transition-all duration-150 overflow-hidden">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex items-center gap-1 pl-3 pr-2 h-full hover:bg-white/5 transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white/70"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-white/50"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="w-px h-5 bg-white/15 shrink-0" />
          <input
            id="pf-global-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder={`Search in ${searchModule.label} ( / )`}
            className="flex-1 h-full bg-transparent px-3 text-[13px] placeholder:text-white/40 focus:outline-none text-white"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="pr-3 text-white/40 hover:text-white/80">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          )}
        </form>

        {/* Dropdown — Zoho motion: blue pill follows hover with smooth transition */}
        {searchOpen && (
          <div className="absolute top-full left-0 mt-2 w-[360px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 text-slate-800">
            <div className="max-h-[380px] overflow-y-auto py-1.5" onMouseLeave={() => setHoveredModule(null)}>
              {SEARCH_MODULES.map((m) => {
                const isHovered = hoveredModule === m.id;
                const isSelected = searchModule.id === m.id;
                const isActive = isHovered || (isSelected && !hoveredModule);
                return (
                  <button
                    key={m.id}
                    onMouseEnter={() => setHoveredModule(m.id)}
                    onClick={() => {
                      setSearchModule(m);
                      setSearchOpen(false);
                      if (searchQuery.trim()) navigate(`${m.path}?q=${encodeURIComponent(searchQuery.trim())}`);
                      else navigate(m.path);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center justify-between mx-1.5 rounded-lg transition-all duration-150 ease-out ${isActive ? 'bg-[#3B82F6] text-white shadow-sm' : isSelected ? 'bg-[#EEF2FF] text-[#1E40AF]' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <span className="font-medium">{m.label}</span>
                    {isSelected && !isActive && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#3B82F6]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </button>
                );
              })}
              <div className="border-t border-slate-100 mt-1.5 pt-1.5 mx-1.5 space-y-0.5">
                <button onClick={() => { setSearchOpen(false); navigate('/workspace'); }} className="w-full text-left px-3 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between">
                  <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#3B82F6]"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> Advanced Search</span>
                  <span className="text-[11px] font-medium bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-slate-500">Alt + /</span>
                </button>
                <button onClick={() => setSearchOpen(false)} className="w-full text-left px-3 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between">
                  <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#3B82F6]"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" /><path d="M15.5 15.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> Search across Zoho</span>
                  <span className="text-[11px] font-medium bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-slate-500">Ctrl + /</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-2" />

      {/* Trial banner — Zoho style */}
      <div className="hidden xl:block text-[12px] text-white/60 truncate max-w-[170px] mr-1">Your account is on ext...</div>

      {/* Org switcher */}
      <div className="relative hidden md:block">
        <button
          onClick={() => { setOrgOpen(!orgOpen); setProfileOpen(false); setNotifOpen(false); setQuickCreateOpen(false); setSearchOpen(false); }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg hover:bg-white/10 text-[13px] font-medium text-white/90 transition-colors max-w-[180px]"
        >
          <span className="truncate">{orgName}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-white/50"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {orgOpen && (
          <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Organization</div>
              <div className="text-[13px] font-semibold mt-1 text-[#0F172A]">{orgName}</div>
            </div>
            <button className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#3B82F6" strokeWidth="1.5" /><path d="M12 16v-4M12 8h.01" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" /></svg>
              Organization Settings
            </button>
          </div>
        )}
      </div>

      <span className="hidden md:block w-px h-6 bg-white/15 mx-1" aria-hidden="true" />

      {/* Blue + quick create — Zoho's solid blue square */}
      <div className="relative">
        <button
          onClick={() => { setQuickCreateOpen(!quickCreateOpen); setOrgOpen(false); setProfileOpen(false); setNotifOpen(false); setSearchOpen(false); }}
          className="w-9 h-9 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] flex items-center justify-center text-white shadow-sm transition-colors"
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
                <span className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#DBEAFE] flex items-center justify-center text-[#3B82F6] shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </span>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bell */}
      <div className="relative hidden sm:block">
        <button
          onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); setOrgOpen(false); setQuickCreateOpen(false); setSearchOpen(false); }}
          className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors relative"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {notifOpen && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#0F172A]">Notifications</span>
              <span className="text-xs font-medium text-[#3B82F6] cursor-pointer hover:underline">Mark all read</span>
            </div>
            <div className="px-4 py-10 text-center text-[13px] text-slate-400">No new notifications</div>
          </div>
        )}
      </div>

      {/* Settings */}
      <button className="hidden sm:flex w-9 h-9 rounded-lg hover:bg-white/10 items-center justify-center text-white/80 hover:text-white transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /><path d="M19.4 15a1.65 1.65 0 00.36 1.81l.04.06a1.65 1.65 0 001.13 1.16l.06.04a1.65 1.65 0 001.81.36l.14.02a1.65 1.65 0 001.69-1.69l.02-.14a1.65 1.65 0 00.36-1.81l.06-.04a1.65 1.65 0 00-.16-1.16l-.04-.06a1.65 1.65 0 00-1.13-1.16l-.06-.04a1.65 1.65 0 00-1.81-.36l-.14.02a1.65 1.65 0 00-1.69 1.69l-.02.14a1.65 1.65 0 00-.36 1.81l-.06.04a1.65 1.65 0 00.16 1.16l.04.06a1.65 1.65 0 001.13 1.16l.06.04a1.65 1.65 0 001.81.36l.14-.02z" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>

      {/* Avatar */}
      <div className="relative">
        <button
          onClick={() => { setProfileOpen(!profileOpen); setOrgOpen(false); setNotifOpen(false); setQuickCreateOpen(false); setSearchOpen(false); }}
          className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/20 hover:border-white/40 transition-colors ml-1"
        >
          {/* fallback gradient if no photo */}
          <span className="w-full h-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #2DC5FB 0%, #2084FA 50%, #7F3EDD 100%)' }}>{initials}</span>
        </button>
        {profileOpen && (
          <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 overflow-hidden text-slate-800">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'linear-gradient(135deg, #2DC5FB 0%, #2084FA 50%, #7F3EDD 100%)' }}>{initials}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate text-[#0F172A]">{displayName}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email || 'user@procureflow.io'}</div>
              </div>
            </div>
            <button className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              My Profile
            </button>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2.5 text-rose-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* App grid */}
      <button className="hidden lg:flex w-8 h-8 rounded-lg hover:bg-white/10 items-center justify-center text-white/70 hover:text-white transition-colors ml-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="5" r="2" fill="currentColor" /><circle cx="12" cy="5" r="2" fill="currentColor" /><circle cx="19" cy="5" r="2" fill="currentColor" /><circle cx="5" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="19" cy="12" r="2" fill="currentColor" /><circle cx="5" cy="19" r="2" fill="currentColor" /><circle cx="12" cy="19" r="2" fill="currentColor" /><circle cx="19" cy="19" r="2" fill="currentColor" /></svg>
      </button>
    </header>
  );
}
