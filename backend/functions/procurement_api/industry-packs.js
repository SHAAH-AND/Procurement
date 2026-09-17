'use strict';

// Hotel Management edition — configuration for a hotel group's procurement.
//
// Everything below is taken from the customer's own procurement documentation
// (the "Information required" workbook): the classification matrix, the
// property/cluster structure, the payment terms, the item-master field list,
// and the three approval routes. Where the workbook lists an explicit option
// set, that list is reproduced verbatim rather than paraphrased — these values
// end up on requisitions and purchase orders, and a hotel's chart of accounts
// is not something to improvise.

// ── Procurement Master Classification Matrix ────────────────────────────────
// Department -> primary category -> sub-categories. This is the spine of the
// item master: every item is filed under exactly one path, budgets roll up
// along it, and the dashboards group by it.
const CLASSIFICATION = [
  {
    department: 'Food & Beverage (F&B) - Culinary',
    categories: [
      { name: 'Perishables (Fresh)', expense: 'OpEx', perishable: true,
        sub: ['Fresh Vegetables & Fruits', 'Meat & Poultry', 'Seafood & Fish', 'Dairy & Eggs', 'Bakery & Pastry Items', 'Fresh Herbs'] },
      { name: 'Dry Goods & Groceries', expense: 'OpEx',
        sub: ['Rice, Grains & Pulses', 'Oils & Fats', 'Spices & Condiments', 'Canned & Preserved Foods', 'Baking Supplies', 'Sauces & Dressings'] },
      { name: 'Beverages (Non-Alcoholic)', expense: 'OpEx',
        sub: ['Soft Drinks & Juices', 'Packaged Drinking Water', 'Tea & Coffee', 'Syrups & Mixers', 'Energy Drinks'] },
      { name: 'Beverages (Alcoholic)', expense: 'OpEx',
        sub: ['Local Beer & Spirits', 'Imported Wines & Spirits', 'Liquors', 'Craft Beers', 'Champagne & Sparkling Wines'] }
    ]
  },
  {
    department: 'Food & Beverage (F&B) - Service',
    categories: [
      { name: 'Operating Supplies (F&B)', expense: 'OpEx',
        sub: ['Chinaware & Crockery', 'Glassware', 'Cutlery & Flatware', 'Holloware & Buffetware', 'Table Linen', 'Bar Tools & Accessories'] },
      { name: 'Packaging & Disposables', expense: 'OpEx',
        sub: ['Takeaway Boxes', 'Disposable Cups & Straws', 'Paper Napkins', 'Cling Wrap & Foil', 'Garbage Bags (F&B)'] }
    ]
  },
  {
    department: 'Housekeeping & Rooms',
    categories: [
      { name: 'Guest Amenities', expense: 'OpEx',
        sub: ['Toiletries (Shampoo, Soap, Dental Kits)', 'Room Stationery', 'Slipper & Laundry Bags', 'Coffee/Tea Tray Refills', 'Welcome Amenities'] },
      { name: 'Linen & Soft Furnishings', expense: 'OpEx',
        sub: ['Bed Sheets & Pillowcases', 'Duvets & Inserts', 'Bath Towels & Face Towels', 'Bathrobes', 'Curtains & Sheers', 'Pool Towels'] },
      { name: 'Cleaning & Chemicals', expense: 'OpEx',
        sub: ['Floor Cleaners & Disinfectants', 'Laundry Detergents', 'Glass Cleaners', 'Room Fresheners', 'Sanitizers', 'Cleaning Implements (Mops/Brooms)'] },
      { name: 'Guest Room Supplies', expense: 'OpEx',
        sub: ['Hangers', 'Ironing Boards & Irons', 'Hairdryers', 'Kettles', 'Minibar Refrigerators', 'In-Room Safes', 'Trash Cans'] }
    ]
  },
  {
    department: 'Engineering & Facilities',
    categories: [
      { name: 'Electrical & Lighting', expense: 'OpEx',
        sub: ['LED Bulbs & Fixtures', 'Cables & Wiring', 'Switches & Sockets', 'Circuit Breakers', 'Transformers', 'Panel Boards'] },
      { name: 'Plumbing & Sanitary', expense: 'OpEx',
        sub: ['Pipes & Fittings', 'Faucets & Valves', 'Pumps & Motors', 'Water Heater Parts', 'Sanitary Ware Spares', 'Filters'] },
      { name: 'HVAC & Refrigeration', expense: 'OpEx',
        sub: ['AC Compressors', 'Refrigerant Gases (R410a, R134a)', 'Air Filters', 'Chiller Spares', 'Thermostats', 'Ducting Supplies'] },
      { name: 'Building Maintenance & Hardware', expense: 'OpEx',
        sub: ['Paints & Thinner', 'Tiles & Adhesives', 'Woodwork & Timber', 'Hardware (Nails, Hinges, Locks)', 'Waterproofing Materials'] },
      { name: 'Energy & Utilities', expense: 'OpEx',
        sub: ['Generator Diesel/Fuel', 'Biogas Supplies', 'Solar Panel Spares', 'Capacitor Bank Components', 'LPG (Gas)'] }
    ]
  },
  {
    department: 'Front Office & Guest Services',
    categories: [
      { name: 'Front Desk Operations', expense: 'OpEx',
        sub: ['Key Cards & Encoding Systems', 'Luggage Tags', 'Registration Cards', 'Bellhop Equipment', 'Guest Signage'] }
    ]
  },
  {
    department: 'Spa, Wellness & Fitness',
    categories: [
      { name: 'Spa Consumables', expense: 'OpEx',
        sub: ['Essential Oils & Lotions', 'Massage Linens', 'Spa Robes', 'Herbal Teas', 'Candles & Aromatherapy'] },
      { name: 'Gym & Recreation', expense: 'OpEx',
        sub: ['Exercise Equipment Spares', 'Pool Chemicals (Chlorine, pH Balancing)', 'Pool Maintenance Equipment'] }
    ]
  },
  {
    department: 'Sales, Marketing & Events',
    categories: [
      { name: 'Collateral & Advertising', expense: 'OpEx',
        sub: ['Printed Brochures & Menus', 'Promotional Giveaways/Gifts', 'Banners & Event Signage', 'Photography/Videography Assets'] },
      { name: 'Event & Banquet Supplies', expense: 'OpEx',
        sub: ['Event Stage & Backdrop Materials', 'Decorative Lighting', 'Banquet Chair Covers & Sashes', 'Temporary Displays'] }
    ]
  },
  {
    department: 'Human Resources & Safety',
    categories: [
      { name: 'Uniforms & Apparel', expense: 'OpEx',
        sub: ['Kitchen Whites & Chef Wear', 'Front Office Suits', 'Housekeeping Tunic Sets', 'Engineering Overalls', 'Security Uniforms'] },
      { name: 'Staff Amenities & Canteen', expense: 'OpEx',
        sub: ['Canteen Provisions', 'Staff Locker Supplies', 'Employee Medical/First Aid Kits'] },
      { name: 'Health & Safety (HSE)', expense: 'OpEx',
        sub: ['Fire Extinguishers & Spares', 'Personal Protective Equipment (PPE)', 'First Aid Refills', 'CCTV Cameras & Security Systems'] }
    ]
  },
  {
    department: 'Information Technology (IT)',
    categories: [
      { name: 'Hardware & Infrastructure', expense: 'CapEx',
        sub: ['Workstations & Laptops', 'POS Terminals', 'Receipt Printers', 'Servers & Storage', 'Switches & Routers', 'Access Points'] },
      { name: 'Software & Consumables', expense: 'OpEx',
        sub: ['Software Licensing', 'Printer Toners & Cartridges', 'Paper Rolls (POS/Kitchen Printers)', 'Cables & Adapters'] }
    ]
  },
  {
    department: 'Administration & Legal',
    categories: [
      { name: 'General Stationery', expense: 'OpEx',
        sub: ['Printing Paper', 'Pens & Markers', 'Files & Folders', 'Office Desk Accessories', 'Envelopes'] },
      { name: 'Operating Assets / Capex', expense: 'CapEx',
        sub: ['Office Furniture', 'Safe Deposit Boxes', 'Shredders', 'Vehicles & Transport Assets'] }
    ]
  }
];

