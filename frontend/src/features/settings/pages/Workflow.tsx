import { useState } from 'react';
import { useSettingKey, saveSettings, appendLog } from '../service';
import { INPUT, ToggleRows } from '../blocks';

// Workflow rules: block or notify on bill and payment events.
// Enforced today: bill submit (block and notify) and payment record (notify).
// Other triggers are stored and shown; evaluation lands with the engine.

export type Rule = {
  id: string;
  name: string;
  trigger: string;
  threshold: number | '';
  action: string;
  enabled: boolean;
};

export const TRIGGERS = [
  { id: 'bill.submit', label: 'Bill submitted', live: true },
  { id: 'payment.record', label: 'Payment recorded', live: true },
  { id: 'bill.approve', label: 'Bill approved', live: false },
  { id: 'po.issue', label: 'PO issued', live: false },
  { id: 'bill.overdue', label: 'Bill overdue', live: false },
];

export const ACTIONS = [
  { id: 'block', label: 'Block the action', needsSubmit: true },
  { id: 'notify', label: 'Queue an in-app notice', needsSubmit: false },
];

export function WorkflowRulesPage() {
  const { value, loading } = useSettingKey<Rule[]>('auto.rules', []);
  const { value: actions } = useSettingKey<Record<string, boolean>>('auto.actions', { block: true, notify: true });
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', trigger: 'bill.submit', threshold: '', action: 'block' });

  const cur = rules ?? (Array.isArray(value) ? value : []);

  const persist = async (next: Rule[], logText?: string) => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ 'auto.rules': next });
      setRules(null);
      if (logText) await appendLog(logText);
      setMsg('Saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', trigger: 'bill.submit', threshold: '', action: 'block' });
    setModalOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditing(r);
    setForm({ name: r.name, trigger: r.trigger, threshold: r.threshold === '' ? '' : String(r.threshold), action: r.action });
    setModalOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) { setMsg('Rule needs a name.'); return; }
    if (form.threshold === '' || !(Number(form.threshold) > 0)) { setMsg('Threshold must be greater than 0.'); return; }
    const allowed = actions ?? { block: true, notify: true };
    if (!allowed[form.action]) { setMsg(`The "${form.action}" action is disabled in Workflow Actions.`); return; }
    const rule: Rule = {
      id: editing?.id || `rule-${Date.now()}`,
      name: form.name.trim(),
      trigger: form.trigger,
      threshold: Number(form.threshold),
      action: form.action,
      enabled: editing?.enabled ?? true,
    };
    const next = editing ? cur.map((r) => (r.id === editing.id ? rule : r)) : [...cur, rule];
    await persist(next, `${editing ? 'Updated' : 'Created'} rule "${rule.name}".`);
    setModalOpen(false);
    setEditing(null);
    setForm({ name: '', trigger: 'bill.submit', threshold: '', action: 'block' });
  };

  const toggleRule = async (r: Rule) => {
    const next = cur.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x));
    await persist(next, `${r.enabled ? 'Disabled' : 'Enabled'} rule "${r.name}".`);
  };

  const removeRule = async (r: Rule) => {
    if (!window.confirm(`Delete rule "${r.name}"?`)) return;
    await persist(cur.filter((x) => x.id !== r.id), `Deleted rule "${r.name}".`);
  };

  const triggerLabel = (id: string) => TRIGGERS.find((t) => t.id === id)?.label || id;
  const actionLabel = (id: string) => ACTIONS.find((a) => a.id === id)?.label || id;

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <p className="text-[13px] text-slate-500 mb-3">
        Rules evaluate bill submits and payment records live. Other triggers are stored and will light up with the engine.
      </p>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {cur.length === 0 && <div className="py-8 text-center text-[13px] text-slate-400">No rules yet.</div>}
        {cur.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 bg-white text-[13px]">
            <button
              role="switch" aria-checked={r.enabled} aria-label={`Toggle ${r.name}`}
              onClick={() => toggleRule(r)}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${r.enabled ? 'bg-[#2084FA]' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${r.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-slate-900 truncate">{r.name}</span>
              <span className="block text-xs text-slate-400">
                When {triggerLabel(r.trigger).toLowerCase()} over {Number(r.threshold).toLocaleString()} — {actionLabel(r.action).toLowerCase()}
                {!TRIGGERS.find((t) => t.id === r.trigger)?.live && ' · not enforced yet'}
              </span>
            </span>
            <button onClick={() => openEdit(r)} className="text-[13px] font-medium text-[#2084FA] hover:underline shrink-0">Edit</button>
            <button onClick={() => removeRule(r)} className="text-slate-300 hover:text-rose-500 text-lg leading-none shrink-0" aria-label={`Delete ${r.name}`}>×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={openAdd} className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
          New Rule
        </button>
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>

      {modalOpen && (
        <RuleDialog
          form={form} setForm={setForm} editing={!!editing} actions={actions ?? { block: true, notify: true }}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={saveForm} saving={saving}
        />
      )}
    </div>
  );
}

function RuleDialog({ form, setForm, editing, actions, onClose, onSave, saving }: {
  form: { name: string; trigger: string; threshold: string; action: string };
  setForm: (f: any) => void;
  editing: boolean;
  actions: Record<string, boolean>;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const triggerLive = TRIGGERS.find((t) => t.id === form.trigger)?.live;
  const baseOpts = form.trigger === 'bill.submit' ? ACTIONS : ACTIONS.filter((a) => !a.needsSubmit);
  const actionOpts = baseOpts.filter((a) => actions[a.id] !== false);
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900">{editing ? 'Edit Rule' : 'New Rule'}</h3>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[13px] text-slate-800 block mb-1">Rule Name<span className="text-red-600"> *</span></label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Block big submits" className={`${INPUT} w-full`} />
          </div>
          <div>
            <label className="text-[13px] text-slate-800 block mb-1">When</label>
            <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value, action: e.target.value === 'bill.submit' ? form.action : 'notify' })} className={`${INPUT} w-full bg-white`}>
              {TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}{t.live ? '' : ' (soon)'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[13px] text-slate-800 block mb-1">Amount Over</label>
            <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value.replace(/[^0-9.]/g, '') })} type="number" min={0} placeholder="e.g. 500000" className={`${INPUT} w-full tabular-nums`} />
          </div>
          <div>
            <label className="text-[13px] text-slate-800 block mb-1">Then</label>
            {actionOpts.length === 0 ? (
              <p className="text-[13px] text-amber-600">All actions are disabled — enable them in Workflow Actions first.</p>
            ) : (
              <select value={actionOpts.some((a) => a.id === form.action) ? form.action : actionOpts[0].id} onChange={(e) => setForm({ ...form, action: e.target.value })} className={`${INPUT} w-full bg-white`}>
                {actionOpts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            )}
            {!triggerLive && <p className="text-xs text-amber-600 mt-1">This trigger is stored but not enforced yet.</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={saving} className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium disabled:opacity-60">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowActionsPage() {
  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-slate-500 mb-3">Actions rules are allowed to take. Disabled actions cannot be picked in the rule builder.</p>
      <ToggleRows
        storageKey="auto.actions"
        items={[
          { id: 'block', label: 'Block the action', desc: 'Stops bill submits over the rule threshold.' },
          { id: 'notify', label: 'Queue an in-app notice', desc: 'Surfaces a notice to the workspace on matching events.' },
        ]}
      />
    </div>
  );
}

export function WorkflowLogsPage() {
  const { value, loading } = useSettingKey<any[]>('auto.logs', []);
  const [clearing, setClearing] = useState(false);
  const logs = Array.isArray(value) ? value : [];

  const clear = async () => {
    if (!window.confirm('Clear the automation log?')) return;
    setClearing(true);
    try {
      await saveSettings({ 'auto.logs': [] });
    } finally {
      setClearing(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-slate-500">{logs.length} entr{logs.length === 1 ? 'y' : 'ies'} — newest first.</p>
        {logs.length > 0 && (
          <button onClick={clear} disabled={clearing} className="text-[13px] text-slate-400 hover:text-rose-600 disabled:opacity-50">Clear log</button>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-slate-400">No automation activity yet — create or toggle a rule.</div>
        ) : (
          logs.map((l: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 bg-white text-[13px]">
              <span className="text-slate-400 tabular-nums text-xs whitespace-nowrap w-36">
                {l.at ? new Date(l.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              <span className="text-slate-700">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
