export type Data = {
  bills: any[];
  vendors: any[];
  payments: any[];
  credits: any[];
  pos: any[];
  prs: any[];
  items: any[];
  batches: any[];
};

export type Filters = { from: string; to: string; vendor: string };

export type ReportResult = {
  columns: string[];
  rows: (string | number)[][];
  summary: { label: string; value: string }[];
  note?: string;
};

export type ReportDef = {
  id: string;
  name: string;
  category: 'Payables' | 'Purchases' | 'Activity';
  needs: (keyof Data)[];
  run: (d: Data, f: Filters) => ReportResult;
};

export const REPORT_CATEGORIES = ['Payables', 'Purchases', 'Activity'] as const;

export const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (v?: any) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
};

const inRange = (v: any, f: Filters) => {
  if (!v) return true;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return true;
  if (f.from && t < day(f.from)) return false;
  if (f.to && t >= day(f.to) + 86400000) return false;
  return true;
};

const matchVendor = (name: any, f: Filters) =>
  !f.vendor || String(name || '').toLowerCase() === f.vendor.toLowerCase();

const billTotal = (b: any) =>
  Number(b.total ?? (b.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.rate || 0), 0));
const billDue = (b: any) => Number(b.balance ?? (billTotal(b) - Number(b.amountPaid || 0)));
const prTotal = (p: any) =>
  (p.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.estimatedRate ?? l.rate ?? 0), 0);
const poTotal = (p: any) =>
  (p.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.rate ?? l.estimatedRate ?? 0), 0);

const daysOverdue = (b: any) => {
  if (!b.dueDate) return 0;
  return Math.floor((Date.now() - new Date(b.dueDate).getTime()) / 86400000);
};

const UNPAID = ['open', 'overdue', 'partially_paid'];

