import { useState } from 'react';
import { useSettingKey, saveSettings } from '../service';
import { INPUT } from '../blocks';

// ── Transaction number series: prefixes + next counters for bills and POs.
// A blank Next means "keep counting from existing documents". ──

type Series = { prefix: string; next: string };

const EMPTY: Record<string, Series> = {
  bills: { prefix: 'BILL', next: '' },
  pos: { prefix: 'PO', next: '' },
};

export function NumberSeriesPage() {
  const { value, loading } = useSettingKey<Record<string, Series>>('custom.numbering', EMPTY);
  const [draft, setDraft] = useState<Record<string, Series> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cur = { ...EMPTY, ...(draft ?? value ?? {}) };
  const set = (doc: string, patch: Partial<Series>) =>
    setDraft({ ...cur, [doc]: { ...cur[doc], ...patch } });

  const preview = (doc: string) => {
    const s = cur[doc];
    const n = Number(s.next) || null;
    return `${(s.prefix || '').trim() || (doc === 'bills' ? 'BILL' : 'PO')}-${String(n || 1).padStart(4, '0')}${n ? '' : ' (auto)'}`;
  };

  const save = async () => {
    for (const doc of Object.keys(cur)) {
      if (!cur[doc].prefix.trim()) {
        setMsg('Every series needs a prefix.');
        return;
      }
      if (cur[doc].next !== '' && !(Number(cur[doc].next) >= 1)) {
        setMsg('Next must be blank or a number ≥ 1.');
        return;
      }
    }
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ 'custom.numbering': cur });
      setDraft(null);
      setMsg('Saved. New bills and purchase orders use these series.');
    } catch (e: any) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-4">
      {[
        { id: 'bills', label: 'Bills', hint: 'Internal bill numbers (vendor references are untouched).' },
        { id: 'pos', label: 'Purchase Orders', hint: 'PO numbers on new orders.' },
      ].map((d) => (
        <div key={d.id} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <div className="text-[14px] font-bold text-slate-900">{d.label}</div>
          <p className="text-xs text-slate-400 mt-0.5">{d.hint}</p>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <div>
              <label className="text-[13px] text-slate-800 block mb-1">Prefix</label>
              <input value={cur[d.id].prefix} onChange={(e) => set(d.id, { prefix: e.target.value })} className={`${INPUT} w-full`} />
            </div>
            <div>
              <label className="text-[13px] text-slate-800 block mb-1">Next Number</label>
              <input
                value={cur[d.id].next}
                onChange={(e) => set(d.id, { next: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="Auto"
                className={`${INPUT} w-full tabular-nums`}
              />
            </div>
          </div>
          <p className="text-[13px] text-slate-500 mt-2">
            Next: <strong className="text-slate-900 tabular-nums">{preview(d.id)}</strong>
          </p>
        </div>
      ))}
      <div className="flex items-center gap-3">
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
