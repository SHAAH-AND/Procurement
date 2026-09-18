import { useState } from 'react';
import { useSettingKey, saveSettings } from './service';

export const INPUT =
  'h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#2084FA]/10 focus:border-[#2084FA] transition';

export type FieldSpec = {
  id: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'toggle' | 'color';
  options?: string[];
  placeholder?: string;
  hint?: string;
  rows?: number;
};

export type ColSpec = { id: string; label: string; type?: 'text' | 'number'; placeholder?: string };

export function Field({ spec, value, onChange }: { spec: FieldSpec; value: any; onChange: (v: any) => void }) {
  const control = (() => {
    switch (spec.type) {
      case 'textarea':
        return (
          <textarea
            value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={spec.rows || 3}
            placeholder={spec.placeholder}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#2084FA]/10 focus:border-[#2084FA] resize-y placeholder:text-slate-400 transition"
          />
        );
      case 'select':
        return (
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full max-w-md`}>
            {(spec.options || []).map((o) => <option key={o}>{o}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2.5 text-[13px] text-slate-800 cursor-pointer">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" />
            {spec.label}
          </label>
        );
      case 'toggle':
        return (
          <button
            type="button" role="switch" aria-checked={!!value} aria-label={spec.label}
            onClick={() => onChange(!value)}
            className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${value ? 'bg-[#2084FA]' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        );
      case 'color':
        return (
          <span className="flex items-center gap-2">
            <input type="color" value={value || '#2084FA'} onChange={(e) => onChange(e.target.value)} className="w-10 h-9 rounded-md border border-slate-300 bg-white cursor-pointer" />
            <span className="text-[13px] text-slate-500 tabular-nums">{value || '#2084FA'}</span>
          </span>
        );
      case 'number':
        return (
          <input
            type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={spec.placeholder} className={`${INPUT} w-full max-w-md`}
          />
        );
      default:
        return (
          <input
            value={value ?? ''} onChange={(e) => onChange(e.target.value)}
            placeholder={spec.placeholder} className={`${INPUT} w-full max-w-md`}
          />
        );
    }
  })();
  if (spec.type === 'checkbox') {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3">
        {control}
        {spec.hint && <p className="text-xs text-slate-400 mt-1.5 ml-6 leading-relaxed">{spec.hint}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="text-[13px] font-semibold text-slate-800 flex items-center gap-3">
        <span className="min-w-[180px]">{spec.label}</span>
        {spec.type === 'toggle' ? control : null}
      </label>
      {spec.type !== 'toggle' && <div className="mt-1.5">{control}</div>}
      {spec.hint && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{spec.hint}</p>}
    </div>
  );
}

// ── Generic persisted form: loads one settings object, edits, saves ──

export function SettingsForm({ storageKey, fields, submitLabel = 'Save Changes' }: {
  storageKey: string; fields: FieldSpec[]; submitLabel?: string;
}) {
  const { value, setValue, loading } = useSettingKey<Record<string, any>>(storageKey, {});
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const cur = draft ?? value ?? {};
  const set = (id: string, v: any) => setDraft({ ...cur, [id]: v });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ [storageKey]: cur });
      setDraft(null);
      setValue(cur);
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-5">
      {fields.map((f) => <Field key={f.id} spec={f} value={cur[f.id]} onChange={(v) => set(f.id, v)} />)}
      {msg && (
        <p className={`rounded-xl px-3.5 py-2.5 text-[13px] font-medium border ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {msg.text}
        </p>
      )}
      <div className="pt-1 flex items-center gap-3">
        <button
          onClick={save} disabled={saving}
          className="px-5 h-10 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-[0_6px_16px_-8px_rgba(32,132,250,0.6)] transition-all"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ── Generic persisted list: array of objects with columns ──

export function CrudList({ storageKey, columns, addLabel = 'Add', emptyText = 'Nothing here yet.' }: {
  storageKey: string; columns: ColSpec[]; addLabel?: string; emptyText?: string;
}) {
  const { value, loading } = useSettingKey<any[]>(storageKey, []);
  const [rows, setRows] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const cur = rows ?? (Array.isArray(value) ? value : []);
  const dirty = rows !== null;

  const setCell = (i: number, id: string, v: any) =>
    setRows(cur.map((r, j) => (j === i ? { ...r, [id]: v } : r)));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ [storageKey]: cur });
      setRows(null);
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="grid gap-0 bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px,1fr)) 44px` }}>
          {columns.map((c) => <span key={c.id} className="px-3.5 py-3 border-r border-slate-100 last:border-0">{c.label}</span>)}
          <span />
        </div>
        {cur.length === 0 && <div className="py-10 text-center text-[13px] text-slate-400">{emptyText}</div>}
        {cur.map((r, i) => (
          <div key={i} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white hover:bg-slate-50/60 transition-colors" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px,1fr)) 44px` }}>
            {columns.map((c) => (
              <span key={c.id} className="px-2 py-1.5 border-r border-slate-100 last:border-0">
                <input
                  value={r[c.id] ?? ''}
                  onChange={(e) => setCell(i, c.id, c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                  type={c.type === 'number' ? 'number' : 'text'}
                  placeholder={c.placeholder}
                  className="w-full h-9 px-2.5 rounded-lg text-[13px] bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 placeholder:text-slate-300 transition"
                />
              </span>
            ))}
            <span className="flex items-center justify-center">
              <button onClick={() => setRows(cur.filter((_, j) => j !== i))} className="w-7 h-7 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-lg leading-none transition-colors" aria-label="Remove row">×</button>
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={() => setRows([...cur, Object.fromEntries(columns.map((c) => [c.id, c.type === 'number' ? 0 : '']))])}
          className="px-3.5 h-10 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:border-[#2084FA]/40 hover:text-[#1a6fd6] flex items-center gap-2 transition-colors"
        >
          <span className="w-5 h-5 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-sm leading-none">+</span>
          {addLabel}
        </button>
        {dirty && (
          <button
            onClick={save} disabled={saving}
            className="px-5 h-10 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-[0_6px_16px_-8px_rgba(32,132,250,0.6)] transition-all"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>
      {msg && (
        <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium border max-w-md ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ── Generic toggles: named boolean switches in one settings object ──

export function ToggleRows({ storageKey, items }: { storageKey: string; items: { id: string; label: string; desc?: string }[] }) {
  const { value, loading } = useSettingKey<Record<string, boolean>>(storageKey, {});
  const [draft, setDraft] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cur = draft ?? value ?? {};
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ [storageKey]: cur });
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
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50/60 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-slate-900">{t.label}</div>
              {t.desc && <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.desc}</div>}
            </div>
            <Field spec={{ id: t.id, label: t.label, type: 'toggle' }} value={!!cur[t.id]} onChange={(v) => setDraft({ ...cur, [t.id]: v })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        {draft && (
          <button onClick={save} disabled={saving} className="px-5 h-10 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-[0_6px_16px_-8px_rgba(32,132,250,0.6)] transition-all">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
