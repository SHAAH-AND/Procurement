// ── Access catalog (Zoho Books + Creator parity) ─────────────────────────────
// One shared vocabulary for the whole app: modules × actions, system roles,
// custom-role + scope shapes, and the nav/settings → permission mapping that
// wires "how a user is restricted" to "what they see".

export const ACCESS_MODULES = [
  { id: 'pr', label: 'Purchase Requests' },
  { id: 'rfq', label: 'Request for Quotes' },
  { id: 'po', label: 'Purchase Orders' },
  { id: 'receives', label: 'Purchase Receives' },
  { id: 'bills', label: 'Bills' },
  { id: 'recurring', label: 'Recurring Bills' },
  { id: 'payments', label: 'Payments Made' },
  { id: 'batch', label: 'Batch Payments' },
  { id: 'credits', label: 'Vendor Credits' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'items', label: 'Items' },
  { id: 'budgets', label: 'Budgets' },
] as const;

export type AccessModuleId = (typeof ACCESS_MODULES)[number]['id'];

export const MODULE_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'] as const;
export type AccessAction = (typeof MODULE_ACTIONS)[number];

/** Modules that participate in approval flows (no self-approval). */
export const APPROVABLE: AccessModuleId[] = ['pr', 'po', 'bills', 'payments', 'credits', 'recurring', 'batch'];

export const perm = (mod: string, action: string) => `${mod}:${action}`;

// ── Custom roles (tenant-defined, stored in settings `access.customRoles`) ──

export type CustomRole = {
  id: string;
  name: string;
  description?: string;
  /** Grants like "po:view", "bills:approve", "custom:<moduleId>:view". */
  grants: string[];
};

// ── Segmented access (Zoho "segmented access control") ───────────────────────
// A scope narrows a user to records carrying matching department / location
// values. Empty lists = unrestricted.

export type AccessScope = {
  departments: string[];
  locations: string[];
};

export const EMPTY_SCOPE: AccessScope = { departments: [], locations: [] };

// ── System roles (seeded by the backend; read-only in the UI) ────────────────

export const SYSTEM_ROLE_INFO: Record<string, string> = {
  Admin: 'Full access. Manages users, settings and final-approves anything.',
  Approver: 'Views everything and approves spend. Cannot manage users/settings.',
  Purchaser: 'Transacts across procure → pay. Cannot approve or manage.',
  Vendor: 'External posture: views RFQs, orders and items shared with vendors.',
  Viewer: 'Read-only across all modules.',
};

// ── Sidebar nav id → access module (for hiding what the user cannot view) ────

export const NAV_MODULE_MAP: Record<string, AccessModuleId | null> = {
  home: null,
  requests: 'pr',
  approvals: 'pr',
  items: 'items',
  vendors: 'vendors',
  procurement: null,
  pr: 'pr',
  rfq: 'rfq',
  po: 'po',
  receives: 'receives',
  payables: null,
  inbox: 'bills',
  bills: 'bills',
  recurring: 'recurring',
  batch: 'batch',
  payments: 'payments',
  credits: 'credits',
  budgets: 'budgets',
  analytics: null,
};

/** Settings item ids that require elevated rights (everything else is visible). */
export const SETTING_ITEM_ACL: Record<string, string> = {
  users: 'users:manage',
  roles: 'users:manage',
  departments: 'settings:manage',
  subscription: 'settings:manage',
  'ai-integration': 'settings:manage',
  'dev-api': 'settings:manage',
  'dev-platform': 'settings:manage',
};
