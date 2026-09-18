import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSettings, saveSettings, getCached } from '../service';
import { INPUT } from '../blocks';

// ── Custom Module Builder (Zoho CRM modules + Creator lookup fields) ─────────
// How things connect, in one place:
//  • Users → (system role + optional custom role) → module:action grants
//    (matrix edited on the Roles page, assigned on the Users page).
//  • Modules → fields; a `lookup` field points at a standard module
//    (vendors, po, bills, …) or another custom module, forming the module
//    graph. Records store the linked record id; related lists resolve both
//    directions, Zoho-style.
// Storage: definitions in settings `custom.modules`, records in
// `custom.records.<moduleId>` — no backend migration needed.

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'lookup';

export type CustomFieldDef = {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  /** Lookup target: standard module id or `custom:<moduleId>`. */
  lookupModule?: string;
};

export type CustomModuleDef = {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  fields: CustomFieldDef[];
  createdAt: string;
};

export type CustomRecord = {
  id: string;
  values: Record<string, any>;
  createdAt: string;
};

export const STANDARD_LINKABLE = [
  { id: 'vendors', label: 'Vendors' },
  { id: 'items', label: 'Items' },
  { id: 'pr', label: 'Purchase Requests' },
  { id: 'rfq', label: 'Request for Quotes' },
  { id: 'po', label: 'Purchase Orders' },
  { id: 'receives', label: 'Purchase Receives' },
  { id: 'bills', label: 'Bills' },
  { id: 'payments', label: 'Payments Made' },
  { id: 'credits', label: 'Vendor Credits' },
  { id: 'budgets', label: 'Budgets' },
];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `field-${Date.now()}`;

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

function titleOf(mod: CustomModuleDef, rec: CustomRecord): string {
  const first = mod.fields.find((f) => f.type === 'text' || f.type === 'select' || f.type === 'textarea');
  const v = first ? rec.values[first.id] : null;
  return (typeof v === 'string' && v.trim()) || rec.id.slice(-6);
}

// ── Shared data hooks ─────────────────────────────────────────────────────────

export function useCustomModules() {
  const [modules, setModules] = useState<CustomModuleDef[]>(() => getCached('custom.modules', []));
  useEffect(() => {
    getSettings().then((s) => {
      if (Array.isArray(s['custom.modules'])) setModules(s['custom.modules']);
    }).catch(() => {});
  }, []);
  return modules.filter((m) => m?.id && m?.name && m.enabled !== false);
}

export function useAllCustomModules() {
  const [modules, setModules] = useState<CustomModuleDef[]>(() => getCached('custom.modules', []));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (Array.isArray(s['custom.modules'])) setModules(s['custom.modules']);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  return { modules, setModules, ready };
}

async function persistModules(next: CustomModuleDef[]) {
  await saveSettings({ 'custom.modules': next });
}

function recordsKey(moduleId: string) {
  return `custom.records.${moduleId}`;
}

export function useCustomRecords(moduleId: string) {
  const [records, setRecords] = useState<CustomRecord[]>(() => getCached(recordsKey(moduleId), []));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    getSettings()
      .then((s) => setRecords(Array.isArray(s[recordsKey(moduleId)]) ? s[recordsKey(moduleId)] : []))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [moduleId]);
  const persist = async (next: CustomRecord[]) => {
    setRecords(next);
    await saveSettings({ [recordsKey(moduleId)]: next });
  };
  return { records, persist, ready };
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function lookupTargets(modules: CustomModuleDef[], excludeId?: string) {
  return [
    ...STANDARD_LINKABLE.map((s) => ({ id: s.id, label: `${s.label} (standard)` })),
    ...modules
      .filter((m) => m.id !== excludeId)
      .map((m) => ({ id: `custom:${m.id}`, label: `${m.name} (custom)` })),
  ];
}

export function lookupLabel(target: string | undefined, value: any, modules: CustomModuleDef[], recordsByModule: Record<string, CustomRecord[]>): string {
  if (value == null || value === '') return '—';
  if (!target?.startsWith('custom:')) return String(value);
  const mod = modules.find((m) => m.id === target.slice(7));
  const rec = (recordsByModule[mod?.id || ''] || []).find((r) => r.id === value);
  if (!mod || !rec) return String(value).slice(-6);
  return titleOf(mod, rec);
}

