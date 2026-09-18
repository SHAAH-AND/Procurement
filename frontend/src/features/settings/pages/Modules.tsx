import { useNavigate } from 'react-router-dom';
import { useSettingKey, saveSettings } from '../service';
import { INPUT } from '../blocks';
import { useState } from 'react';

// ── Per-module preferences: defaults + policies + a jump to the module ──

export function ModulePrefs({ mod, title, path }: { mod: string; title: string; path: string }) {
  const navigate = useNavigate();
  const key = `modules.${mod}`;
  const { value, loading } = useSettingKey<Record<string, any>>(key, {});
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cur = draft ?? value ?? {};
  const set = (id: string, v: any) => setDraft({ ...cur, [id]: v });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ [key]: cur });
      setDraft(null);
      setMsg('Saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  const toggle = (id: string, label: string, desc?: string) => (
    <div className="flex items-center gap-4 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-slate-900">{label}</div>
        {desc && <div className="text-xs text-slate-400 mt-0.5">{desc}</div>}
      </div>
      <button
        type="button" role="switch" aria-checked={!!cur[id]} aria-label={label}
        onClick={() => set(id, !cur[id])}
        className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${cur[id] ? 'bg-[#2084FA]' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${cur[id] ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Default Payment Terms</label>
        <select value={cur.terms || ''} onChange={(e) => set('terms', e.target.value)} className={`${INPUT} w-full max-w-md mt-1.5`}>
          <option value="">Module default</option>
          {['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Advance', 'COD'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1">Prefills new {title.toLowerCase()} created from this workspace.</p>
      </div>
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Default Tax</label>
        <select value={cur.tax || ''} onChange={(e) => set('tax', e.target.value)} className={`${INPUT} w-full max-w-md mt-1.5`}>
          <option value="">Module default</option>
          {['No Tax', 'VAT 18%', 'SSCL 2.5%'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Policies</div>
        <div className="px-4 py-2">
          {toggle('requireApproval', 'Require approval', `New ${title.toLowerCase()} need approval before proceeding.`)}
          {toggle('allowPartial', 'Allow partial amounts', 'Accept partial payments or receipts on this module.')}
          {toggle('autoReminders', 'Overdue reminders', 'Remind owners when items sit too long.')}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {draft && (
          <button onClick={save} disabled={saving} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        <button onClick={() => navigate(path)} className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50">
          Open {title}
        </button>
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

// ── Directory of every module + custom builder (see CustomModules.tsx) ──

export { CustomModulesOverview } from './CustomModules';
