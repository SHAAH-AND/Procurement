'use strict';

// Access model for the /api/v1 surface.
//
// The React client reasons in `<module>:<action>` grants (pr:create,
// bills:approve, users:manage ...). This installation stores access on the
// user's PROFILE (Profiles.Permissions), in one of three historical shapes:
//
//   { "*": true }                                    administrator
//   { view, create, edit, approve }                  flat, applies to every module
//   { prs: { view, create, ... }, pos: {...}, ... }  per-module matrix (legacy keys)
//
// All three are translated here into the grant list the client expects, so
// one profile drives both the API checks and what the UI shows.

const { forbidden } = require('./store');

const MODULES = ['pr', 'rfq', 'po', 'receives', 'bills', 'recurring', 'payments', 'batch', 'credits', 'vendors', 'items', 'budgets'];
const APPROVABLE = ['pr', 'po', 'bills', 'payments', 'credits', 'recurring', 'batch'];
const ACTIONS = ['view', 'create', 'edit', 'delete'];

// Legacy matrix keys -> v1 modules.
const LEGACY_MODULE_MAP = {
  prs: ['pr'], rfqs: ['rfq'], pos: ['po'], grns: ['receives'], invoices: ['bills'],
  payments: ['payments', 'batch', 'credits', 'recurring'], masters: ['vendors', 'items'],
  budgets: ['budgets'], custom: [], settings: [], reports: []
};

const LEGACY_ALIASES = {
  'bills:create': 'bills:create', 'bills:approve': 'bills:approve',
  'po:create': 'po:create', 'po:approve': 'po:approve',
  'vendors:manage': 'vendors:view', 'payments:make': 'payments:create'
};

function fullMatrix() {
  const out = [];
  for (const m of MODULES) for (const a of ACTIONS) out.push(`${m}:${a}`);
  for (const m of APPROVABLE) out.push(`${m}:approve`);
  out.push('reports:view', 'settings:manage', 'users:manage');
  out.push(...Object.keys(LEGACY_ALIASES));
  return out;
}

function safeParse(json, fallback) {
  try { return typeof json === 'string' ? JSON.parse(json) : (json || fallback); } catch { return fallback; }
}

function permissionsFromProfile(profile) {
  const perms = safeParse(profile && profile.Permissions, {});
  if (!perms || typeof perms !== 'object') return [];
  if (perms['*'] === true) return fullMatrix();

  const grants = new Set();
  const flatKeys = ['view', 'create', 'edit', 'delete', 'approve'];
  const isFlat = Object.keys(perms).every(k => flatKeys.includes(k));
  if (isFlat) {
    for (const m of MODULES) {
      for (const a of ACTIONS) if (perms[a] === true) grants.add(`${m}:${a}`);
    }
    if (perms.approve === true) for (const m of APPROVABLE) grants.add(`${m}:approve`);
    if (perms.view === true) grants.add('reports:view');
  } else {
    for (const [legacyKey, mod] of Object.entries(perms)) {
      if (!mod || typeof mod !== 'object') continue;
      const targets = LEGACY_MODULE_MAP[legacyKey] || (MODULES.includes(legacyKey) ? [legacyKey] : []);
      for (const t of targets) {
        for (const a of ACTIONS) if (mod[a] === true) grants.add(`${t}:${a}`);
        if (mod.approve === true && APPROVABLE.includes(t)) grants.add(`${t}:approve`);
      }
      if (legacyKey === 'settings' && (mod.edit === true || mod.create === true)) {
        grants.add('settings:manage'); grants.add('users:manage');
      }
      if (legacyKey === 'reports' && mod.view === true) grants.add('reports:view');
    }
    if (grants.size) grants.add('reports:view');
  }
  return [...grants].sort();
}

function isAdmin(user) {
  if (!user) return false;
  if (!user.roles || user.roles.length === 0) return true; // bootstrap account
  return user.roles.includes('Administrator') || user.roles.includes('Admin')
    || (user.permissions || []).includes('users:manage');
}

function expand(perms) {
  const set = new Set(perms || []);
  for (const [legacy, canonical] of Object.entries(LEGACY_ALIASES)) {
    if (set.has(legacy)) set.add(canonical);
    if (set.has(canonical) && legacy === 'vendors:manage') set.add(legacy);
  }
  return set;
}

function can(user, ...actions) {
  if (!user) return false;
  if (!user.roles || user.roles.length === 0) return true;
  const set = expand(user.permissions);
  return actions.some(a => set.has(a));
}

function assertCan(user, ...actions) {
  if (!can(user, ...actions)) {
    throw forbidden(`Requires ${actions.join(' or ')} permission`);
  }
}

// Separation of duties: the owner of a record cannot approve it, unless they
// are an administrator ("final approve").
function assertNotSelfApprover(user, ownerId, what = 'record') {
  if (!ownerId) return;
  if (user && user.userId && String(ownerId) === String(user.userId) && !isAdmin(user)) {
    throw forbidden(`You cannot approve your own ${what} (separation of duties)`);
  }
}

module.exports = { MODULES, APPROVABLE, fullMatrix, permissionsFromProfile, isAdmin, can, assertCan, assertNotSelfApprover };
