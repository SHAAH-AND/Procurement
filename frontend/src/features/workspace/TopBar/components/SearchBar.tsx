import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SEARCH_MODULES } from '../constants';

export function SearchBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchModule, setSearchModule] = useState<typeof SEARCH_MODULES[number]>(SEARCH_MODULES[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const path = location.pathname;
    const match = SEARCH_MODULES.find(m => path.startsWith(m.path) && m.path !== '/workspace') || (path === '/workspace' ? SEARCH_MODULES[0] : null);
    if (match) setSearchModule(match);
  }, [searchOpen, location.pathname]);

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
    <div ref={searchRef} className="relative flex items-center ml-2 sm:ml-3 flex-1 max-w-[420px] sm:max-w-[460px]">
      <form onSubmit={onSearchSubmit} className="flex items-center w-full h-9 rounded-lg bg-[#1E293B] border border-white/12 hover:border-white/20 hover:bg-[#232F47] focus-within:border-[#2084FA]/60 focus-within:ring-2 focus-within:ring-[#2084FA]/20 transition-all duration-150 overflow-hidden">
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
                  className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center justify-between mx-1.5 rounded-lg transition-all duration-150 ease-out ${isActive ? 'bg-[#2084FA] text-white shadow-sm' : isSelected ? 'bg-[#EEF2FF] text-[#1E40AF]' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="font-medium">{m.label}</span>
                  {isSelected && !isActive && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              );
            })}
            <div className="border-t border-slate-100 mt-1.5 pt-1.5 mx-1.5 space-y-0.5">
              <button onClick={() => { setSearchOpen(false); navigate('/workspace'); }} className="w-full text-left px-3 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between">
                <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> Advanced Search</span>
                <span className="text-[11px] font-medium bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-slate-500">Alt + /</span>
              </button>
              <button onClick={() => setSearchOpen(false)} className="w-full text-left px-3 py-2.5 text-[13px] text-slate-600 hover:bg-slate-50 rounded-lg flex items-center justify-between">
                <span className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" /><path d="M15.5 15.5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> Search across Zoho</span>
                <span className="text-[11px] font-medium bg-slate-100 border border-slate-200 px-2 py-1 rounded-md text-slate-500">Ctrl + /</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}