export const REPORTS: ReportDef[] = [
  {
    id: 'vendor-balance',
    name: 'Vendor Balance Summary',
    category: 'Payables',
    needs: ['bills'],
    run: (d, f) => {
      const map = new Map<string, { billed: number; paid: number; count: number }>();
      d.bills.filter((b) => inRange(b.issueDate, f) && matchVendor(b.vendorName, f)).forEach((b) => {
        const v = b.vendorName || '—';
        const e = map.get(v) || { billed: 0, paid: 0, count: 0 };
        e.billed += billTotal(b);
        e.paid += Number(b.amountPaid || 0);
        e.count += 1;
        map.set(v, e);
      });
      const rows = [...map.entries()].map(([v, e]) => [v, e.count, fmtMoney(e.billed), fmtMoney(e.paid), fmtMoney(e.billed - e.paid)]);
      const bal = [...map.values()].reduce((s, e) => s + e.billed - e.paid, 0);
      return {
        columns: ['Vendor', 'Bills', 'Billed', 'Paid', 'Balance'],
        rows,
        summary: [
          { label: 'Vendors', value: String(map.size) },
          { label: 'Total Balance', value: fmtMoney(bal) },
        ],
      };
    },
  },
  {
    id: 'ap-aging-summary',
    name: 'AP Aging Summary',
    category: 'Payables',
    needs: ['bills'],
    run: (d, f) => {
      const buckets = [0, 0, 0, 0, 0];
      const map = new Map<string, number[]>();
      d.bills.filter((b) => UNPAID.includes(b.status) && billDue(b) > 0.005 && matchVendor(b.vendorName, f)).forEach((b) => {
        const od = daysOverdue(b);
        const i = od <= 0 ? 0 : od <= 15 ? 1 : od <= 30 ? 2 : od <= 45 ? 3 : 4;
        buckets[i] += billDue(b);
        const v = b.vendorName || '—';
        const e = map.get(v) || [0, 0, 0, 0, 0];
        e[i] += billDue(b);
        map.set(v, e);
      });
      const rows = [...map.entries()].map(([v, e]) => [v, ...e.map(fmtMoney), fmtMoney(e.reduce((s, x) => s + x, 0))]);
      return {
        columns: ['Vendor', 'Current', '1-15 Days', '16-30 Days', '31-45 Days', '> 45 Days', 'Total Due'],
        rows,
        summary: [{ label: 'Total Overdue', value: fmtMoney(buckets[1] + buckets[2] + buckets[3] + buckets[4]) }],
      };
    },
  },
  {
    id: 'ap-aging-details',
    name: 'AP Aging Details',
    category: 'Payables',
    needs: ['bills'],
    run: (d, f) => {
      const rows = d.bills
        .filter((b) => UNPAID.includes(b.status) && billDue(b) > 0.005 && matchVendor(b.vendorName, f))
        .sort((a, b) => daysOverdue(b) - daysOverdue(a))
        .map((b) => [b.billNumber || '—', b.vendorName || '—', fmtDate(b.issueDate), fmtDate(b.dueDate), Math.max(0, daysOverdue(b)), fmtMoney(billDue(b))]);
      return {
        columns: ['Bill#', 'Vendor', 'Bill Date', 'Due Date', 'Days Overdue', 'Balance'],
        rows,
        summary: [{ label: 'Unpaid Bills', value: String(rows.length) }],
      };
    },
  },
  {
    id: 'bill-details',
    name: 'Bill Details',
    category: 'Payables',
    needs: ['bills'],
    run: (d, f) => {
      const list = d.bills.filter((b) => inRange(b.issueDate, f) && matchVendor(b.vendorName, f));
      const rows = list.map((b) => [
        b.billNumber || '—', b.vendorName || '—', fmtDate(b.issueDate), fmtDate(b.dueDate),
        String(b.status || '—').replace(/_/g, ' '), fmtMoney(billTotal(b)), fmtMoney(Number(b.amountPaid || 0)), fmtMoney(billDue(b)),
      ]);
      return {
        columns: ['Bill#', 'Vendor', 'Bill Date', 'Due Date', 'Status', 'Amount', 'Paid', 'Balance'],
        rows,
        summary: [
          { label: 'Bills', value: String(list.length) },
          { label: 'Total', value: fmtMoney(list.reduce((s, b) => s + billTotal(b), 0)) },
        ],
      };
    },
  },
  {
    id: 'vendor-credit-details',
    name: 'Vendor Credit Details',
    category: 'Payables',
    needs: ['credits'],
    run: (d, f) => {
      const list = d.credits.filter((c) => inRange(c.createdAt, f) && matchVendor(c.vendorName, f));
      const rows = list.map((c: any) => [
        c.vendorName || '—', fmtDate(c.createdAt), fmtMoney(Number(c.amount) || 0),
        fmtMoney(Number(c.remaining) || 0), c.status || '—', c.source || '—',
      ]);
      return {
        columns: ['Vendor', 'Date', 'Amount', 'Remaining', 'Status', 'Source'],
        rows,
        summary: [{ label: 'Open Credit', value: fmtMoney(list.reduce((s, c: any) => s + (Number(c.remaining) || 0), 0)) }],
      };
    },
  },
  {
    id: 'payments-made',
    name: 'Payments Made',
    category: 'Payables',
    needs: ['payments', 'bills'],
    run: (d, f) => {
      const byId = new Map(d.bills.map((b: any) => [b.id, b]));
      const list = d.payments.filter((p: any) => inRange(p.paidAt || p.createdAt, f) && matchVendor(p.vendorName, f));
      const rows = list.map((p: any) => [
        fmtDate(p.paidAt || p.createdAt), p.vendorName || '—',
        (p.billId && byId.get(p.billId)?.billNumber) || p.bill?.billNumber || '—',
        p.method || '—', fmtMoney(Number(p.amount) || 0),
      ]);
      return {
        columns: ['Date', 'Vendor', 'Bill#', 'Method', 'Amount'],
        rows,
        summary: [{ label: 'Total Paid', value: fmtMoney(list.reduce((s, p: any) => s + (Number(p.amount) || 0), 0)) }],
      };
    },
  },
  {
    id: 'po-details',
    name: 'Purchase Order Details',
    category: 'Payables',
    needs: ['pos'],
    run: (d, f) => {
      const list = d.pos.filter((p: any) => inRange(p.createdAt, f) && matchVendor(p.vendorName, f));
      const rows = list.map((p: any) => [
        p.poNumber || p.number || '—', p.vendorName || '—', fmtDate(p.createdAt),
        String(p.status || '—').replace(/_/g, ' '), fmtMoney(poTotal(p)),
      ]);
      return {
        columns: ['PO#', 'Vendor', 'Date', 'Status', 'Amount'],
        rows,
        summary: [{ label: 'PO Value', value: fmtMoney(list.reduce((s, p: any) => s + poTotal(p), 0)) }],
      };
    },
  },
  {
    id: 'po-by-vendor',
    name: 'Purchase Orders by Vendor',
    category: 'Payables',
    needs: ['pos'],
    run: (d, f) => {
      const map = new Map<string, { n: number; amt: number }>();
      d.pos.filter((p: any) => inRange(p.createdAt, f) && matchVendor(p.vendorName, f)).forEach((p: any) => {
        const v = p.vendorName || '—';
        const e = map.get(v) || { n: 0, amt: 0 };
        e.n += 1;
        e.amt += poTotal(p);
        map.set(v, e);
      });
      const rows = [...map.entries()].map(([v, e]) => [v, e.n, fmtMoney(e.amt)]);
      return { columns: ['Vendor', 'Orders', 'Total'], rows, summary: [{ label: 'Vendors', value: String(map.size) }] };
    },
  },
  {
    id: 'payable-summary',
    name: 'Payable Summary',
    category: 'Payables',
    needs: ['bills', 'payments', 'credits'],
    run: (d, f) => {
      const bills = d.bills.filter((b) => inRange(b.issueDate, f) && matchVendor(b.vendorName, f));
      const billed = bills.reduce((s, b) => s + billTotal(b), 0);
      const paid = bills.reduce((s, b) => s + (Number(b.amountPaid) || 0), 0);
      const overdue = bills.filter((b) => UNPAID.includes(b.status) && daysOverdue(b) > 0).reduce((s, b) => s + billDue(b), 0);
      const credit = d.credits.filter((c: any) => c.status === 'open' && matchVendor(c.vendorName, f)).reduce((s, c: any) => s + (Number(c.remaining) || 0), 0);
      const rows: (string | number)[][] = [
        ['Total Billed', fmtMoney(billed)],
        ['Total Paid', fmtMoney(paid)],
        ['Balance Due', fmtMoney(billed - paid)],
        ['Overdue', fmtMoney(overdue)],
        ['Open Vendor Credit', fmtMoney(credit)],
      ];
      return { columns: ['Metric', 'Value'], rows, summary: [{ label: 'Balance Due', value: fmtMoney(billed - paid) }] };
    },
  },
  {
    id: 'payable-details',
    name: 'Payable Details',
    category: 'Payables',
    needs: ['bills', 'payments', 'credits'],
    run: (d, f) => {
      const rows: (string | number)[][] = [];
      d.bills.filter((b) => inRange(b.issueDate, f) && matchVendor(b.vendorName, f)).forEach((b) =>
        rows.push([fmtDate(b.issueDate), 'Bill', b.billNumber || '—', b.vendorName || '—', fmtMoney(billTotal(b)), '—', '—']));
      d.payments.filter((p: any) => inRange(p.paidAt || p.createdAt, f) && matchVendor(p.vendorName, f)).forEach((p: any) =>
        rows.push([fmtDate(p.paidAt || p.createdAt), 'Payment', p.reference || '—', p.vendorName || '—', '—', fmtMoney(Number(p.amount) || 0), '—']));
      d.credits.filter((c: any) => inRange(c.createdAt, f) && matchVendor(c.vendorName, f)).forEach((c: any) =>
        rows.push([fmtDate(c.createdAt), 'Credit', c.source || '—', c.vendorName || '—', '—', '—', fmtMoney(Number(c.remaining) || 0)]));
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      return {
        columns: ['Date', 'Type', 'Reference', 'Vendor', 'Billed', 'Paid', 'Credit'],
        rows,
        summary: [{ label: 'Entries', value: String(rows.length) }],
      };
    },
  },
  {
    id: 'purchases-by-item',
    name: 'Purchases by Item',
    category: 'Purchases',
    needs: ['pos'],
    run: (d, f) => {
      const map = new Map<string, { qty: number; amt: number; vendors: Set<string> }>();
      d.pos.filter((p: any) => inRange(p.createdAt, f) && matchVendor(p.vendorName, f)).forEach((p: any) => {
        (p.lines || []).forEach((l: any) => {
          const k = l.itemName || '—';
          const e = map.get(k) || { qty: 0, amt: 0, vendors: new Set<string>() };
          e.qty += Number(l.quantity) || 0;
          e.amt += (Number(l.quantity) || 0) * (l.rate ?? l.estimatedRate ?? 0);
          if (p.vendorName) e.vendors.add(p.vendorName);
          map.set(k, e);
        });
      });
      const rows = [...map.entries()].map(([k, e]) => [k, e.qty, fmtMoney(e.amt), e.vendors.size]);
      return { columns: ['Item', 'Quantity', 'Amount', 'Vendors'], rows, summary: [{ label: 'Items', value: String(map.size) }] };
    },
  },
  {
    id: 'pr-details',
    name: 'Purchase Request Details',
    category: 'Purchases',
    needs: ['prs'],
    run: (d, f) => {
      const list = d.prs.filter((p: any) => inRange(p.createdAt, f));
      const rows = list.map((p: any) => [
        p.prNumber || p.number || String(p.id || '').slice(0, 8),
        p.requestedBy || p.createdBy || '—',
        fmtDate(p.createdAt),
        String(p.status || '—'),
        (p.lines || []).length,
        fmtMoney(prTotal(p)),
      ]);
      return {
        columns: ['PR#', 'Requester', 'Date', 'Status', 'Lines', 'Est. Total'],
        rows,
        summary: [{ label: 'Requests', value: String(list.length) }],
      };
    },
  },
  {
    id: 'pr-item-details',
    name: 'Purchase Request Item Details',
    category: 'Purchases',
    needs: ['prs'],
    run: (d, f) => {
      const rows: (string | number)[][] = [];
      d.prs.filter((p: any) => inRange(p.createdAt, f)).forEach((p: any) => {
        (p.lines || []).forEach((l: any) =>
          rows.push([
            p.prNumber || p.number || String(p.id || '').slice(0, 8),
            l.itemName || '—', Number(l.quantity) || 0,
            fmtMoney(l.estimatedRate ?? l.rate ?? 0),
            fmtMoney((Number(l.quantity) || 0) * (l.estimatedRate ?? l.rate ?? 0)),
            String(p.status || '—'),
          ]));
      });
      return {
        columns: ['PR#', 'Item', 'Qty', 'Est. Rate', 'Amount', 'PR Status'],
        rows,
        summary: [{ label: 'Lines', value: String(rows.length) }],
      };
    },
  },
  {
    id: 'pr-approval-time',
    name: 'Purchase Request Time to Approve',
    category: 'Purchases',
    needs: ['prs'],
    run: (d, f) => {
      const done = d.prs.filter((p: any) =>
        inRange(p.updatedAt || p.createdAt, f) && ['approved', 'processed', 'rejected'].includes(String(p.status || '').toLowerCase()));
      const buckets = [0, 0, 0, 0, 0];
      const rows = done.map((p: any) => {
        const days = Math.max(0, (new Date(p.updatedAt || p.createdAt).getTime() - new Date(p.createdAt).getTime()) / 86400000);
        const i = days < 1 ? 0 : days <= 15 ? 1 : days <= 30 ? 2 : days <= 45 ? 3 : 4;
        buckets[i] += 1;
        return [
          p.prNumber || p.number || String(p.id || '').slice(0, 8),
          p.requestedBy || p.createdBy || '—',
          fmtDate(p.createdAt),
          fmtDate(p.updatedAt),
          days < 1 ? '< 1 day' : `${Math.round(days)} days`,
          String(p.status || '—'),
        ];
      });
      const avg = done.length ? done.reduce((s, p: any) => s + (new Date(p.updatedAt || p.createdAt).getTime() - new Date(p.createdAt).getTime()) / 86400000, 0) / done.length : 0;
      return {
        columns: ['PR#', 'Requester', 'Created', 'Decided', 'Time Taken', 'Outcome'],
        rows,
        summary: [
          { label: 'Decided', value: String(done.length) },
          { label: 'Average', value: done.length ? `${avg.toFixed(1)} days` : '—' },
          { label: '< 1 Day', value: String(buckets[0]) },
          { label: '1–15 Days', value: String(buckets[1]) },
          { label: '16–30 Days', value: String(buckets[2]) },
          { label: '31–45 Days', value: String(buckets[3]) },
          { label: '> 45 Days', value: String(buckets[4]) },
        ],
      };
    },
  },
  {
    id: 'exception-report',
    name: 'Exception Report',
    category: 'Activity',
    needs: ['bills', 'batches'],
    run: (d) => {
      const rows: (string | number)[][] = [];
      d.bills.filter((b) => UNPAID.includes(b.status) && daysOverdue(b) > 0 && billDue(b) > 0.005).forEach((b) =>
        rows.push(['Overdue bill', b.billNumber || '—', b.vendorName || '—', `${daysOverdue(b)} days past due`, fmtMoney(billDue(b))]));
      (d.batches || []).forEach((batch: any) =>
        (batch.lines || []).filter((l: any) => l.status === 'failed').forEach((l: any) =>
          rows.push(['Failed batch line', batch.batchNumber || '—', '—', `Bill line ${String(l.billId || '').slice(0, 8)} failed to process`, fmtMoney(Number(l.amount) || 0)])));
      return {
        columns: ['Exception', 'Reference', 'Vendor', 'Detail', 'Amount'],
        rows,
        summary: [{ label: 'Exceptions', value: String(rows.length) }],
      };
    },
  },
  ...(['system-mails', 'activity-logs', 'portal-activities', 'api-usage'] as const).map((id, i) => ({
    id,
    name: ['System Mails', 'Activity Logs', 'Portal Activities', 'API Usage'][i],
    category: 'Activity' as const,
    needs: [] as (keyof Data)[],
    run: (): ReportResult => ({
      columns: [],
      rows: [],
      summary: [],
      note: 'Event tracking is not instrumented yet — this report will light up once activity events are recorded.',
    }),
  })),
];

