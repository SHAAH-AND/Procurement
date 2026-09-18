import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  reportById, runCustom, customNeeds, REPORTS,
} from '../reports';
import type { CustomReport, Filters, Data } from '../reports';
import { loadCustom } from '../analytics';
import {
  getBills, getVendors, getPayments, getCredits, getPos, getAllPrs, getItems, getBatches,
} from '../../../../api';

const FETCHERS: Record<keyof Data, () => Promise<any>> = {
  bills: getBills,
  vendors: getVendors,
  payments: getPayments,
  credits: getCredits,
  pos: getPos,
  prs: getAllPrs,
  items: getItems,
  batches: getBatches,
};

const arr = (r: any) => (Array.isArray(r) ? r : r?.data || []);

const PRESETS = ['This Month', 'Last Month', 'This Quarter', 'This Year', 'Custom'] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function presetRange(p: string): { from: string; to: string } {
  const now = new Date();
  if (p === 'Last Month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(first), to: iso(last) };
  }
  if (p === 'This Quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: iso(new Date(now.getFullYear(), q * 3 + 3, 0)) };
  }
  if (p === 'This Year') {
    return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 11, 31)) };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: iso(first), to: iso(last) };
}

const fmtRange = (f: Filters) => {
  const fmt = (s: string) => {
    if (!s) return '—';
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  return { from: fmt(f.from), to: fmt(f.to) };
};

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

export function ReportDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const builtin = reportById(id || '');
  const [custom] = useState<CustomReport | null>(() => loadCustom().find((r) => r.id === id) || null);
  const def = builtin || null;

  const [data, setData] = useState<Data>({ bills: [], vendors: [], payments: [], credits: [], pos: [], prs: [], items: [], batches: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const init = useMemo(() => presetRange('This Month'), []);
  const [preset, setPreset] = useState<string>('This Month');
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [vendor, setVendor] = useState('');
  const [applied, setApplied] = useState<Filters>({ ...init, vendor: '' });

  const needs = useMemo<(keyof Data)[]>(
    () => (def ? def.needs : custom ? customNeeds(custom) : []),
    [def, custom],
  );

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all(needs.map((k) => FETCHERS[k]().then(arr).catch(() => [])))
      .then((results) => {
        const d: Data = { bills: [], vendors: [], payments: [], credits: [], pos: [], prs: [], items: [], batches: [] };
        needs.forEach((k, i) => { d[k] = results[i]; });
        setData(d);
      })
      .catch((e: any) => setError(e?.message || 'Failed to load report data'))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => {
    if (def) return def.run(data, applied);
    if (custom) return runCustom(custom, data, applied);
    return null;
  }, [def, custom, data, applied]);

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    data.vendors.forEach((v: any) => { if (v?.name || v?.Name) set.add(v.name || v.Name); });
    data.bills.forEach((b: any) => { if (b?.vendorName) set.add(b.vendorName); });
    return [...set].sort();
  }, [data]);

  const run = () => {
    if (preset !== 'Custom') {
      const r = presetRange(preset);
      setFrom(r.from);
      setTo(r.to);
      setApplied({ from: r.from, to: r.to, vendor });
    } else {
      setApplied({ from, to, vendor });
    }
  };

  const exportCsv = () => {
    if (!result) return;
    const blob = new Blob([toCsv([result.columns, ...result.rows])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id || 'report'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteCustom = () => {
    if (!custom || !window.confirm(`Delete "${custom.name}"?`)) return;
    try {
      const next = loadCustom().filter((r) => r.id !== custom.id);
      localStorage.setItem('pf-custom-reports', JSON.stringify(next));
    } catch { /* ignore */ }
    navigate('/workspace/analytics');
  };

  if (!def && !custom) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Report not found.{' '}
        <button onClick={() => navigate('/workspace/analytics')} className="text-[#2084FA] hover:underline">Back to Reports Center</button>
      </div>
    );
  }

  const title = def ? def.name : custom!.name;
  const category = def ? def.category : custom!.category;
  const range = fmtRange(applied);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Title band — Zoho style */}
      <div className="flex items-center gap-3 px-1 pt-1 pb-3 shrink-0 flex-wrap">
        <button onClick={() => navigate('/workspace/analytics')} className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 shrink-0" aria-label="All reports">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
        </button>
        <div className="min-w-0 mr-auto">
          <div className="text-[13px] font-medium text-[#2084FA]">{category}</div>
          <h2 className="text-[18px] font-semibold text-slate-900 leading-tight truncate">
            {title} <span className="font-normal text-slate-400 text-[13px]">• From {range.from} To {range.to}</span>
          </h2>
        </div>
        {custom && (
          <button onClick={deleteCustom} className="text-[13px] text-rose-600 hover:underline shrink-0">Delete report</button>
        )}
        <button onClick={() => navigate('/workspace/analytics')} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1 shrink-0" aria-label="Close">×</button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-1 pb-3 shrink-0 flex-wrap">
        <span className="text-[13px] text-slate-600 flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-slate-500"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
          Filters :
        </span>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#2084FA]">
          {PRESETS.map((p) => <option key={p}>{p}</option>)}
        </select>
        {preset === 'Custom' && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#2084FA]" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#2084FA]" />
          </>
        )}
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="h-9 px-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:border-[#2084FA] max-w-[200px]">
          <option value="">All vendors</option>
          {vendorOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button onClick={run} className="px-4 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm">Run Report</button>
        <button onClick={exportCsv} disabled={!result || result.rows.length === 0} className="px-3 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[13px] font-medium text-slate-700 disabled:opacity-50">Export CSV</button>
      </div>

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3 shrink-0" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Summary + table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-5 pt-6 pb-4 text-center border-b border-slate-100">
            <h3 className="text-[19px] font-semibold text-slate-900">{title}</h3>
            <p className="text-[13px] text-slate-500 mt-1">From {range.from} To {range.to}{applied.vendor ? ` · ${applied.vendor}` : ''}</p>
            {result && result.summary.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                {result.summary.map((s) => (
                  <span key={s.label} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-600">
                    {s.label}: <strong className="text-slate-900 tabular-nums">{s.value}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Running report…</div>
          ) : !result || result.rows.length === 0 ? (
            <div className="py-16 text-center px-6">
              <p className="text-[15px] text-slate-500">{result?.note || 'No data found for the given date range'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${Math.max(640, result.columns.length * 150)}px` }}>
                <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: `repeat(${result.columns.length}, minmax(130px,1fr))` }}>
                  {result.columns.map((c) => <span key={c} className="px-4 py-2.5 border-r border-slate-100 last:border-0 whitespace-nowrap">{c}</span>)}
                </div>
                {result.rows.map((row, i) => (
                  <div key={i} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] hover:bg-slate-50/60" style={{ gridTemplateColumns: `repeat(${result.columns.length}, minmax(130px,1fr))` }}>
                    {row.map((cell, j) => (
                      <span key={j} className={`px-4 py-2 border-r border-slate-100 last:border-0 truncate ${j === 0 ? 'font-medium text-[#2084FA]' : 'text-slate-700'}`} title={String(cell)}>
                        {cell}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2 px-1 pb-4">
          {REPORTS.length} system reports across {['Payables', 'Purchases', 'Activity'].join(', ')}. Custom reports live under My Reports.
        </p>
      </div>
    </div>
  );
}
