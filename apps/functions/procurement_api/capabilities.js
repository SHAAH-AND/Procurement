'use strict';

// Capability registry — the single source of truth for what a tenant can do.
//
// This is the "feature flag" layer that lets one codebase serve every customer:
// a capability is declared once here, industry packs set sensible defaults, and
// L3 support can override any flag for a single tenant without a deploy.
//
// Resolution order (last wins):
//   1. capability default          (this file)
//   2. industry pack default       (industry-packs.js -> pack.capabilities)
//   3. per-tenant override         (Organizations.Settings.capabilities)
//
// Adding a capability: append to CAPABILITIES. Nothing else needs to change —
// the developer portal renders the registry generically and the app reads
// effective flags from /api/organizations.

const CAPABILITIES = [
  // ---- Core procure-to-pay chain ----
  { key: 'requisitions', label: 'Purchase Requests', group: 'Procurement', default: true, locked: true,
    help: 'The entry point of the procure-to-pay flow. Always on.' },
  { key: 'rfqs', label: 'Request for Quotes', group: 'Procurement', default: true,
    help: 'Competitive bidding: publish an RFQ to vendors and award the winning bid.' },
  { key: 'purchaseOrders', label: 'Purchase Orders', group: 'Procurement', default: true, locked: true,
    help: 'Formal orders issued to suppliers. Always on.' },
  { key: 'receipts', label: 'Purchase Receives (GRN)', group: 'Procurement', default: true,
    help: 'Goods receipt notes recording what physically arrived.' },

  // ---- Payables ----
  { key: 'invoices', label: 'Bills & Invoices', group: 'Payables', default: true, locked: true,
    help: 'Supplier bills. Always on.' },
  { key: 'threeWayMatch', label: '3-way matching', group: 'Payables', default: true,
    help: 'Match bill against PO and receipt, flagging discrepancies before payment.' },
  { key: 'recurringBills', label: 'Recurring bills', group: 'Payables', default: true,
    help: 'Scheduled bills for rent, subscriptions and retainers.' },
  { key: 'vendorCredits', label: 'Vendor credits', group: 'Payables', default: true,
    help: 'Credit notes offsetting future payments.' },
  { key: 'partialPayments', label: 'Partial payments', group: 'Payables', default: true,
    help: 'Allow paying a bill across several instalments.' },

  // ---- Financial control ----
  { key: 'budgets', label: 'Budgets', group: 'Financial control', default: true,
    help: 'Allocate, commit and settle spend per department.' },
  { key: 'blockOverBudget', label: 'Block over-budget requests', group: 'Financial control', default: true,
    help: 'Reject submissions that exceed the remaining department budget.' },
  { key: 'multiCurrency', label: 'Multi-currency', group: 'Financial control', default: false,
    help: 'Transact in currencies other than the base currency.' },
  { key: 'capexTracking', label: 'CapEx / OpEx classification', group: 'Financial control', default: true,
    help: 'Classify spend as capital or operating expenditure.' },

  // ---- Structure ----
  { key: 'multiProperty', label: 'Multi-property / multi-site', group: 'Structure', default: false,
    help: 'Separate budgets, requests and reporting per property. Used by hotel groups and multi-site operators.' },
  { key: 'assetRegister', label: 'Asset register', group: 'Structure', default: false,
    help: 'Track capitalised assets created from received CapEx purchases.' },
  { key: 'departments', label: 'Departments', group: 'Structure', default: true,
    help: 'Organise requests and budgets by operating department.' },

  // ---- Collaboration & extensibility ----
  { key: 'vendorPortal', label: 'Vendor portal', group: 'Collaboration', default: true,
    help: 'External portal where suppliers view RFQs, submit bids and track bills.' },
  { key: 'customModules', label: 'Custom modules', group: 'Collaboration', default: true,
    help: 'Tenant-defined record types beyond the built-in modules.' },
  { key: 'customFields', label: 'Custom fields', group: 'Collaboration', default: true,
    help: 'Add tenant-specific fields to native modules.' },
  { key: 'webhooks', label: 'Workflow webhooks', group: 'Collaboration', default: true,
    help: 'Push events to external systems on record changes.' },
  { key: 'booksIntegration', label: 'Zoho Books integration', group: 'Collaboration', default: true,
    help: 'Sync bills and payments to Zoho Books.' },

  // ---- Hotel operations ----
  // Landed cost, bills of materials and project costing used to live here for
  // the manufacturing and construction packs. Those packs are gone, and so are
  // the flags — an inert switch nothing can turn on is just a question mark in
  // the registry.
  { key: 'batchExpiry', label: 'Batch & expiry tracking', group: 'Hotel operations', default: false,
    help: 'Track lot numbers and expiry dates on receipts — perishable F&B stock.' },
  { key: 'complianceDocs', label: 'Compliance documents', group: 'Hotel operations', default: false,
    help: 'Require and expire vendor certifications (HACCP, food-safety, licences).' }
];

const CAP_BY_KEY = Object.fromEntries(CAPABILITIES.map(c => [c.key, c]));

// Capability defaults from the registry alone.
function baseDefaults() {
  const out = {};
  for (const c of CAPABILITIES) out[c.key] = !!c.default;
  return out;
}

/**
 * Resolve the effective capability set for a tenant.
 * @param {object} pack      industry pack (may declare `capabilities`)
 * @param {object} settings  Organizations.Settings (may declare `capabilities`)
 */
function resolveCapabilities(pack, settings) {
  const effective = baseDefaults();

  // 2. industry pack defaults
  const packCaps = (pack && pack.capabilities) || {};
  for (const [k, v] of Object.entries(packCaps)) {
    if (k in effective) effective[k] = !!v;
  }
  // Legacy: packs declared multiProperty at the top level before the registry.
  if (pack && pack.multiProperty) effective.multiProperty = true;

  // 3. per-tenant overrides from L3
  const tenantCaps = (settings && settings.capabilities) || {};
  for (const [k, v] of Object.entries(tenantCaps)) {
    if (k in effective) effective[k] = !!v;
  }

  // Locked capabilities can never be turned off.
  for (const c of CAPABILITIES) if (c.locked) effective[c.key] = true;

  return effective;
}

// Which layer decided each flag — drives the "Default / Industry / Override"
// labels in the L3 console so support can see why a tenant looks the way it does.
function explainCapabilities(pack, settings) {
  const packCaps = (pack && pack.capabilities) || {};
  const tenantCaps = (settings && settings.capabilities) || {};
  const out = {};
  for (const c of CAPABILITIES) {
    let source = 'default';
    if (c.key in packCaps || (c.key === 'multiProperty' && pack && pack.multiProperty)) source = 'industry';
    if (c.key in tenantCaps) source = 'override';
    if (c.locked) source = 'locked';
    out[c.key] = source;
  }
  return out;
}

module.exports = { CAPABILITIES, CAP_BY_KEY, baseDefaults, resolveCapabilities, explainCapabilities };