// Flatten the matrix into the shapes the rest of the app already consumes.
const DEPARTMENTS = CLASSIFICATION.map(d => d.department);
const CATEGORIES = CLASSIFICATION.flatMap(d =>
  d.categories.map(c => ({
    name: c.name,
    expense: c.expense,
    department: d.department,
    sub: c.sub,
    perishable: Boolean(c.perishable)
  }))
);

// ── Property structure ─────────────────────────────────────────────────────
// Clusters own properties; head office sees every cluster, a property user
// sees only their own. Seeded on first-run setup.
const CLUSTERS = [
  { name: 'Galle Face Hotel', properties: ['Galle Face Hotel Colombo'] },
  { name: 'Kandy hotels', properties: ['Queens Hotel Kandy', 'Suisse Hotel Kandy'] },
  { name: 'United Hotels', properties: ['EKHO Surf', 'EKHO Tissa', 'EKHO Polonnaruwa'] },
  { name: 'CHC Rest Houses', properties: ['Kithulgala', 'Belihuloya', 'Pussellawa', 'Dambulla', 'Habarana', 'Sigiriya', 'Ella', 'Weligama'] },
  { name: 'CHC Food', properties: ['Ambepussa'] }
];

// ── Expenditure classes ────────────────────────────────────────────────────
// Every requisition is one of these four. They drive the dashboard columns and
// the approval route, so they are a closed set, not free text.
const EXPENDITURE_CATEGORIES = ['Capex', 'Opex', 'Repair', 'AMC'];

