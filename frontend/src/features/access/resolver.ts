import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getSettings, getCached } from '../settings/service';
import { APPROVABLE, EMPTY_SCOPE, perm, type AccessAction, type AccessModuleId, type AccessScope, type CustomRole } from './catalog';

// ── Access resolution ─────────────────────────────────────────────────────────
// Grants = backend permission strings (from /auth/me) ∪ custom-role grants
// assigned via settings (`access.assignments`). Users with no system roles
// (legacy/bootstrap tenants) and demo accounts keep full access so existing
// workspaces never lock out — mirrors the backend bootstrap rule.

export type Access = {
  loading: boolean;
  /** True for demo / bootstrap users: everything is allowed. */
  full: boolean;
  grants: Set<string>;
  roles: string[];
  department: string | null;
  userId: string | null;
  scope: AccessScope;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function grantsFor(roles: string[] | undefined, permissions: string[] | undefined): Set<string> | null {
  if (!roles || roles.length === 0) return null; // bootstrap → full
  return new Set(permissions || []);
}

export function useAccess(): Access {
  const { user } = useAuth();
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(() => getCached('access.customRoles', []));
  const [assignments, setAssignments] = useState<Record<string, string>>(() => getCached('access.assignments', {}));
  const [scopes, setScopes] = useState<Record<string, AccessScope>>(() => getCached('access.scopes', {}));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (Array.isArray(s['access.customRoles'])) setCustomRoles(s['access.customRoles']);
        if (s['access.assignments'] && typeof s['access.assignments'] === 'object') setAssignments(s['access.assignments']);
        if (s['access.scopes'] && typeof s['access.scopes'] === 'object') setScopes(s['access.scopes']);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const u: any = user;
  const demo = !!u?.demo;
  const base = demo ? null : grantsFor(u?.roles, u?.permissions);
  const grants = new Set<string>(base || []);
  let full = base === null;

  const uid: string | null = u?.id || null;
  if (uid && assignments[uid]) {
    const role = customRoles.find((r) => r.id === assignments[uid]);
    if (role) for (const g of role.grants) grants.add(g);
  }

  const scope: AccessScope =
    (uid && scopes[uid]) || (u?.department ? { departments: [u.department], locations: [] } : EMPTY_SCOPE);

  return {
    loading: !ready,
    full,
    grants,
    roles: Array.isArray(u?.roles) ? u.roles : demo ? ['Admin'] : [],
    department: u?.department || null,
    userId: uid,
    scope,
  };
}

/** Core check: does this access allow `action` on `mod` (or custom:<id>)? */
export function canDo(access: Pick<Access, 'full' | 'grants'>, mod: string, action: AccessAction): boolean {
  if (access.full) return true;
  const g = access.grants;
  // Direct grant, legacy aliases, and admin override.
  if (g.has(perm(mod, action))) return true;
  if (mod === 'vendors' && action === 'view' && g.has('vendors:manage')) return true;
  if (mod === 'payments' && action === 'create' && g.has('payments:make')) return true;
  if ((mod === 'bills' || mod === 'po') && action === 'create' && g.has(perm(mod, 'create'))) return true;
  if (action === 'view' && (g.has('users:manage') || g.has('settings:manage'))) return true;
  return false;
}

export function useCan(mod: string, action: AccessAction): boolean {
  const access = useAccess();
  if (access.loading) return false;
  return canDo(access, mod, action);
}

/** Separation of duties: approver must differ from the record owner (admins exempt). */
export function canApprove(access: Pick<Access, 'full' | 'grants' | 'roles' | 'userId'>, mod: string, ownerId?: string | null): boolean {
  if (!APPROVABLE.includes(mod as AccessModuleId)) return canDo(access, mod, 'approve');
  if (!canDo(access, mod, 'approve')) return false;
  if (access.full) return true;
  if (ownerId && access.userId && ownerId === access.userId) {
    const elevated = access.roles.includes('Admin') || access.grants.has('users:manage');
    if (!elevated) return false;
  }
  return true;
}

// ── Segmented record access ───────────────────────────────────────────────────

const RECORD_KEYS = {
  departments: ['department', 'departmentName', 'dept', 'costCenter'],
  locations: ['location', 'locationName', 'site', 'siteName', 'property', 'propertyName', 'warehouse'],
};

function recordValues(record: any, keys: string[]): string[] {
  if (!record) return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'string' && v.trim()) out.push(v.trim().toLowerCase());
  }
  return out;
}

/** Zoho-style segmented check: scoped users only see matching records. */
export function recordInScope(record: any, scope: AccessScope): boolean {
  if (!scope.departments.length && !scope.locations.length) return true;
  if (scope.departments.length) {
    const vals = recordValues(record, RECORD_KEYS.departments);
    if (vals.length > 0 && !vals.some((v) => scope.departments.map(slug).includes(slug(v)))) return false;
  }
  if (scope.locations.length) {
    const vals = recordValues(record, RECORD_KEYS.locations);
    if (vals.length > 0 && !vals.some((v) => scope.locations.map(slug).includes(slug(v)))) return false;
  }
  return true;
}

export function filterByScope<T>(rows: T[], scope: AccessScope): T[] {
  if (!scope.departments.length && !scope.locations.length) return rows;
  return rows.filter((r) => recordInScope(r, scope));
}
