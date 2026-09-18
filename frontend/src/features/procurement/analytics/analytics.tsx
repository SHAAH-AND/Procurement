import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { REPORTS, REPORT_CATEGORIES, DATASET_FIELDS } from './reports';
import type { DatasetKey, CustomReport } from './reports';

const FAV_KEY = 'pf-report-favs';
const CUSTOM_KEY = 'pf-custom-reports';
const VISIT_KEY = 'pf-report-visits';

export function loadIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export function loadCustom(): CustomReport[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((r: any) => r && typeof r.id === 'string' && typeof r.name === 'string');
  } catch { return []; }
}

export function loadVisits(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

export function recordVisit(id: string) {
  try {
    const v = loadVisits();
    v[id] = new Date().toISOString();
    localStorage.setItem(VISIT_KEY, JSON.stringify(v));
  } catch { /* ignore */ }
}

const fmtVisit = (iso?: string) => {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
};

type Section = 'home' | 'favorites' | 'shared' | 'mine' | 'scheduled' | `cat:${string}`;

const DATASETS: { id: DatasetKey; label: string }[] = [
  { id: 'bills', label: 'Bills' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'payments', label: 'Payments' },
  { id: 'credits', label: 'Vendor Credits' },
  { id: 'pos', label: 'Purchase Orders' },
  { id: 'prs', label: 'Purchase Requests' },
];

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('home');
  const [search, setSearch] = useState('');
  const [favs, setFavs] = useState<string[]>(() => loadIds(FAV_KEY));
  const [customs, setCustoms] = useState<CustomReport[]>(() => loadCustom());
  const [visits, setVisits] = useState<Record<string, string>>(() => loadVisits());
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cCat, setCCat] = useState<'Payables' | 'Purchases' | 'Activity'>('Payables');
  const [cDataset, setCDataset] = useState<DatasetKey>('bills');
  const [cCols, setCCols] = useState<string[]>(['billNumber', 'vendorName', 'issueDate', 'status', 'balance']);
  const [cError, setCError] = useState('');

  const toggleFav = (id: string) => {
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const openReport = (id: string) => {
    recordVisit(id);
    setVisits(loadVisits());
    navigate(id);
  };

  const createCustom = () => {
    if (!cName.trim()) { setCError('Give the report a name'); return; }
    if (!cCols.length) { setCError('Pick at least one column'); return; }
    const rep: CustomReport = {
      id: `custom-${Date.now()}`,
      name: cName.trim(),
      category: cCat,
      dataset: cDataset,
      columns: cCols,
    };
    const next = [rep, ...customs];
    setCustoms(next);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setCreateOpen(false);
    setCName('');
    setCCols([]);
    setCError('');
    setSection('mine');
  };

  const allRows = useMemo(() => {
    const sys = REPORTS.map((r) => ({ id: r.id, name: r.name, category: r.category, by: 'System Generated', custom: false }));
    const mine = customs.map((r) => ({ id: r.id, name: r.name, category: r.category, by: 'You', custom: true }));
    return [...mine, ...sys];
  }, [customs]);

  const visible = useMemo(() => {
    let rows = allRows;
    if (section === 'favorites') rows = rows.filter((r) => favs.includes(r.id));
    else if (section === 'mine') rows = rows.filter((r) => r.custom);
    else if (section === 'shared' || section === 'scheduled') rows = [];
    else if (section.startsWith('cat:')) rows = rows.filter((r) => r.category === section.slice(4));
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    return rows;
  }, [allRows, section, favs, search]);

  const sectionTitle =
    section === 'home' ? `All Reports` :
    section === 'favorites' ? 'Favorite Reports' :
    section === 'shared' ? 'Shared Reports' :
    section === 'mine' ? 'My Reports' :
    section === 'scheduled' ? 'Scheduled Reports' :
    `${section.slice(4)} Reports`;

  const navItem = (id: Section, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      onClick={() => setSection(id)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${section === id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
    >
      <span className={section === id ? 'text-[#2084FA]' : 'text-slate-400'}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — Zoho Reports Center */}
      <div className="flex items-center gap-3 px-1 pt-1 pb-3 shrink-0 flex-wrap">
        <h2 className="text-[20px] font-semibold text-slate-900 mr-auto">Reports Center</h2>
        <div className="relative">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2084FA]"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} /><path d="M21 21l-4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports"
            className="h-10 w-64 max-w-full pl-9 pr-3 rounded-xl bg-slate-100 border border-transparent text-sm focus:outline-none focus:bg-white focus:border-slate-200 placeholder:text-slate-400"
          />
        </div>
        <button
          onClick={() => { setCreateOpen(true); setCError(''); }}
          className="px-4 h-10 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm"
        >
          Create New Report
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* Left nav */}
        <aside className="w-52 shrink-0 overflow-y-auto rounded-xl bg-white border border-slate-200 p-2 space-y-0.5 self-start max-h-full hidden sm:block">
          {navItem('home',
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>, 'Home')}
          {navItem('favorites',
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></svg>, 'Favorites')}
          {navItem('shared',
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth={1.7} /><circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth={1.7} /><circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth={1.7} /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" stroke="currentColor" strokeWidth={1.7} /></svg>, 'Shared Reports')}
          {navItem('mine',
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth={1.7} /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>, 'My Reports')}
          {navItem('scheduled',
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.7} /><path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>, 'Scheduled Reports')}
          <div className="pt-2 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Report Category</div>
          {REPORT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setSection(`cat:${c}`)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${section === `cat:${c}` ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-slate-400"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
              {c}
            </button>
          ))}
        </aside>

        {/* Report table */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
            <h3 className="text-[16px] font-semibold text-slate-900">
              {sectionTitle}{' '}
              <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-50 text-[#2084FA] text-xs font-bold align-middle">{visible.length}</span>
            </h3>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <span className="col-span-5">Report Name</span>
                <span className="col-span-2">Report Category</span>
                <span className="col-span-2">Created By</span>
                <span className="col-span-3">Last Visited</span>
              </div>
              {visible.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400 px-6">
                  {section === 'shared' && 'No reports have been shared with you yet.'}
                  {section === 'scheduled' && 'No scheduled reports. Scheduling emails for reports is not available yet.'}
                  {section === 'mine' && 'You have no custom reports yet — use Create New Report.'}
                  {section === 'favorites' && 'Star a report to pin it here.'}
                  {!['shared', 'scheduled', 'mine', 'favorites'].includes(section) && 'No reports match this search.'}
                </div>
              ) : (
                visible.map((r) => {
                  const fav = favs.includes(r.id);
                  return (
                    <div key={r.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-100 text-[13px] items-center hover:bg-slate-50/60 transition-colors">
                      <span className="col-span-5 flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => toggleFav(r.id)}
                          title={fav ? 'Remove from favorites' : 'Add to favorites'}
                          className={fav ? 'text-amber-400 shrink-0' : 'text-slate-300 hover:text-amber-400 shrink-0'}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'}><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></svg>
                        </button>
                        <button onClick={() => openReport(r.id)} className="font-medium text-[#2084FA] hover:underline truncate text-left">{r.name}</button>
                      </span>
                      <span className="col-span-2 text-slate-600">{r.category}</span>
                      <span className="col-span-2 text-slate-600">{r.by}</span>
                      <span className="col-span-3 text-slate-600 tabular-nums">{fmtVisit(visits[r.id])}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create custom report */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Create New Report</h3>
            {cError && <p className="mt-2 rounded-md px-3 py-2 text-[13px] font-medium bg-rose-50 border border-rose-200 text-rose-700">{cError}</p>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Report Name<span className="text-red-600"> *</span></label>
                <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="e.g. Overdue Bills by Vendor" className="h-9 w-full px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-slate-800 block mb-1">Category</label>
                  <select value={cCat} onChange={(e) => setCCat(e.target.value as any)} className="h-9 w-full px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#2084FA]">
                    {REPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] text-slate-800 block mb-1">Dataset</label>
                  <select
                    value={cDataset}
                    onChange={(e) => { setCDataset(e.target.value as DatasetKey); setCCols(DATASET_FIELDS[e.target.value as DatasetKey].slice(0, 5).map((f) => f.id)); }}
                    className="h-9 w-full px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#2084FA]"
                  >
                    {DATASETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Columns</label>
                <div className="rounded-lg border border-slate-200 p-2 max-h-44 overflow-y-auto space-y-0.5">
                  {DATASET_FIELDS[cDataset].map((f) => (
                    <label key={f.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cCols.includes(f.id)}
                        onChange={(e) => setCCols((s) => e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id))}
                        className="w-4 h-4 accent-[#2084FA]"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setCreateOpen(false)} className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
              <button onClick={createCustom} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6]">Create Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
