export interface NavChild {
  id: string;
  label: string;
}

export interface NavEntry {
  id: string;
  label: string;
  icon: string;
  quickAdd?: 'nav' | 'new';
  children?: NavChild[];
}

export const NAV_ITEMS: NavEntry[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'requests', label: 'My Requests', icon: 'requests', quickAdd: 'nav' },
  { id: 'approvals', label: 'Approvals', icon: 'approvals' },
  { id: 'items', label: 'Items', icon: 'items', quickAdd: 'new' },
  { id: 'vendors', label: 'Vendors', icon: 'vendors', quickAdd: 'new' },
  {
    id: 'procurement',
    label: 'Procurement',
    icon: 'procurement',
    children: [
      { id: 'pr', label: 'Purchase Requests' },
      { id: 'rfq', label: 'Request for Quotes' },
      { id: 'po', label: 'Purchase Orders' },
      { id: 'receives', label: 'Purchase Receives' },
    ],
  },
  {
    id: 'payables',
    label: 'Payables',
    icon: 'payables',
    children: [
      { id: 'inbox', label: 'Inbox' },
      { id: 'bills', label: 'Bills' },
      { id: 'recurring', label: 'Recurring Bills' },
      { id: 'batch', label: 'Batch Payments' },
      { id: 'payments', label: 'Payments Made' },
      { id: 'credits', label: 'Vendor Credits' },
    ],
  },
  { id: 'budgets', label: 'Budgets', icon: 'budgets' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
];

export const GROUP_START = new Set(['requests', 'items', 'procurement', 'budgets']);

export const PROCUREMENT_CHILDREN = new Set(['pr', 'rfq', 'po', 'receives']);
export const PAYABLES_CHILDREN = new Set(['inbox', 'bills', 'payments', 'recurring', 'batch', 'credits']);