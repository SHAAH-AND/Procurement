import { useState } from 'react';
import { useSettingKey, saveSettings } from '../service';
import { INPUT } from '../blocks';

// ── Currencies: base + rate table ──

type Row = { code: string; symbol: string; rate: number | '' };

export function CurrenciesPage() {
  const { value, loading } = useSettingKey<{ base: string; list: Row[] }>('setup.currencies', { base: 'LKR', list: [] });
  const [draft, setDraft] = useState<{ base: string; list: Row[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cur = draft ?? value ?? { base: 'LKR', list: [] };
  const set = (patch: Partial<{ base: string; list: Row[] }>) => setDraft({ ...cur, ...patch });
  const setCell = (i: number, id: keyof Row, v: any) =>
    set({ list: cur.list.map((r, j) => (j === i ? { ...r, [id]: v } : r)) });

  const save = async () => {
    const clean = cur.list.filter((r) => String(r.code || '').trim());
    if (!clean.length) {
      setMsg('Keep at least one currency.');
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ 'setup.currencies': { base: cur.base, list: clean } });
      setDraft(null);
      setMsg('Saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <label className="text-[13px] font-medium text-slate-800 block">Base Currency</label>
        <select value={cur.base} onChange={(e) => set({ base: e.target.value })} className={`${INPUT} w-full max-w-xs mt-1.5`}>
          {cur.list.map((r) => r.code).filter(Boolean).map((c) => <option key={c}>{c}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1">Totals across the workspace are shown in this currency.</p>
      </div>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: 'minmax(120px,1fr) minmax(100px,0.7fr) minmax(120px,1fr) 40px' }}>
          <span className="px-3 py-2.5 border-r border-slate-100">Code</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Symbol</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Rate to Base</span>
          <span />
        </div>
        {cur.list.map((r, i) => (
          <div key={i} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white" style={{ gridTemplateColumns: 'minmax(120px,1fr) minmax(100px,0.7fr) minmax(120px,1fr) 40px' }}>
            <span className="px-2 py-1.5 border-r border-slate-100">
              <input value={r.code} onChange={(e) => setCell(i, 'code', e.target.value.toUpperCase())} placeholder="USD" className="w-full h-8 px-2 rounded text-[13px] uppercase focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-300" />
            </span>
            <span className="px-2 py-1.5 border-r border-slate-100">
              <input value={r.symbol} onChange={(e) => setCell(i, 'symbol', e.target.value)} placeholder="$" className="w-full h-8 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-300" />
            </span>
            <span className="px-2 py-1.5 border-r border-slate-100">
              <input value={r.rate} onChange={(e) => setCell(i, 'rate', e.target.value === '' ? '' : Number(e.target.value))} type="number" min={0} step="any" className="w-full h-8 px-2 rounded text-[13px] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30" />
            </span>
            <span className="flex items-center justify-center">
              <button onClick={() => set({ list: cur.list.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-rose-500 text-lg leading-none" aria-label="Remove currency">×</button>
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => set({ list: [...cur.list, { code: '', symbol: '', rate: '' }] })}
          className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5"
        >
          <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
          Add Currency
        </button>
        {draft && (
          <button onClick={save} disabled={saving} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
