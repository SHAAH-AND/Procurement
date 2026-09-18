import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GROUPS, allSearchable } from './registry';
import { useAuth } from '../auth/AuthContext';
import { useAccess, canDo } from '../access/resolver';
import { SETTING_ITEM_ACL } from '../access/catalog';

// ── Settings index — professional SaaS standard ─────────────────────────────
// Same registry options, brand-new presentation:
//  • Clean white header (breadcrumb + title + command search), no navy deck
//  • Left section rail (sticky) + right content sections — Linear/Stripe style
//  • Flat per-setting cards with icon tile, hover affordance, keyboard search
// ────────────────────────────────────────────────────────────────────────────

const RECENT_KEY = 'pf-settings-recent';

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 4) : [];
  } catch {
    return [];
  }
}

const POPULAR_IDS = ['profile', 'users', 'taxes', 'workflow-rules'];

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [activeGroup, setActiveGroup] = useState(GROUPS[0]?.id ?? '');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const searchRef = useRef<HTMLInputElement>(null);

  const orgName = (user as any)?.orgName || 'Your organization';
  const userEmail = (user as any)?.email || user?.email || '';

  // Access gating (Zoho parity): admin-only items (users, roles, …) are hidden
  // unless the caller holds the required grant. Gating activates once access
  // resolves so bootstrap/demo users never see a flash of missing options.
  const access = useAccess();
  const allowed = (id: string) => {
    if (access.loading || access.full) return true;
    const need = SETTING_ITEM_ACL[id];
    if (!need) return true;
    const [mod, action] = need.split(':');
    return canDo(access, mod, action as 'view');
  };

  const searchable = useMemo(() => allSearchable(), []);
  const byId = useMemo(() => new Map(searchable.map((r) => [r.id, r])), [searchable]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return searchable.filter((r) => r.hay.includes(query)).filter((r) => allowed(r.id)).slice(0, 24);
  }, [q, searchable, access.loading, access.full, access.grants]);

  // "/" focuses search — standard SaaS shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = (id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 4);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    navigate(id);
  };

  const jumpTo = (groupId: string) => {
    setActiveGroup(groupId);
    document.getElementById(`set-group-${groupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const popular = POPULAR_IDS.map((id) => byId.get(id)).filter(Boolean).filter((p: any) => allowed(p.id)) as { id: string; title: string; desc: string; group: string }[];
  const recentItems = recent.map((id) => byId.get(id)).filter(Boolean).filter((r: any) => allowed(r.id)) as { id: string; title: string; desc: string; group: string }[];

  const searching = q.trim().length > 0;

  // Gated view of the registry: drops admin-only items (and emptied cards/groups).
  const visibleGroups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        cards: g.cards
          .map((c) => ({
            ...c,
            items: c.items.filter((e) => 'subhead' in e || allowed((e as { id: string }).id)),
          }))
          .filter((c) => c.items.some((e) => !('subhead' in e))),
      })).filter((g) => g.cards.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [access.loading, access.full, access.grants],
  );

  const totalOptions = visibleGroups.reduce(
    (n, g) => n + g.cards.reduce((m, c) => m + c.items.filter((e) => !('subhead' in e)).length, 0),
    0,
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F6F7F9] -m-0 rounded-none">
      {/* ── Header ── */}
      <header className="shrink-0 bg-white border-b border-slate-200">
        <div className="px-4 sm:px-8 pt-5 pb-4 max-w-[1200px] mx-auto w-full">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-600 font-medium">Settings</span>
            <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {orgName}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="mr-auto min-w-0">
              <h1 className="text-[22px] leading-tight font-bold text-slate-900 tracking-tight">Settings</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">
                Manage your organization, modules and automations · {totalOptions} options
                {userEmail ? <span className="hidden md:inline"> · Signed in as {userEmail}</span> : null}
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results.length > 0) open(results[0].id);
                  if (e.key === 'Escape') setQ('');
                }}
                placeholder="Search settings…"
                className="h-10 w-full pl-10 pr-12 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#2084FA] focus:ring-4 focus:ring-[#2084FA]/10 transition"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 border border-slate-200 bg-white rounded-md px-1.5 py-0.5">/</kbd>
            </div>
            <button
              onClick={() => navigate('/workspace')}
              className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[13px] font-semibold text-slate-700 transition-colors"
            >
              Back to workspace
            </button>
          </div>

          {/* Quick shortcuts — popular destinations */}
          {!searching && popular.length > 0 && (
            <div className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">Popular</span>
              {popular.map((p) => (
                <button
                  key={p.id}
                  onClick={() => open(p.id)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-200 bg-white text-[12.5px] font-medium text-slate-600 hover:border-[#2084FA]/50 hover:text-[#1a6fd6] transition-colors"
                >
                  {p.title}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-slate-300"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-8 py-6">
          {searching ? (
            <SearchResults query={q} results={results} onOpen={open} onClear={() => setQ('')} />
          ) : (
            <div className="flex gap-8 items-start">
              {/* Section rail */}
              <aside className="hidden lg:block w-60 shrink-0 sticky top-0">
                <nav className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sections</div>
                  {visibleGroups.map((g) => {
                    const count = g.cards.reduce((n, c) => n + c.items.filter((e) => !('subhead' in e)).length, 0);
                    const active = activeGroup === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => jumpTo(g.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-[13px] transition-colors ${active ? 'bg-[#2084FA]/8 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}
                        style={active ? { background: 'rgba(32,132,250,0.08)' } : undefined}
                      >
                        <span className={`w-1 rounded-full self-stretch ${active ? 'bg-[#2084FA]' : 'bg-transparent'}`} aria-hidden="true" />
                        <span className="flex-1 truncate">{g.title}</span>
                        <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-0.5 ${active ? 'bg-[#2084FA]/10 text-[#1a6fd6]' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                      </button>
                    );
                  })}
                </nav>

                {recentItems.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Recently visited</div>
                    {recentItems.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => open(r.id)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <span className="block text-[13px] font-medium text-slate-800 truncate">{r.title}</span>
                        <span className="block text-[11.5px] text-slate-400 truncate">{r.group}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
                  <p className="text-[12.5px] font-semibold text-slate-700">Need help?</p>
                  <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">Changes apply to the whole organization immediately after saving.</p>
                </div>
              </aside>

              {/* Sections */}
              <div className="flex-1 min-w-0 space-y-10 pb-10">
                {/* Mobile section pills */}
                <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {visibleGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => jumpTo(g.id)}
                      className="shrink-0 h-8 px-3.5 rounded-full border border-slate-200 bg-white text-[12.5px] font-medium text-slate-600"
                    >
                      {g.title}
                    </button>
                  ))}
                </div>

                {visibleGroups.map((g) => (
                  <section key={g.id} id={`set-group-${g.id}`} className="scroll-mt-4">
                    <div className="flex items-baseline gap-2.5 mb-4">
                      <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">{g.title}</h2>
                      <span className="text-xs text-slate-400">
                        {g.cards.reduce((n, c) => n + c.items.filter((e) => !('subhead' in e)).length, 0)} options
                      </span>
                      <span className="flex-1 border-t border-slate-200 translate-y-[-4px]" aria-hidden="true" />
                    </div>

                    {g.cards.map((c) => {
                      const items = c.items.filter((e) => !('subhead' in e)) as { id: string; title: string; desc: string }[];
                      const heads: { sub: string; items: typeof items }[] = [];
                      let current = '';
                      let bucket: typeof items = [];
                      const flush = () => {
                        if (bucket.length) heads.push({ sub: current, items: bucket });
                        bucket = [];
                      };
                      for (const e of c.items) {
                        if ('subhead' in e) {
                          flush();
                          current = (e as { subhead: string }).subhead;
                        } else {
                          bucket.push(e as { id: string; title: string; desc: string });
                        }
                      }
                      flush();

                      return (
                        <div key={c.id} className="mb-5">
                          <div className="flex items-center gap-2.5 mb-3">
                            <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center border border-slate-200 bg-white shadow-sm ${c.tint.split(' ')[1] || 'text-slate-500'}`}>
                              {c.icon}
                            </span>
                            <h3 className="text-[13.5px] font-bold text-slate-800">{c.title}</h3>
                          </div>

                          {heads.map((h, hi) => (
                            <div key={hi} className="mb-4 last:mb-0">
                              {h.sub && (
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 ml-0.5">{h.sub}</div>
                              )}
                              <div className="grid gap-3 sm:grid-cols-2">
                                {h.items.map((item) => (
                                  <button
                                    key={item.id}
                                    onClick={() => open(item.id)}
                                    className="group text-left rounded-2xl border border-slate-200 bg-white p-4 hover:border-[#2084FA]/50 hover:shadow-[0_8px_24px_-12px_rgba(32,132,250,0.35)] hover:-translate-y-px transition-all"
                                  >
                                    <span className="flex items-start gap-3">
                                      <span className="flex-1 min-w-0">
                                        <span className="block text-[13.5px] font-semibold text-slate-900 group-hover:text-[#1a6fd6] transition-colors">{item.title}</span>
                                        <span className="block text-[12.5px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{item.desc}</span>
                                      </span>
                                      <span className="mt-0.5 w-7 h-7 rounded-full border border-slate-150 bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-[#2084FA] group-hover:border-[#2084FA] group-hover:text-white transition-all shrink-0" style={{ borderColor: '#e8edf3' }}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                                      </span>
                                    </span>
                                    <span className="mt-3 block text-[11.5px] font-semibold text-slate-400 group-hover:text-[#2084FA] transition-colors">
                                      Configure <span aria-hidden="true">→</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  query, results, onOpen, onClear,
}: {
  query: string;
  results: { id: string; title: string; desc: string; group: string }[];
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  const q = query.trim();
  // Group hits by section for a structured SaaS result list
  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    for (const r of results) {
      const arr = map.get(r.group) ?? [];
      arr.push(r);
      map.set(r.group, arr);
    }
    return [...map.entries()];
  }, [results]);

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <div className="flex items-center gap-2.5 mb-4">
        <p className="text-[13px] text-slate-500">
          <span className="font-bold text-slate-900 tabular-nums">{results.length}</span> result{results.length === 1 ? '' : 's'} for <span className="font-semibold text-slate-800">“{q}”</span>
        </p>
        <button onClick={onClear} className="ml-auto text-[12.5px] font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 bg-white rounded-lg px-2.5 h-8 transition-colors">
          Clear
        </button>
      </div>
      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 px-6 text-center">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
          </div>
          <p className="mt-3 text-[14px] font-semibold text-slate-800">No setting matches “{q}”</p>
          <p className="mt-1 text-[12.5px] text-slate-500">Try “tax”, “approval”, “currency” or “webhook”.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([group, items]) => (
            <div key={group} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
              {items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-[#2084FA]/[0.04] text-left transition-colors group"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold text-slate-900"><Highlight text={r.title} q={q} /></span>
                    <span className="block text-[12.5px] text-slate-500 truncate">{r.desc}</span>
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-300 group-hover:text-[#2084FA] group-hover:translate-x-0.5 transition-all shrink-0"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-center text-[11.5px] text-slate-400">Press <kbd className="border border-slate-200 bg-white rounded px-1.5 py-0.5 font-semibold">Enter</kbd> to open the top result · <kbd className="border border-slate-200 bg-white rounded px-1.5 py-0.5 font-semibold">Esc</kbd> to clear</p>
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[#2084FA]/15 text-inherit rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