/** Related lists: every lookup anywhere that points at this record. */
export function findRelated(
  modules: CustomModuleDef[],
  recordsByModule: Record<string, CustomRecord[]>,
  moduleId: string,
  recordId: string,
): { module: CustomModuleDef; field: CustomFieldDef; records: CustomRecord[] }[] {
  const out: { module: CustomModuleDef; field: CustomFieldDef; records: CustomRecord[] }[] = [];
  for (const m of modules) {
    for (const f of m.fields) {
      if (f.type !== 'lookup' || !f.lookupModule) continue;
      const pointsHere =
        f.lookupModule === `custom:${moduleId}` ||
        (f.lookupModule === moduleId && !moduleId.startsWith('custom:'));
      // Standard-module records linking here can't be enumerated from settings,
      // so related lists cover custom→(custom|standard-id) links by value match.
      if (f.lookupModule !== `custom:${moduleId}` && f.lookupModule !== moduleId) continue;
      void pointsHere;
      const hits = (recordsByModule[m.id] || []).filter((r) => r.values[f.id] === recordId);
      if (hits.length) out.push({ module: m, field: f, records: hits });
    }
  }
  return out;
}

// ── Field input (dynamic per type; lookup → dropdown of target records) ──────

export function CustomFieldInput({
  field,
  value,
  onChange,
  modules,
  recordsByModule,
}: {
  field: CustomFieldDef;
  value: any;
  onChange: (v: any) => void;
  modules: CustomModuleDef[];
  recordsByModule: Record<string, CustomRecord[]>;
}) {
  if (field.type === 'textarea') {
    return <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={2} className={`${INPUT} w-full`} />;
  }
  if (field.type === 'number') {
    return (
      <input
        type="number" value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={`${INPUT} w-full`}
      />
    );
  }
  if (field.type === 'date') {
    return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full`} />;
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2.5 text-[13px] text-slate-800 cursor-pointer py-1">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full bg-white`}>
        <option value="">— Select —</option>
        {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'lookup') {
    const target = field.lookupModule;
    if (target?.startsWith('custom:')) {
      const mod = modules.find((m) => m.id === target.slice(7));
      const opts = mod ? recordsByModule[mod.id] || [] : [];
      return (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full bg-white`}>
          <option value="">— Select {mod?.name || 'record'} —</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{mod ? titleOf(mod, r) : r.id}</option>)}
        </select>
      );
    }
    const std = STANDARD_LINKABLE.find((s) => s.id === target);
    return (
      <input
        value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        placeholder={std ? `Link a ${std.label} record (paste ref / name)` : 'Linked record reference'}
        className={`${INPUT} w-full`}
      />
    );
  }
  return (
    <input
      value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      placeholder={field.label} className={`${INPUT} w-full`}
    />
  );
}

// ── Records manager (list + add/edit + related lists) ────────────────────────

export function CustomModuleRecords({
  mod,
  modules,
  recordsByModule,
  compact,
}: {
  mod: CustomModuleDef;
  modules: CustomModuleDef[];
  recordsByModule: Record<string, CustomRecord[]>;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { records, persist, ready } = useCustomRecords(mod.id);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<{ id?: string; values: Record<string, any> } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allByModule: Record<string, CustomRecord[]> = { ...recordsByModule, [mod.id]: records };

  const save = async () => {
    setError('');
    for (const f of mod.fields) {
      if (f.required && (draft?.values[f.id] === '' || draft?.values[f.id] == null)) {
        setError(`"${f.label}" is required`);
        return;
      }
    }
    setSaving(true);
    try {
      const next = draft?.id
        ? records.map((r) => (r.id === draft.id ? { ...r, values: draft.values } : r))
        : [...records, { id: uid('rec'), values: draft?.values || {}, createdAt: new Date().toISOString() }];
      await persist(next);
      setFormOpen(false);
      setDraft(null);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (ready && records.length === 0 && !formOpen) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
        <p className="text-[13.5px] font-semibold text-slate-800">No {mod.name} records yet</p>
        <p className="text-[12.5px] text-slate-500 mt-1">{mod.fields.length} field{mod.fields.length === 1 ? '' : 's'} defined{mod.fields.some((f) => f.type === 'lookup') ? ' · lookups will link across modules' : ''}.</p>
        <button
          onClick={() => { setDraft({ values: {} }); setFormOpen(true); }}
          className="mt-3 px-4 h-9 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6]"
        >
          Add {mod.name}
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-xl px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800" role="alert">{error}</div>
      )}
      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="grid bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: `minmax(140px,1.2fr) repeat(${Math.min(mod.fields.length, 3)}, minmax(100px,1fr)) 120px` }}>
          <span className="px-3.5 py-2.5">{mod.name}</span>
          {mod.fields.slice(0, 3).map((f) => <span key={f.id} className="px-3.5 py-2.5 truncate">{f.label}</span>)}
          <span />
        </div>
        {!ready ? (
          <div className="py-8 text-center text-[13px] text-slate-400">Loading…</div>
        ) : (
          records.map((r) => {
            const related = findRelated(modules, allByModule, mod.id, r.id);
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="border-b border-slate-100 last:border-0">
                <div className="grid items-center text-[13px] hover:bg-slate-50/60" style={{ gridTemplateColumns: `minmax(140px,1.2fr) repeat(${Math.min(mod.fields.length, 3)}, minmax(100px,1fr)) 120px` }}>
                  <span className="px-3.5 py-2.5 font-semibold text-slate-900 truncate">{titleOf(mod, r)}</span>
                  {mod.fields.slice(0, 3).map((f) => (
                    <span key={f.id} className="px-3.5 py-2.5 text-slate-600 truncate">
                      {f.type === 'lookup'
                        ? lookupLabel(f.lookupModule, r.values[f.id], modules, allByModule)
                        : f.type === 'checkbox'
                          ? r.values[f.id] ? 'Yes' : 'No'
                          : String(r.values[f.id] ?? '—')}
                    </span>
                  ))}
                  <span className="px-3.5 py-2 flex items-center justify-end gap-1">
                    {related.length > 0 && (
                      <button
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="text-[11.5px] font-semibold text-[#1a6fd6] hover:underline"
                        title="Show linked records"
                      >
                        {related.reduce((n, g) => n + g.records.length, 0)} links
                      </button>
                    )}
                    <button onClick={() => { setDraft({ id: r.id, values: { ...r.values } }); setFormOpen(true); }} className="text-[12.5px] font-semibold text-slate-500 hover:text-[#1a6fd6] px-1.5">Edit</button>
                    <button
                      onClick={() => persist(records.filter((x) => x.id !== r.id))}
                      className="text-slate-300 hover:text-rose-600 text-lg leading-none px-1"
                      aria-label="Delete record"
                    >
                      ×
                    </button>
                  </span>
                </div>
                {isOpen && (
                  <div className="px-3.5 pb-3 pt-1 bg-slate-50/60">
                    {related.map((g) => (
                      <div key={`${g.module.id}-${g.field.id}`} className="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          {g.module.name} · via {g.field.label}
                        </div>
                        {g.records.map((rel) => (
                          <button
                            key={rel.id}
                            onClick={() => navigate(`/workspace/custom/${g.module.id}`)}
                            className="block text-[12.5px] font-medium text-[#1a6fd6] hover:underline mt-0.5"
                          >
                            {titleOf(g.module, rel)} →
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {!compact && (
        <button
          onClick={() => { setDraft({ values: {} }); setFormOpen(true); setError(''); }}
          className="mt-3 px-3.5 h-10 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:border-[#2084FA]/40 hover:text-[#1a6fd6] flex items-center gap-2 transition-colors"
        >
          <span className="w-5 h-5 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-sm leading-none">+</span>
          Add {mod.name}
        </button>
      )}

      {formOpen && draft && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={() => !saving && (setFormOpen(false), setDraft(null))}>
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">{draft.id ? 'Edit' : 'Add'} {mod.name}</h3>
            <div className="mt-4 space-y-3.5">
              {mod.fields.map((f) => (
                <div key={f.id}>
                  {f.type !== 'checkbox' && (
                    <label className="text-[13px] font-medium text-slate-800 flex items-center gap-1.5 mb-1">
                      {f.label}
                      {f.required && <span className="text-red-600">*</span>}
                      {f.type === 'lookup' && (
                        <span className="text-[10.5px] font-semibold text-[#1a6fd6] bg-[#2084FA]/10 rounded-full px-1.5 py-px">
                          ⇄ {lookupTargets(modules, mod.id).find((t) => t.id === f.lookupModule)?.label || f.lookupModule}
                        </span>
                      )}
                    </label>
                  )}
                  <CustomFieldInput field={f} value={draft.values[f.id]} onChange={(v) => setDraft({ ...draft, values: { ...draft.values, [f.id]: v } })} modules={modules} recordsByModule={allByModule} />
                </div>
              ))}
              {mod.fields.length === 0 && <p className="text-[13px] text-slate-400">Add fields to this module first.</p>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => (setFormOpen(false), setDraft(null))} disabled={saving} className="px-4 h-10 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold disabled:opacity-60">Cancel</button>
              <button onClick={save} disabled={saving} className="px-5 h-10 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Module builder modal ──────────────────────────────────────────────────────

function ModuleBuilder({
  initial,
  modules,
  onSave,
  onCancel,
  saving,
}: {
  initial: CustomModuleDef;
  modules: CustomModuleDef[];
  onSave: (m: CustomModuleDef) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<CustomModuleDef>(initial);
  const [error, setError] = useState('');

  const setField = (fid: string, patch: Partial<CustomFieldDef>) =>
    setDraft({ ...draft, fields: draft.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) });

  const addField = () =>
    setDraft({ ...draft, fields: [...draft.fields, { id: uid('fld'), label: '', type: 'text' as FieldType }] });

  const save = () => {
    if (!draft.name.trim()) {
      setError('Module name is required');
      return;
    }
    for (const f of draft.fields) {
      if (!f.label.trim()) {
        setError('Every field needs a label');
        return;
      }
      if (f.type === 'select' && !(f.options || []).filter((o) => o.trim()).length) {
        setError(`Select field "${f.label}" needs at least one option`);
        return;
      }
      if (f.type === 'lookup' && !f.lookupModule) {
        setError(`Lookup field "${f.label}" needs a target module`);
        return;
      }
    }
    onSave({
      ...draft,
      id: draft.id || slug(draft.name),
      name: draft.name.trim(),
      fields: draft.fields.map((f) => ({
        ...f,
        id: f.id || slug(f.label),
        label: f.label.trim(),
        options: f.type === 'select' ? (f.options || []).map((o) => o.trim()).filter(Boolean) : undefined,
        lookupModule: f.type === 'lookup' ? f.lookupModule : undefined,
      })),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-8 px-4 pb-8 overflow-y-auto" onClick={() => !saving && onCancel()}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900">{initial.id ? 'Edit module' : 'New custom module'}</h3>
        <p className="text-[12.5px] text-slate-500 mt-0.5">Fields become the record form. <span className="font-semibold text-slate-600">Lookup</span> fields connect this module to standard or custom modules.</p>
        {error && <div className="mt-3 rounded-xl px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800" role="alert">{error}</div>}
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-[13px] font-medium text-slate-800 block mb-1">Module name<span className="text-red-600"> *</span></label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Site Inspections" className={`${INPUT} w-full`} />
          </div>
          <div>
            <label className="text-[13px] font-medium text-slate-800 block mb-1">Description</label>
            <input value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What is tracked here?" className={`${INPUT} w-full`} />
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Fields ({draft.fields.length})</div>
          <div className="space-y-2.5">
            {draft.fields.map((f) => (
              <div key={f.id} className="rounded-2xl border border-slate-200 p-3.5 bg-slate-50/40">
                <div className="grid sm:grid-cols-[1fr_150px_auto] gap-2 items-center">
                  <input value={f.label} onChange={(e) => setField(f.id, { label: e.target.value })} placeholder="Field label" className={`${INPUT} w-full bg-white`} />
                  <select value={f.type} onChange={(e) => setField(f.id, { type: e.target.value as FieldType })} className={`${INPUT} w-full bg-white`}>
                    <option value="text">Text</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Dropdown</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="lookup">Lookup ⇄</option>
                  </select>
                  <button onClick={() => setDraft({ ...draft, fields: draft.fields.filter((x) => x.id !== f.id) })} className="w-9 h-9 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-lg leading-none justify-self-end" aria-label="Remove field">×</button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={!!f.required} onChange={(e) => setField(f.id, { required: e.target.checked })} className="w-3.5 h-3.5 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" />
                    Required
                  </label>
                  {f.type === 'select' && (
                    <input
                      value={(f.options || []).join(', ')}
                      onChange={(e) => setField(f.id, { options: e.target.value.split(',').map((o) => o.trim()) })}
                      placeholder="Options, comma separated"
                      className={`${INPUT} flex-1 min-w-[200px] bg-white !h-9 text-[13px]`}
                    />
                  )}
                  {f.type === 'lookup' && (
                    <select
                      value={f.lookupModule || ''}
                      onChange={(e) => setField(f.id, { lookupModule: e.target.value })}
                      className={`${INPUT} flex-1 min-w-[200px] bg-white !h-9 text-[13px]`}
                    >
                      <option value="">— Connect to module —</option>
                      {lookupTargets(modules, draft.id).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button onClick={addField} className="mt-2.5 px-3.5 h-9 rounded-xl border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-600 hover:border-[#2084FA]/50 hover:text-[#1a6fd6] transition-colors">
            + Add field
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} disabled={saving} className="px-4 h-10 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold disabled:opacity-60">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 h-10 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Module'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overview: standard directory + custom builder (settings entry point) ─────

const STANDARD_MODULES: { title: string; desc: string; path: string }[] = [
  { title: 'Vendors', desc: 'Supplier directory and contacts', path: '/workspace/vendors' },
  { title: 'Items', desc: 'Catalog of purchasable items', path: '/workspace/items' },
  { title: 'Purchase Requests', desc: 'Internal spend requests', path: '/workspace/pr' },
  { title: 'Request for Quotes', desc: 'Supplier quotations', path: '/workspace/rfq' },
  { title: 'Purchase Orders', desc: 'Orders sent to vendors', path: '/workspace/po' },
  { title: 'Purchase Receives', desc: 'Goods receipts', path: '/workspace/receives' },
  { title: 'Bills', desc: 'Vendor bills and payables', path: '/workspace/bills' },
  { title: 'Recurring Bills', desc: 'Repeating bill schedules', path: '/workspace/recurring' },
  { title: 'Payments Made', desc: 'Recorded vendor payments', path: '/workspace/payments' },
  { title: 'Batch Payments', desc: 'Grouped payment runs', path: '/workspace/batch' },
  { title: 'Vendor Credits', desc: 'Credit notes and adjustments', path: '/workspace/credits' },
  { title: 'Budgets', desc: 'Fiscal spend envelopes', path: '/workspace/budgets' },
  { title: 'Reports Center', desc: 'Spend analytics', path: '/workspace/analytics' },
];

export function CustomModulesOverview() {
  const navigate = useNavigate();
  const { modules, setModules, ready } = useAllCustomModules();
  const [builder, setBuilder] = useState<CustomModuleDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openRecords, setOpenRecords] = useState<string | null>(null);
  const [recordsByModule, setRecordsByModule] = useState<Record<string, CustomRecord[]>>({});

  useEffect(() => {
    getSettings().then((s) => {
      const out: Record<string, CustomRecord[]> = {};
      for (const k of Object.keys(s)) {
        if (k.startsWith('custom.records.')) out[k.slice('custom.records.'.length)] = Array.isArray(s[k]) ? s[k] : [];
      }
      setRecordsByModule(out);
    }).catch(() => {});
  }, [modules]);

  const saveModule = async (m: CustomModuleDef) => {
    setSaving(true);
    setError('');
    try {
      const exists = modules.some((x) => x.id === m.id);
      const withFlag: CustomModuleDef = { ...m, enabled: m.enabled !== false, createdAt: m.createdAt || new Date().toISOString() };
      const next = exists ? modules.map((x) => (x.id === m.id ? withFlag : x)) : [...modules, withFlag];
      await persistModules(next);
      setModules(next);
      setBuilder(null);
      setNotice(exists ? 'Module updated.' : `Module "${m.name}" created. Open its records to start tracking.`);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeModule = async (id: string) => {
    if (!window.confirm('Delete this module and all its records?')) return;
    const next = modules.filter((m) => m.id !== id);
    await persistModules(next);
    setModules(next);
    await saveSettings({ [recordsKey(id)]: [] }).catch(() => {});
  };

  return (
    <div>
      {error && <div className="mb-3 rounded-xl px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 max-w-3xl" role="alert">{error}</div>}
      {notice && (
        <div className="mb-3 rounded-xl px-4 py-2.5 text-sm font-medium border bg-emerald-50 border-emerald-200 text-emerald-800 max-w-3xl flex items-center justify-between gap-3" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Custom modules */}
      <div className="flex items-center justify-between mb-3 max-w-3xl">
        <p className="text-[13px] text-slate-500">
          <span className="font-bold text-slate-900 tabular-nums">{modules.length}</span> custom module{modules.length === 1 ? '' : 's'} · lookup fields link them to standard modules and each other.
        </p>
        <button
          onClick={() => setBuilder({ id: '', name: '', description: '', enabled: true, fields: [], createdAt: '' })}
          className="px-4 h-9 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] shadow-sm shrink-0"
        >
          New Module
        </button>
      </div>
      {ready && modules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center max-w-3xl mb-6">
          <p className="text-[13.5px] font-semibold text-slate-800">Track anything the standard modules don’t cover</p>
          <p className="text-[12.5px] text-slate-500 mt-1">E.g. Site Inspections with a lookup to Purchase Orders, or Asset Tags with a lookup to Vendors.</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-w-3xl mb-6">
          {modules.map((m) => {
            const lookups = m.fields.filter((f) => f.type === 'lookup');
            const count = (recordsByModule[m.id] || []).length;
            const open = openRecords === m.id;
            return (
              <div key={m.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => navigate(`/workspace/custom/${m.id}`)} className="flex-1 min-w-0 text-left group">
                    <span className="block text-[13.5px] font-bold text-slate-900 group-hover:text-[#1a6fd6] transition-colors">{m.name}</span>
                    <span className="block text-xs text-slate-500 truncate mt-0.5">
                      {m.description || 'Custom module'} · {m.fields.length} fields · <span className="tabular-nums">{count}</span> records
                      {lookups.length > 0 && <span className="text-[#1a6fd6]"> · ⇄ {lookups.map((l) => l.label).join(', ')}</span>}
                    </span>
                  </button>
                  <button onClick={() => setOpenRecords(open ? null : m.id)} className="text-[12.5px] font-semibold text-slate-500 hover:text-[#1a6fd6] px-1.5">
                    {open ? 'Hide records' : 'Records'}
                  </button>
                  <button onClick={() => setBuilder({ ...m, fields: m.fields.map((f) => ({ ...f })) })} className="px-3 h-8 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:border-[#2084FA]/40 hover:text-[#1a6fd6] transition-colors">
                    Edit
                  </button>
                  <button onClick={() => removeModule(m.id)} className="text-slate-300 hover:text-rose-600 text-lg leading-none px-1" aria-label={`Delete ${m.name}`}>×</button>
                </div>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                    <CustomModuleRecords mod={m} modules={modules} recordsByModule={recordsByModule} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Standard directory */}
      <p className="text-[13px] text-slate-500 mb-3 max-w-3xl">
        {STANDARD_MODULES.length} standard modules ship with this workspace. Custom modules above can look up any of these.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 max-w-3xl">
        {STANDARD_MODULES.map((m) => (
          <button
            key={m.path}
            onClick={() => navigate(m.path)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-[#2084FA]/40 hover:bg-blue-50/30 text-left transition-colors"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-slate-900">{m.title}</span>
              <span className="block text-xs text-slate-400 truncate">{m.desc}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-300 shrink-0"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ))}
      </div>

      {builder && (
        <ModuleBuilder
          initial={builder}
          modules={modules}
          saving={saving}
          onCancel={() => setBuilder(null)}
          onSave={saveModule}
        />
      )}
    </div>
  );
}

// ── Standalone records route: /workspace/custom/:moduleId ────────────────────

export function CustomModuleRecordsPage() {
  const navigate = useNavigate();
  const { moduleId } = useParams<{ moduleId: string }>();
  const { modules, ready } = useAllCustomModules();
  const [recordsByModule, setRecordsByModule] = useState<Record<string, CustomRecord[]>>({});

  useEffect(() => {
    getSettings().then((s) => {
      const out: Record<string, CustomRecord[]> = {};
      for (const k of Object.keys(s)) {
        if (k.startsWith('custom.records.')) out[k.slice('custom.records.'.length)] = Array.isArray(s[k]) ? s[k] : [];
      }
      setRecordsByModule(out);
    }).catch(() => {});
  }, [moduleId]);

  if (!ready) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;
  const mod = modules.find((m) => m.id === moduleId && m.enabled !== false);
  if (!mod) {
    return (
      <div className="py-16 text-center">
        <p className="text-[14px] font-semibold text-slate-800">Module not found</p>
        <button onClick={() => navigate('/workspace/settings/custom-overview')} className="mt-3 text-[13px] font-semibold text-[#2084FA] hover:underline">
          Open module settings
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <button onClick={() => navigate('/workspace/settings/custom-overview')} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-[#1a6fd6] transition-colors mb-3">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
        Module settings
      </button>
      <h1 className="text-[20px] font-bold text-slate-900 tracking-tight">{mod.name}</h1>
      <p className="text-[13px] text-slate-500 mt-0.5 mb-5">{mod.description || 'Custom module records.'}</p>
      <CustomModuleRecords mod={mod} modules={modules} recordsByModule={recordsByModule} />
    </div>
  );
}
