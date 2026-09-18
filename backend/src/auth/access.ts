import { ForbiddenException } from '@nestjs/common';

// ── ProcureFlow access model (Zoho Books + Creator parity) ───────────────────
// Permission = `<module>:<action>`. Modules mirror the procurement graph
// (pr → rfq → po → receives → bills → payments, plus credits/vendors/items/
// budgets). Custom modules reuse the same shape: `custom:<moduleId>:<action>`.
// Actions: view / create / edit / delete / approve, plus manage for the two
// admin areas (users, settings).
//
// Two enforcement notes:
//  • JWT snapshots carry roles+permissions; changed roles apply on next login.
//  • Users with NO roles are bootstrap/legacy accounts and are allowed through
//    (org creators predate roles; signup now assigns Admin going forward).
// ─────────────────────────────────────────────────────────────────────────────

export const ACCESS_MODULES = [
  'pr',
  'rfq',
  'po',
  'receives',
  'bills',
  'recurring',
  'payments',
  'batch',
  'credits',
  'vendors',
  'items',
  'budgets',
] as const;

export const APPROVABLE = ['pr', 'po', 'bills', 'payments', 'credits', 'recurring', 'batch'] as const;

// Legacy flat actions (seeded before the matrix existed) — kept as aliases so
// old grants keep working. New code should use the matrix form.
const LEGACY_ALIASES: Record<string, string> = {
  'bills:create': 'bills:create',
  'bills:approve': 'bills:approve',
  'po:create': 'po:create',
  'po:approve': 'po:approve',
  'vendors:manage': 'vendors:view',
  'payments:make': 'payments:create',
};

function matrixPerms(mods: readonly string[], actions: string[]): string[] {
  const out: string[] = [];
  for (const m of mods) for (const a of actions) out.push(`${m}:${a}`);
  return out;
}

const FULL_MATRIX = [
  ...matrixPerms(ACCESS_MODULES, ['view', 'create', 'edit', 'delete']),
  ...matrixPerms(APPROVABLE, ['approve']),
  'reports:view',
  'settings:manage',
  'users:manage',
];

const VIEW_ALL = matrixPerms(ACCESS_MODULES, ['view']);

export const DEFAULT_ROLES: { name: string; permissions: string[] }[] = [
  // Super Admin / org creator. Full matrix + legacy aliases.
  {
    name: 'Admin',
    permissions: [...FULL_MATRIX, ...Object.keys(LEGACY_ALIASES)],
  },
  // Can approve spend + see everything, but cannot manage users/settings.
  {
    name: 'Approver',
    permissions: [
      ...VIEW_ALL,
      ...matrixPerms(APPROVABLE, ['approve']),
      'reports:view',
      'bills:approve',
      'po:approve',
    ],
  },
  // Day-to-day buyer: transact across the procure→pay chain, no approvals.
  {
    name: 'Purchaser',
    permissions: [
      ...matrixPerms(['pr', 'rfq', 'po', 'receives', 'vendors', 'items'], ['view', 'create', 'edit']),
      ...matrixPerms(['bills', 'payments'], ['view', 'create']),
      ...matrixPerms(['budgets'], ['view']),
      'reports:view',
      'bills:create',
      'po:create',
      'vendors:manage',
      'payments:make',
    ],
  },
  // External supplier posture (portal/RFQ collaboration).
  {
    name: 'Vendor',
    permissions: [...matrixPerms(['rfq', 'po', 'items'], ['view']), 'reports:view'],
  },
  // Read-only.
  { name: 'Viewer', permissions: [...VIEW_ALL, 'reports:view'] },
];

export async function ensureRoles(prisma: any) {
  for (const r of DEFAULT_ROLES) {
    let role = await prisma.role.findUnique({ where: { name: r.name } });
    if (!role) role = await prisma.role.create({ data: { name: r.name } });
    for (const action of r.permissions) {
      let perm = await prisma.permission.findUnique({ where: { action } });
      if (!perm) perm = await prisma.permission.create({ data: { action } });
      const link = await prisma.rolePermission.findFirst({ where: { roleId: role.id, permissionId: perm.id } });
      if (!link) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
  }
}

export type AccessUser = {
  userId: string;
  roles?: string[];
  permissions?: string[];
};

export function userPermissions(user: AccessUser | undefined): string[] {
  return Array.isArray(user?.permissions) ? user!.permissions! : [];
}

export function userRoles(user: AccessUser | undefined): string[] {
  return Array.isArray(user?.roles) ? user!.roles! : [];
}

/** Bootstrap/legacy accounts (no roles assigned yet) pass through as admins. */
export function isBootstrap(user: AccessUser | undefined): boolean {
  return userRoles(user).length === 0;
}

export function isAdmin(user: AccessUser | undefined): boolean {
  if (isBootstrap(user)) return true;
  const roles = userRoles(user);
  const perms = userPermissions(user);
  return roles.includes('Admin') || perms.includes('users:manage');
}

/** Throw 403 unless the caller holds one of the actions (or is bootstrap). */
export function assertCan(user: AccessUser | undefined, ...actions: string[]) {
  if (isBootstrap(user)) return;
  const perms = new Set(userPermissions(user));
  // Legacy alias tolerance: vendors:manage ⇔ vendors:view etc.
  const expanded = new Set(perms);
  for (const [legacy, canonical] of Object.entries(LEGACY_ALIASES)) {
    if (perms.has(legacy)) expanded.add(canonical);
    if (perms.has(canonical) && legacy === 'vendors:manage') expanded.add(legacy);
  }
  if (!actions.some((a) => expanded.has(a))) {
    throw new ForbiddenException(`Requires ${actions.join(' or ')} permission`);
  }
}

/**
 * Separation of duties (Zoho parity): the requestor cannot approve their own
 * record. Admins may final-approve anything (Zoho "Final Approve").
 */
export function assertNotSelfApprover(user: AccessUser | undefined, ownerId: string | null | undefined, what = 'record') {
  if (!ownerId) return;
  if (user?.userId && ownerId === user.userId && !isAdmin(user)) {
    throw new ForbiddenException(`You cannot approve your own ${what} (separation of duties)`);
  }
}
