import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from './components/SearchBar';
import { OrgSwitcher } from './components/OrgSwitcher';
import { QuickCreate } from './components/QuickCreate';
import { Notifications } from './components/Notifications';
import { SettingsButton } from './components/SettingsButton';
import { UserAvatar } from './components/UserAvatar';
import { AppGrid } from './components/AppGrid';

interface TopBarProps {
  user: { name?: string; email?: string; orgName?: string } | null;
}

export function TopBar({ user }: TopBarProps) {
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);

  const closeAll = () => {};

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) closeAll();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

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

  const orgName = user?.orgName || 'Demo Cloud Partner';

  return (
    <header ref={headerRef} className="h-12 bg-[#0F172A] text-white flex items-center px-3 gap-2 z-50 relative shrink-0 select-none border-b border-white/10 shadow-[0_2px_12px_rgba(2,6,23,0.45)]">
      {/* Left: brand + Procurement */}
      <div
        className="flex items-center gap-2.5 shrink-0 cursor-pointer"
        onClick={() => { closeAll(); navigate('/workspace'); }}
      >
        <img src="/app/img/procureflow-logo.png" alt="ProcureFlow" className="h-7 w-7 object-contain rounded-md" />
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

      {/* Search Bar */}
      <SearchBar />

      {/* Spacer */}
      <div className="flex-1 min-w-2" />

      {/* Trial banner */}
      <div className="hidden xl:block text-[12px] text-white/60 truncate max-w-[170px] mr-4">Your account is on ext...</div>

      {/* Org Switcher */}
      <OrgSwitcher orgName={orgName} />

      <span className="hidden md:block w-px h-5 bg-white/15 mx-4" aria-hidden="true" />

      {/* Quick Create */}
      <QuickCreate />

      {/* Notifications */}
      <Notifications onCloseAll={closeAll} />

      {/* Settings */}
      <SettingsButton />

      {/* User Avatar */}
      <UserAvatar user={user} onCloseAll={closeAll} />

      {/* App Grid */}
      <AppGrid />
    </header>
  );
}