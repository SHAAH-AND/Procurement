import { useState, useEffect } from 'react';
import { getTenantUsers, inviteUser, updateTenantUser, getRoles } from '../../../api';
import { getSettings, saveSettings } from '../service';
import { INPUT } from '../blocks';
import { ACCESS_MODULES, APPROVABLE, MODULE_ACTIONS, SYSTEM_ROLE_INFO, perm, type CustomRole } from '../../access/catalog';

// ── Live tenant users (backed by /api/v1/users) ──

export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<Record<string, { departments: string[]; locations: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [acting, setActing] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', department: '', role: 'Viewer', customRole: '' });

  const load = () => {
    setLoading(true);
    Promise.all([
      getTenantUsers().then((r: any) => (Array.isArray(r) ? r : r?.data || [])),
      getRoles().then((r: any) => (Array.isArray(r) ? r : r?.data || [])).catch(() => []),
    ])
      .then(([u, ro]) => {
        setUsers(u);
        setRoles(ro);
      })
      .catch((e: any) => setError(e?.message || 'Failed to load users'))
      .finally(() => setLoading(false));
    getSettings().then((s) => {
      const deps = s['org.departments'];
      if (Array.isArray(deps)) setDepartments(deps.map((d: any) => d.name || d).filter(Boolean));
      const locs = s['org.locations'];
      if (Array.isArray(locs)) setLocations(locs.map((l: any) => l.name || l).filter(Boolean));
      if (Array.isArray(s['access.customRoles'])) setCustomRoles(s['access.customRoles']);
      if (s['access.assignments'] && typeof s['access.assignments'] === 'object') setAssignments(s['access.assignments']);
      if (s['access.scopes'] && typeof s['access.scopes'] === 'object') setScopes(s['access.scopes']);
    }).catch(() => {});
  };

  useEffect(load, []);

  const invite = async () => {
    if (!form.email.trim() || form.password.length < 8) {
      setError('Email plus an 8+ character password is required');
      return;
    }
    setActing(true);
    setError('');
    try {
      const created: any = await inviteUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || undefined,
        department: form.department || undefined,
        role: form.role || undefined,
      });
      const u = created?.data ?? created;
      if (u?.id) {
        setUsers((us) => [...us, { ...u, roles: form.role ? [form.role] : [] }]);
        // Persist a custom-role assignment alongside the system role when chosen.
        if (form.customRole) {
          const next = { ...assignments, [u.id]: form.customRole };
          setAssignments(next);
          saveSettings({ 'access.assignments': next }).catch(() => {});
        }
      } else load();
      setInviteOpen(false);
      setForm({ email: '', password: '', name: '', department: '', role: 'Viewer', customRole: '' });
      setNotice('User invited and active.');
    } catch (e: any) {
      setError(e?.message || 'Invite failed');
    } finally {
      setActing(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setActing(true);
    setError('');
    try {
      const updated: any = await updateTenantUser(editing.id, {
        name: editing.name?.trim() || undefined,
        department: editing.department || null,
        status: editing.status,
        role: editing.role === '(none)' ? null : editing.role || undefined,
      });
      const u = updated?.data ?? updated;
      if (u?.id) setUsers((us) => us.map((x) => (x.id === u.id ? u : x)));
      else load();
      // Persist custom-role assignment + segmented scope (settings store).
      try {
        const nextAssignments = { ...assignments };
        if (editing.customRole) nextAssignments[editing.id] = editing.customRole;
        else delete nextAssignments[editing.id];
        const nextScopes = {
          ...scopes,
          [editing.id]: {
            departments: editing.scopeDepartments || [],
            locations: editing.scopeLocations || [],
          },
        };
        setAssignments(nextAssignments);
        setScopes(nextScopes);
        await saveSettings({ 'access.assignments': nextAssignments, 'access.scopes': nextScopes });
      } catch { /* access extras must never block the user update */ }
      setEditing(null);
      setNotice('User updated. Role changes apply on their next login.');
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-slate-500">{users.length} user(s) in this organization.</p>
        <button
          onClick={() => { setInviteOpen(true); setError(''); }}
          className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] shadow-sm"
        >
          Invite User
        </button>
      </div>
      {error && (
        <div className="mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: 'minmax(180px,1.4fr) minmax(120px,1fr) minmax(100px,0.8fr) minmax(90px,0.7fr) 90px' }}>
          <span className="px-3 py-2.5 border-r border-slate-100">User</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Department</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Role</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Status</span>
          <span className="px-3 py-2.5" />
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No users yet.</div>
        ) : (
          users.map((u: any) => (
            <div key={u.id} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white items-center" style={{ gridTemplateColumns: 'minmax(180px,1.4fr) minmax(120px,1fr) minmax(100px,0.8fr) minmax(90px,0.7fr) 90px' }}>
              <span className="px-3 py-2 border-r border-slate-100 min-w-0">
                <span className="block font-medium text-slate-900 truncate">{u.name || u.email.split('@')[0]}</span>
                <span className="block text-xs text-slate-400 truncate">{u.email}</span>
              </span>
              <span className="px-3 py-2 border-r border-slate-100 text-slate-600 truncate">{u.department || '—'}</span>
              <span className="px-3 py-2 border-r border-slate-100 min-w-0">
                <span className="block text-slate-600 truncate">{(u.roles || []).join(', ') || '—'}</span>
                {assignments[u.id] && (
                  <span className="mt-0.5 inline-block px-1.5 py-px rounded-full bg-[#2084FA]/10 text-[#1a6fd6] text-[11px] font-semibold">
                    + {(customRoles.find((r) => r.id === assignments[u.id])?.name) || 'custom role'}
                  </span>
                )}
                {(scopes[u.id]?.departments?.length || scopes[u.id]?.locations?.length) ? (
                  <span className="block text-[11px] text-slate-400 truncate mt-0.5" title="Segmented access scope">
                    ◈ {[...(scopes[u.id]?.departments || []), ...(scopes[u.id]?.locations || [])].join(', ')}
                  </span>
                ) : null}
              </span>
              <span className="px-3 py-2 border-r border-slate-100">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${u.status === 'active' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
                  {u.status}
                </span>
              </span>
              <span className="px-3 py-2 flex justify-end">
                <button
                  onClick={() => setEditing({
                    ...u,
                    role: (u.roles || [])[0] || '(none)',
                    customRole: assignments[u.id] || '',
                    scopeDepartments: scopes[u.id]?.departments || [],
                    scopeLocations: scopes[u.id]?.locations || [],
                  })}
                  className="text-[13px] font-medium text-[#2084FA] hover:underline"
                >
                  Edit
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={() => !acting && setInviteOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Invite User</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Email<span className="text-red-600"> *</span></label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" className={`${INPUT} w-full`} />
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Temporary Password<span className="text-red-600"> *</span></label>
                <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="8+ characters" className={`${INPUT} w-full`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-slate-800 block mb-1">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${INPUT} w-full`} />
                </div>
                <div>
                  <label className="text-[13px] text-slate-800 block mb-1">Department</label>
                  <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className={`${INPUT} w-full bg-white`}>
                    <option value="">—</option>
                    {departments.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={`${INPUT} w-full bg-white`}>
                  {roles.map((r: any) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Custom role <span className="text-slate-400">(optional, adds grants)</span></label>
                <select value={form.customRole} onChange={(e) => setForm({ ...form, customRole: e.target.value })} className={`${INPUT} w-full bg-white`}>
                  <option value="">— None —</option>
                  {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setInviteOpen(false)} disabled={acting} className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium disabled:opacity-60">Cancel</button>
              <button onClick={invite} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">
                {acting ? 'Inviting…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={() => !acting && setEditing(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Edit {editing.email}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Name</label>
                <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`${INPUT} w-full`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-slate-800 block mb-1">Department</label>
                  <select value={editing.department || ''} onChange={(e) => setEditing({ ...editing, department: e.target.value })} className={`${INPUT} w-full bg-white`}>
                    <option value="">—</option>
                    {departments.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] text-slate-800 block mb-1">Role</label>
                  <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className={`${INPUT} w-full bg-white`}>
                    <option value="(none)">—</option>
                    {roles.map((r: any) => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Custom role <span className="text-slate-400">(optional, adds grants)</span></label>
                <select value={editing.customRole || ''} onChange={(e) => setEditing({ ...editing, customRole: e.target.value })} className={`${INPUT} w-full bg-white`}>
                  <option value="">— None —</option>
                  {customRoles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.grants.length} grants)</option>)}
                </select>
              </div>
              {/* Segmented access — Zoho-style record scoping */}
              <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
                <div className="text-[13px] font-semibold text-slate-800">Record access scope</div>
                <p className="text-xs text-slate-500 mt-0.5">Empty = sees all records. Selecting values restricts this user to matching departments / locations.</p>
                {departments.length > 0 && (
                  <div className="mt-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Departments</div>
                    <div className="flex flex-wrap gap-1.5">
                      {departments.map((d) => {
                        const on = (editing.scopeDepartments || []).includes(d);
                        return (
                          <button
                            key={d} type="button"
                            onClick={() => setEditing({
                              ...editing,
                              scopeDepartments: on
                                ? editing.scopeDepartments.filter((x: string) => x !== d)
                                : [...(editing.scopeDepartments || []), d],
                            })}
                            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium transition-colors ${on ? 'bg-[#2084FA] border-[#2084FA] text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {locations.length > 0 && (
                  <div className="mt-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Locations</div>
                    <div className="flex flex-wrap gap-1.5">
                      {locations.map((l) => {
                        const on = (editing.scopeLocations || []).includes(l);
                        return (
                          <button
                            key={l} type="button"
                            onClick={() => setEditing({
                              ...editing,
                              scopeLocations: on
                                ? editing.scopeLocations.filter((x: string) => x !== l)
                                : [...(editing.scopeLocations || []), l],
                            })}
                            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium transition-colors ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {departments.length === 0 && locations.length === 0 && (
                  <p className="text-xs text-slate-400 mt-2">Add Departments (Users & Roles) and Locations (Organization) to scope users.</p>
                )}
              </div>
              <div>
                <label className="text-[13px] text-slate-800 block mb-1">Status</label>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className={`${INPUT} w-full bg-white`}>
                  <option value="active">active</option>
                  <option value="invited">invited</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} disabled={acting} className="px-4 h-9 rounded-md bg-slate-100 text-slate-700 text-sm font-medium disabled:opacity-60">Cancel</button>
              <button onClick={saveEdit} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">
                {acting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roles: system permission sets (backend, read-only) + tenant custom roles ──
// Zoho parity: Admin/Approver/Purchaser/Vendor/Viewer ship with the platform;
// custom roles add a module × action grant matrix (incl. custom modules) and
// are assigned per-user from the Users page. Changed roles apply on next login.

type ModuleRow = { id: string; label: string; approvable: boolean };

export function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [custom, setCustom] = useState<CustomRole[]>([]);
  const [customModules, setCustomModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRoles()
      .then((r: any) => setRoles(Array.isArray(r) ? r : r?.data || []))
      .catch((e: any) => setError(e?.message || 'Failed to load roles'))
      .finally(() => setLoading(false));
    getSettings()
      .then((s) => {
        if (Array.isArray(s['access.customRoles'])) setCustom(s['access.customRoles']);
        if (Array.isArray(s['custom.modules'])) setCustomModules(s['custom.modules']);
      })
      .catch(() => {});
  }, []);

  const persist = async (next: CustomRole[]) => {
    setSaving(true);
    setError('');
    try {
      await saveSettings({ 'access.customRoles': next });
      setCustom(next);
      setEditing(null);
      setNotice('Role saved. It applies to assigned users on their next login.');
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const moduleRows: ModuleRow[] = [
    ...ACCESS_MODULES.map((m) => ({
      id: m.id,
      label: m.label,
      approvable: (APPROVABLE as string[]).includes(m.id),
    })),
    ...customModules
      .filter((m: any) => m?.id && m?.name)
      .map((m: any) => ({ id: `custom:${m.id}`, label: `${m.name} (custom)`, approvable: false })),
  ];

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-4xl space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="rounded-xl px-4 py-2.5 text-sm font-medium border bg-emerald-50 border-emerald-200 text-emerald-800 flex items-center justify-between gap-3" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Custom roles */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[14px] font-bold text-slate-900">Custom roles</h3>
            <p className="text-[12.5px] text-slate-500 mt-0.5">Tenant-defined grant matrix. Assign them per user on the Users page.</p>
          </div>
          <button
            onClick={() => setEditing({ id: `role-${Date.now()}`, name: '', description: '', grants: [] })}
            className="px-4 h-9 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] shadow-sm"
          >
            New Role
          </button>
        </div>
        {custom.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <p className="text-[13.5px] font-semibold text-slate-800">No custom roles yet</p>
            <p className="text-[12.5px] text-slate-500 mt-1">Create one — or clone a system role below as a starting point.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {custom.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold text-slate-900">{r.name}</div>
                  {r.description && <div className="text-xs text-slate-500 mt-0.5 truncate">{r.description}</div>}
                  <div className="text-[11.5px] text-slate-400 mt-1 tabular-nums">{r.grants.length} grant{r.grants.length === 1 ? '' : 's'}</div>
                </div>
                <button
                  onClick={() => setEditing({ ...r, grants: [...r.grants] })}
                  className="px-3.5 h-9 rounded-xl border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 hover:border-[#2084FA]/40 hover:text-[#1a6fd6] transition-colors"
                >
                  Edit matrix
                </button>
                <button
                  onClick={() => persist(custom.filter((x) => x.id !== r.id))}
                  className="w-9 h-9 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-lg leading-none transition-colors"
                  aria-label={`Delete ${r.name}`}
                  title="Delete role (users fall back to their system role)"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* System roles */}
      <section>
        <h3 className="text-[14px] font-bold text-slate-900 mb-1">System roles</h3>
        <p className="text-[12.5px] text-slate-500 mb-3">Managed by the platform. Clone one to customize.</p>
        <div className="space-y-2.5">
          {roles.map((r: any) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-slate-900">{r.name}</span>
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">System</span>
                  </div>
                  {SYSTEM_ROLE_INFO[r.name] && <div className="text-xs text-slate-500 mt-0.5">{SYSTEM_ROLE_INFO[r.name]}</div>}
                </div>
                <button
                  onClick={() => setEditing({
                    id: `role-${Date.now()}`,
                    name: `${r.name} Copy`,
                    description: `Cloned from system role ${r.name}`,
                    grants: [...(r.permissions || [])],
                  })}
                  className="px-3.5 h-9 rounded-xl border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 hover:border-[#2084FA]/40 hover:text-[#1a6fd6] transition-colors shrink-0"
                >
                  Clone
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {(r.permissions || []).map((p: string) => (
                  <span key={p} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium tabular-nums">{p}</span>
                ))}
                {(r.permissions || []).length === 0 && <span className="text-xs text-slate-400">No permissions.</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Matrix editor */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-8 px-4 pb-8 overflow-y-auto" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">{custom.some((c) => c.id === editing.id) ? 'Edit role' : 'New custom role'}</h3>
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <div>
                <label className="text-[13px] font-medium text-slate-800 block mb-1">Role name<span className="text-red-600"> *</span></label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Site Buyer — Colombo" className={`${INPUT} w-full`} />
              </div>
              <div>
                <label className="text-[13px] font-medium text-slate-800 block mb-1">Description</label>
                <input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Who gets this role?" className={`${INPUT} w-full`} />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 overflow-hidden">
              <div className="grid bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: 'minmax(160px,1.4fr) repeat(5, 64px)' }}>
                <span className="px-3.5 py-2.5">Module</span>
                {MODULE_ACTIONS.map((a) => <span key={a} className="py-2.5 text-center">{a}</span>)}
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {moduleRows.map((m) => (
                  <div key={m.id} className="grid border-b border-slate-100 last:border-0 text-[13px] hover:bg-slate-50/60" style={{ gridTemplateColumns: 'minmax(160px,1.4fr) repeat(5, 64px)' }}>
                    <span className="px-3.5 py-2 text-slate-700 font-medium truncate" title={m.id}>{m.label}</span>
                    {MODULE_ACTIONS.map((a) => {
                      const key = perm(m.id, a);
                      const on = editing.grants.includes(key);
                      const disabled = a === 'approve' && !m.approvable;
                      return (
                        <span key={a} className="flex items-center justify-center py-1.5">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={on}
                            onChange={() => setEditing({
                              ...editing,
                              grants: on ? editing.grants.filter((g) => g !== key) : [...editing.grants, key],
                            })}
                            className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA] disabled:opacity-20"
                            aria-label={`${m.label} ${a}`}
                          />
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
              <span className="text-[12px] text-slate-400 tabular-nums">{editing.grants.length} grants selected</span>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} disabled={saving} className="px-4 h-10 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold disabled:opacity-60">Cancel</button>
                <button
                  onClick={() => {
                    if (!editing.name.trim()) {
                      setError('Role name is required');
                      return;
                    }
                    const next = custom.some((c) => c.id === editing.id)
                      ? custom.map((c) => (c.id === editing.id ? editing : c))
                      : [...custom, editing];
                    persist(next);
                  }}
                  disabled={saving}
                  className="px-5 h-10 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
