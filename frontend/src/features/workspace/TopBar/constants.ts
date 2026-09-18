export const SEARCH_MODULES = [
  { id: 'dashboard', label: 'Dashboard', path: '/workspace' },
  { id: 'my-requests', label: 'My Requests', path: '/workspace/requests' },
  { id: 'approvals', label: 'Approvals', path: '/workspace/approvals' },
  { id: 'items', label: 'Items', path: '/workspace/items' },
  { id: 'vendors', label: 'Vendors', path: '/workspace/vendors' },
  { id: 'pr', label: 'Purchase Requests', path: '/workspace/pr' },
  { id: 'rfq', label: 'Request for Quotes', path: '/workspace/rfq' },
  { id: 'po', label: 'Purchase Orders', path: '/workspace/po' },
  { id: 'receives', label: 'Purchase Receives', path: '/workspace/receives' },
  { id: 'bills', label: 'Bills', path: '/workspace/bills' },
  { id: 'payments', label: 'Payments Made', path: '/workspace/payments' },
  { id: 'recurring', label: 'Recurring Bills', path: '/workspace/recurring' },
  { id: 'batch', label: 'Batch Payments', path: '/workspace/batch' },
  { id: 'budgets', label: 'Budgets', path: '/workspace/budgets' },
  { id: 'analytics', label: 'Analytics', path: '/workspace/analytics' },
] as const;

export const QUICK_CREATE = [
  { label: 'Purchase Request', path: '/workspace/pr' },
  { label: 'Request for Quote', path: '/workspace/rfq' },
  { label: 'Purchase Order', path: '/workspace/po' },
  { label: 'Purchase Receive', path: '/workspace/receives' },
  { label: 'Bill', path: '/workspace/bills' },
  { label: 'Vendor', path: '/workspace/vendors' },
  { label: 'Item', path: '/workspace/items' },
] as const;

export const APP_BASE = typeof window !== 'undefined'
  ? ((typeof window !== 'undefined' && /:(5173|5175)$/.test(window.location.port)) ? 'http://localhost:5174' : '') || window.location.origin
  : '';