// A requisition is also classified against budget, which selects the approval
// route (see WORKFLOWS below).
const BUDGET_CLASSES = [
  { key: 'budgeted', label: 'Within budget' },
  { key: 'non_budgeted', label: 'Not budgeted' },
  { key: 'budget_exceed', label: 'Exceeds budget' }
];

// ── Payment terms ──────────────────────────────────────────────────────────
const PAYMENT_TERMS = [
  'Advance 100%',
  'Advance, progressive payment',
  'Advance, progressive payment & retention',
  'Credit period',
  'Advance & Credit period',
  'Progressive payment & Credit period',
  'Letter of Credit',
  'Cash on Delivery'
];

// ── Units of measure ───────────────────────────────────────────────────────
const BASE_UOMS = ['Kilogram (Kg)', 'Liter (L)', 'Unit / Piece (Pcs)', 'Pack (Pk)', 'Box (Bx)', 'Bottle (Btl)', 'Roll'];
const PURCHASING_UOMS = ['Same as Base UOM', 'Case', 'Carton', 'Dozen', 'Crate', 'Bag / Sack'];

// ── Item master option sets ────────────────────────────────────────────────
const ITEM_TYPES = ['Raw Material', 'Operating Consumable', 'Asset', 'Service'];
const ITEM_STATUSES = ['Active', 'Inactive', 'Discontinued'];
const SUPPLIER_APPROVAL_STATUSES = ['Draft', 'Pending SCM Review', 'Pending FM Approval', 'Active', 'Blacklisted'];
const TAX_TREATMENTS = [
  'Standard VAT Applicable',
  'SSCL Applicable',
  'Tax Exempt / Zero Rated',
  'Subject to Import Duties / Custom Tariffs'
];