export const reportById = (id: string) => REPORTS.find((r) => r.id === id);

// ── Custom (My Reports) — dataset + picked columns, stored in localStorage ──

export type DatasetKey = 'bills' | 'vendors' | 'payments' | 'credits' | 'pos' | 'prs';

export type CustomReport = {
  id: string;
  name: string;
  category: 'Payables' | 'Purchases' | 'Activity';
  dataset: DatasetKey;
  columns: string[];
};

export const DATASET_FIELDS: Record<DatasetKey, { id: string; label: string }[]> = {
  bills: [
    { id: 'billNumber', label: 'Bill#' }, { id: 'vendorName', label: 'Vendor' },
    { id: 'issueDate', label: 'Bill Date' }, { id: 'dueDate', label: 'Due Date' },
    { id: 'status', label: 'Status' }, { id: 'total', label: 'Amount' },
    { id: 'amountPaid', label: 'Paid' }, { id: 'balance', label: 'Balance' },
  ],
  vendors: [
    { id: 'name', label: 'Vendor' }, { id: 'contactPerson', label: 'Contact' },
    { id: 'email', label: 'Email' }, { id: 'phone', label: 'Phone' }, { id: 'category', label: 'Category' },
  ],
  payments: [
    { id: 'paidAt', label: 'Date' }, { id: 'vendorName', label: 'Vendor' },
    { id: 'amount', label: 'Amount' }, { id: 'method', label: 'Method' }, { id: 'reference', label: 'Reference' },
  ],
  credits: [
    { id: 'vendorName', label: 'Vendor' }, { id: 'createdAt', label: 'Date' },
    { id: 'amount', label: 'Amount' }, { id: 'remaining', label: 'Remaining' }, { id: 'status', label: 'Status' },
  ],
  pos: [
    { id: 'poNumber', label: 'PO#' }, { id: 'vendorName', label: 'Vendor' },
    { id: 'createdAt', label: 'Date' }, { id: 'status', label: 'Status' },
  ],
  prs: [
    { id: 'prNumber', label: 'PR#' }, { id: 'requestedBy', label: 'Requester' },
    { id: 'createdAt', label: 'Date' }, { id: 'status', label: 'Status' },
  ],
};

