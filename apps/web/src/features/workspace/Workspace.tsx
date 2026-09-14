import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { TopBar } from './TopBar';
import { Sidebar } from './WorkspaceSidebar';
import { HomeView } from '../dashboard/HomeView';
import PerfectLoader from '../../components/PerfectLoader';

export default function Workspace() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsUser, setWsUser] = useState<any>(null);

  // Derive active tab from URL path
  const path = location.pathname.replace('/workspace/', '').replace('/workspace', '');
  const activeTab = path || 'home';
  const isHome = !path || path === 'home';

  useEffect(() => {
    if (!user) return;
    setWsUser({ name: user.email?.split('@')[0] || 'U', orgName: (user as any).orgName || 'Galle Face Hotel Group' });
  }, [user]);

  if (loading) return <PerfectLoader message="Please wait while we make everything perfect for you..." />;
  if (!user && !wsUser) {
    navigate('/signin', { replace: true });
    return null;
  }

  if (!wsUser) {
    return <PerfectLoader message="Setting up your workspace..." />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Separate Top Bar — fixed, doesn't change per tab (Zoho style) */}
      <TopBar user={wsUser} />

      {/* Main workspace area — sidebar + content below the top bar */}
      <div className="flex flex-1 overflow-hidden bg-[#f8faf9]">
        <Sidebar
          active={activeTab}
          setActive={(tab: string) => { navigate(tab === 'home' ? '/workspace' : `/workspace/${tab}`); }}
          collapsed={!sidebarOpen}
          setCollapsed={(v: boolean) => setSidebarOpen(!v)}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Hello strip — home only (Zoho hides it on inner pages) */}
          {isHome && (
          <header className="relative bg-white border-b border-slate-200 px-4 sm:px-6 py-4 overflow-hidden shrink-0 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="absolute inset-0 pf-pattern-bg pointer-events-none" style={{ opacity: 0.38 }} aria-hidden="true" />
            <div className="absolute inset-0 pf-logo-tile-bg pointer-events-none" aria-hidden="true" style={{ opacity: 0.1 }} />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-slate-500"><rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/></svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[17px] font-semibold text-slate-900 leading-tight">Hello, {wsUser.name || 'user1'}</div>
                  <div className="text-[13px] text-slate-500 truncate">{wsUser.orgName || 'Demo Cloud Partners'}</div>
                </div>
              </div>
              <div className="hidden sm:block text-right shrink-0">
                <div className="text-[13px] font-medium text-slate-700">ProcureFlow Helpline: <span className="font-bold text-slate-900">18005692747</span></div>
                <div className="text-xs text-slate-500">Mon - Fri • 9:00 AM - 6:00 PM • Toll Free</div>
              </div>
            </div>
            {/* Secondary tabs — like Zoho's My Home | Dashboard */}
            <div className="relative mt-2.5 flex items-center gap-5 text-sm">
              <button className="font-medium text-slate-600 hover:text-slate-900 pb-1">My Home</button>
              <button className="font-semibold text-[#07175A] border-b-2 border-[#3B82F6] pb-1 -mb-1">Dashboard</button>
              <a href="#" className="ml-auto text-[13px] font-medium text-[#3B82F6] flex items-center gap-1 hover:underline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> Getting Started</a>
            </div>
          </header>
          )}
          {/* Page content — Outlet renders nested routes, HomeView for index (pages carry their own titles, Zoho has no second strip) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 [zoom:1.1]">
            {isHome ? <HomeView user={wsUser} /> : <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}