// ── Approval routes ────────────────────────────────────────────────────────
// Three routes, selected by the requisition's budget class. Each stage names
// the role that must act; `limitless` stages approve any value.
//
// Reconstructed from the swimlane flowcharts in the customer's workbook: the
// lanes give the actor, the connectors give the order, and every route ends at
// the point where Central Procurement takes the request to market.
const WORKFLOWS = {
  budgeted: {
    key: 'budgeted',
    label: 'Budgeted items',
    description: 'Requisition is inside an approved budget line.',
    stages: [
      { seq: 1, role: 'Head of the department', action: 'raise' },
      { seq: 2, role: 'Head of Finance', action: 'approve' },
      { seq: 3, role: 'General Manager', action: 'approve' },
      { seq: 4, role: 'Purchasing Manager', action: 'source' },
      { seq: 5, role: 'Central Procurement', action: 'negotiate' },
      { seq: 6, role: 'Procurement Committee', action: 'approve', limitless: true }
    ]
  },
  non_budgeted: {
    key: 'non_budgeted',
    label: 'Non-budgeted items',
    description: 'No budget line exists. Escalates to the Board before any sourcing begins.',
    stages: [
      { seq: 1, role: 'Head of the department', action: 'raise' },
      { seq: 2, role: 'Head of Finance', action: 'approve' },
      { seq: 3, role: 'General Manager', action: 'approve' },
      { seq: 4, role: 'VP operations / CEO', action: 'approve' },
      { seq: 5, role: 'Board of Directors', action: 'approve', limitless: true }
    ]
  },
  budget_exceed: {
    key: 'budget_exceed',
    label: 'Budget exceeded',
    description: 'Budget line exists but the request is over it. Board sign-off follows the Procurement Committee.',
    stages: [
      { seq: 1, role: 'Head of the department', action: 'raise' },
      { seq: 2, role: 'Head of Finance', action: 'approve' },
      { seq: 3, role: 'General Manager', action: 'approve' },
      { seq: 4, role: 'Purchasing Manager', action: 'source' },
      { seq: 5, role: 'Central Procurement', action: 'negotiate' },
      { seq: 6, role: 'Procurement Committee', action: 'approve' },
      { seq: 7, role: 'Board of Directors', action: 'approve', limitless: true }
    ]
  }
};

// Roles referenced by the workflows, plus the operational roles that never
// approve but do act on records.
const ROLES = [
  { name: 'Board of Directors', description: 'Final authority on non-budgeted and budget-exceeding spend', approvalLimit: null },
  { name: 'VP operations / CEO', description: 'Group operations authority', approvalLimit: null },
  { name: 'Procurement Committee', description: 'Reviews negotiated commercial terms before award', approvalLimit: null },
  { name: 'Central Procurement', description: 'Runs the sourcing event and negotiates commercial terms', approvalLimit: 0 },
  { name: 'General Manager', description: 'Property head; approves property spend', approvalLimit: null },
  { name: 'Head of Finance', description: 'Property or group finance approval', approvalLimit: null },
  { name: 'Purchasing Manager', description: 'Raises POs, receives goods, files GRNs', approvalLimit: 0 },
  { name: 'Head of the department', description: 'Raises requisitions for their department', approvalLimit: 0 },
  { name: 'Administrator', description: 'System configuration, master data and user mapping', approvalLimit: null }
];

// Access profiles, mirroring the "User profile" column of the customer's user
// list: what a person may do, independent of which role they hold.
const PROFILES = [
  { name: 'Add / View / Edit', description: 'Create and maintain records; no approval rights',
    permissions: { view: true, create: true, edit: true } },
  { name: 'Add / View / Edit / Approve', description: 'Full record access plus approval authority',
    permissions: { view: true, create: true, edit: true, approve: true } },
  { name: 'Administrator', description: 'Full access, user role mapping, system configuration and master data',
    permissions: { '*': true } }
];