const customCell = (dataset: DatasetKey, row: any, field: string): string | number => {
  switch (dataset) {
    case 'bills':
      if (field === 'total') return fmtMoney(billTotal(row));
      if (field === 'balance') return fmtMoney(billDue(row));
      if (field === 'amountPaid') return fmtMoney(Number(row.amountPaid) || 0);
      if (field === 'issueDate' || field === 'dueDate') return fmtDate(row[field]);
      return row[field] ?? '—';
    case 'payments':
      if (field === 'amount') return fmtMoney(Number(row.amount) || 0);
      if (field === 'paidAt') return fmtDate(row.paidAt || row.createdAt);
      return row[field] ?? '—';
    case 'credits':
      if (field === 'amount' || field === 'remaining') return fmtMoney(Number(row[field]) || 0);
      if (field === 'createdAt') return fmtDate(row.createdAt);
      return row[field] ?? '—';
    case 'vendors':
      return row[field] || row[field.charAt(0).toUpperCase() + field.slice(1)] || '—';
    case 'pos':
      if (field === 'poNumber') return row.poNumber || row.number || '—';
      if (field === 'createdAt') return fmtDate(row.createdAt);
      return row[field] ?? '—';
    case 'prs':
      if (field === 'prNumber') return row.prNumber || row.number || String(row.id || '').slice(0, 8);
      if (field === 'requestedBy') return row.requestedBy || row.createdBy || '—';
      if (field === 'createdAt') return fmtDate(row.createdAt);
      return row[field] ?? '—';
    default:
      return '—';
  }
};

const customDateOf = (dataset: DatasetKey, row: any) => {
  if (dataset === 'bills') return row.issueDate;
  if (dataset === 'payments') return row.paidAt || row.createdAt;
  if (dataset === 'credits' || dataset === 'pos' || dataset === 'prs') return row.createdAt;
  return null;
};

const customVendorOf = (dataset: DatasetKey, row: any) =>
  dataset === 'vendors' ? row.name || row.Name : row.vendorName;

export function runCustom(rep: CustomReport, d: Data, f: Filters): ReportResult {
  const rows = (d[rep.dataset] || [])
    .filter((r: any) => inRange(customDateOf(rep.dataset, r), f) && (!f.vendor || String(customVendorOf(rep.dataset, r) || '').toLowerCase() === f.vendor.toLowerCase()))
    .map((r: any) => rep.columns.map((c) => customCell(rep.dataset, r, c)));
  const labels = DATASET_FIELDS[rep.dataset].filter((c) => rep.columns.includes(c.id)).map((c) => c.label);
  return { columns: labels, rows, summary: [{ label: 'Rows', value: String(rows.length) }] };
}

export const customNeeds = (rep: CustomReport): (keyof Data)[] => [rep.dataset];