const PACKS = {
  hotel: {
    key: 'hotel',
    label: 'Hotel Management & Hospitality',
    multiProperty: true,
    capabilities: {
      multiProperty: true,
      batchExpiry: true,        // perishable F&B stock
      complianceDocs: true,     // HACCP / food-safety certification
      assetRegister: true       // FF&E capitalisation
    },
    terminology: {
      vendors: 'Suppliers',
      items: 'Inventory & Supplies',
      prs: 'Purchase Requests'
    },
    departments: DEPARTMENTS,
    categories: CATEGORIES,
    classification: CLASSIFICATION,
    clusters: CLUSTERS,
    expenditureCategories: EXPENDITURE_CATEGORIES,
    budgetClasses: BUDGET_CLASSES,
    paymentTerms: PAYMENT_TERMS,
    baseUoms: BASE_UOMS,
    purchasingUoms: PURCHASING_UOMS,
    itemTypes: ITEM_TYPES,
    itemStatuses: ITEM_STATUSES,
    supplierApprovalStatuses: SUPPLIER_APPROVAL_STATUSES,
    taxTreatments: TAX_TREATMENTS,
    workflows: WORKFLOWS,
    roles: ROLES,
    profiles: PROFILES,
    // Custom fields seeded onto native modules. These carry the parts of the
    // customer's item master that do not have a dedicated column.
    customFields: [
      { module: 'items', name: 'Brand Name', type: 'text' },
      { module: 'items', name: 'Sub Category', type: 'text' },
      { module: 'items', name: 'Warranty Period', type: 'text' },
      { module: 'items', name: 'Supplier Approval Status', type: 'select', options: SUPPLIER_APPROVAL_STATUSES },
      { module: 'items', name: 'Purchasing UOM', type: 'select', options: PURCHASING_UOMS },
      { module: 'items', name: 'UOM Conversion Factor', type: 'number' },
      { module: 'items', name: 'Expected Supplier Lead Time (days)', type: 'number' },
      { module: 'items', name: 'Applicable Tax', type: 'select', options: TAX_TREATMENTS },
      { module: 'items', name: 'Maintenance Contract Eligibility', type: 'boolean' },
      { module: 'items', name: 'Perishable', type: 'boolean' },
      { module: 'items', name: 'Par Level', type: 'number' },
      { module: 'prs', name: 'Expenditure Category', type: 'select', options: EXPENDITURE_CATEGORIES },
      { module: 'prs', name: 'Budget Class', type: 'select', options: BUDGET_CLASSES.map(b => b.label) },
      { module: 'vendors', name: 'HACCP Certified', type: 'boolean' },
      { module: 'vendors', name: 'Payment Terms', type: 'select', options: PAYMENT_TERMS }
    ],
    // No sample catalogue. This edition is sold to a specific hotel group and
    // ships with their classification, not with invented stock.
    sampleItems: [],
    dashboard: {
      widgets: [
        { type: 'stat', metric: 'committed_spend' },
        { type: 'stat', metric: 'pending_spend' },
        { type: 'stat', metric: 'capex_spend' },
        { type: 'stat', metric: 'opex_spend' },
        { type: 'list', source: 'recent_prs' },
        { type: 'list', source: 'recent_pos' },
        { type: 'aging' }
      ]
    }
  }
};

function getPack() {
  // This is the Hotel Management edition. There is one pack and it is not a
  // choice — the argument is accepted and ignored so existing call sites keep
  // working, and so nothing can accidentally configure a workspace as anything
  // other than a hotel.
  return PACKS.hotel;
}

/** Sub-categories for a given primary category, or [] if unknown. */
function subCategoriesFor(categoryName) {
  const hit = CATEGORIES.find(c => c.name === categoryName);
  return hit ? hit.sub : [];
}

/** The approval route for a budget class, defaulting to the budgeted route. */
function workflowFor(budgetClass) {
  return WORKFLOWS[budgetClass] || WORKFLOWS.budgeted;
}

module.exports = {
  PACKS, getPack, subCategoriesFor, workflowFor,
  CLASSIFICATION, CATEGORIES, DEPARTMENTS, CLUSTERS,
  EXPENDITURE_CATEGORIES, BUDGET_CLASSES, PAYMENT_TERMS,
  BASE_UOMS, PURCHASING_UOMS, ITEM_TYPES, ITEM_STATUSES,
  SUPPLIER_APPROVAL_STATUSES, TAX_TREATMENTS, WORKFLOWS, ROLES, PROFILES
};
