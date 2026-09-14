import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

const billTotal = (b: any) => (b.lines || []).reduce((s: number, l: any) => s + (+l.quantity || 0) * (+l.rate || 0), 0);
const SPEND_OK = (s: string) => !['draft', 'pending', 'void', 'cancelled'].includes(s);
const OPEN_BILL = (s: string) => ['open', 'partially_paid', 'overdue', 'pending'].includes(s);

function channelOf(method: string): string {
  const s = (method || '').toLowerCase();
  if (/cash/.test(s)) return 'Cash';
  if (/card|visa|master|amex/.test(s)) return 'Corporate Card';
  if (/bank|transfer|neft|rtgs|wire|cheque|check|online|tt\b/.test(s)) return 'Bank Transfer';
  return 'Others';
}

@Controller('api/v1/dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private tenant: TenantPrismaService) {}

  @Get('summary')
  async summary(@Query('period') period = 'year') {
    const t: any = this.tenant.client;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    let since: Date | null = null;
    let until: Date | null = null;
    if (period === 'month') since = monthStart;
    else if (period === '30days') since = new Date(now.getTime() - 30 * 86400000);
    else if (period === 'quarter') since = quarterStart;
    else if (period === 'lastmonth') {
      since = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      until = monthStart;
    }
    const pc = (f = 'createdAt') => {
      const o: any = {};
      if (since) o.gte = since;
      if (until) o.lt = until;
      return Object.keys(o).length ? { [f]: o } : {};
    };

    const [pos, bills, items, vendors, payments, prs, rfqs, receives]: any[] = await Promise.all([
      t.purchaseOrder.findMany({ where: { ...pc() }, include: { lines: true } }),
      t.bill.findMany({ where: { ...pc() }, include: { lines: true } }),
      t.item.findMany({ where: { ...pc() } }),
      t.vendor.findMany({ where: { ...pc() } }),
      t.payment.findMany({ where: { ...pc('paidAt') } }),
      t.purchaseRequest.findMany({ include: { lines: true } }),
      t.rfq.findMany({ include: { vendors: true } }),
      t.purchaseReceive.findMany({}),
    ]);

    const totals = new Map<string, number>(bills.map((b: any): [string, number] => [b.id, billTotal(b)]));
    const bal = (b: any) => totals.get(b.id)! - (+b.amountPaid || 0);
    const isOverdue = (b: any) =>
      ['open', 'partially_paid', 'overdue'].includes(b.status) && b.dueDate && new Date(b.dueDate) < now && bal(b) > 0;

    // ── spend (approved bills only) ──
    const spendBills = bills.filter((b: any) => SPEND_OK(b.status));
    const poBills = spendBills.filter((b: any) => b.poId);
    const nonPoBills = spendBills.filter((b: any) => !b.poId);
    const sum = (list: any[]) => list.reduce((s, b) => s + totals.get(b.id)!, 0);
    const poSpend = sum(poBills);
    const nonPoSpend = sum(nonPoBills);
    const monthly: number[] = Array(12).fill(0);
    for (const b of spendBills) {
      const d = new Date(b.issueDate || b.createdAt);
      if (d.getFullYear() === now.getFullYear()) monthly[d.getMonth()] += totals.get(b.id)!;
    }

    // ── PO ↔ bill line matching ──
    const poLinesByPo = new Map<string, any[]>();
    for (const po of pos) poLinesByPo.set(po.id, po.lines || []);
    const lineMatch = (poId: string, bl: any): boolean => {
      const pls = poLinesByPo.get(poId) || [];
      const pl = pls.find((p: any) => p.id === bl.poLineId)
        || pls.find((p: any) => (p.itemName || '').toLowerCase() === (bl.itemName || '').toLowerCase());
      if (!pl) return false;
      if (+bl.quantity > +pl.quantity) return false;
      if (+pl.rate === 0) return +bl.rate === 0;
      return Math.abs(+bl.rate - +pl.rate) / Math.abs(+pl.rate) <= 0.02;
    };
    const poLinked = bills.filter((b: any) => b.poId);
    let matched = 0, linked = 0;
    const unmatchedBills: any[] = [];
    for (const b of poLinked) {
      let allOk = (b.lines || []).length > 0;
      for (const l of b.lines || []) {
        linked++;
        const ok = lineMatch(b.poId, l);
        if (ok) matched++; else allOk = false;
      }
      if (!allOk && !['paid', 'void', 'cancelled'].includes(b.status)) unmatchedBills.push(b);
    }
    const matchPct = linked ? Math.round((matched / linked) * 1000) / 10 : 0;

    // ── attention (cap 5) ──
    const attn: any[] = [];
    const awaiting = prs.filter((p: any) => p.status === 'awaiting').length;
    const overdue = bills.filter(isOverdue);
    const thinRfqs = rfqs.filter((r: any) => !['cancelled', 'awarded', 'awarded_partial', 'expired'].includes(r.status) && (r.vendors || []).length < 3);
    if (awaiting) attn.push({ kind: 'pr_approval', title: `${awaiting} purchase request(s) awaiting approval`, detail: 'Review and approve pending requests', link: '/purchase-requests' });
    if (overdue.length) attn.push({ kind: 'overdue_bill', title: `${overdue.length} overdue bill(s)`, detail: `LKR ${Math.round(overdue.reduce((s: number, b: any) => s + bal(b), 0)).toLocaleString()} past due`, link: '/bills' });
    if (unmatchedBills.length) attn.push({ kind: 'unmatched_bill', title: `${unmatchedBills.length} PO-linked bill(s) awaiting match`, detail: 'Bill lines differ from PO qty/rate tolerance', link: '/bills' });
    for (const r of thinRfqs) {
      if (attn.length >= 5) break;
      attn.push({ kind: 'rfq_thin', title: `RFQ ${r.rfqNumber} has fewer than 3 vendors`, detail: `${(r.vendors || []).length} vendor(s) invited`, link: '/rfqs' });
    }

    // ── payables ageing ──
    const payable = bills.filter((b: any) => OPEN_BILL(b.status) && bal(b) > 0);
    const buckets: Record<string, number> = { current: 0, d1_15: 0, d16_30: 0, d31_45: 0, d45plus: 0 };
    for (const b of payable) {
      const v = bal(b);
      const days = b.dueDate ? Math.floor((now.getTime() - new Date(b.dueDate).getTime()) / 86400000) : -1;
      if (days <= 0) buckets.current += v;
      else if (days <= 15) buckets.d1_15 += v;
      else if (days <= 30) buckets.d16_30 += v;
      else if (days <= 45) buckets.d31_45 += v;
      else buckets.d45plus += v;
    }

    // ── intelligence top-10s ──
    const itemCounts = new Map<string, number>();
    for (const p of prs) for (const l of p.lines || []) itemCounts.set(l.itemName, (itemCounts.get(l.itemName) || 0) + (+l.quantity || 1));
    const vendorSpend = new Map<string, number>();
    for (const b of spendBills) vendorSpend.set(b.vendorName || 'Unknown', (vendorSpend.get(b.vendorName || 'Unknown') || 0) + totals.get(b.id)!);
    const acctTotals = new Map<string, number>();
    for (const p of payments) acctTotals.set(p.method || 'Unspecified', (acctTotals.get(p.method || 'Unspecified') || 0) + (+p.amount || 0));
    const top = (m: Map<string, number>, k: string, v: string, n = 10) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, val]) => ({ [k]: name, [v]: Math.round(val * 100) / 100 }));

    // ── payment modes ──
    const order = ['Bank Transfer', 'Cash', 'Corporate Card', 'Others'];
    const chCounts = new Map(order.map((c) => [c, 0]));
    for (const p of payments) chCounts.set(channelOf(p.method || ''), (chCounts.get(channelOf(p.method || '')) || 0) + 1);
    const channels = order.map((name) => ({ name, count: chCounts.get(name) || 0, pct: payments.length ? Math.round(((chCounts.get(name) || 0) / payments.length) * 1000) / 10 : 0 }));

    // ── compliance ──
    const poById = new Map<string, any>(pos.map((p: any): [string, any] => [p.id, p]));
    const hrs: number[] = [];
    for (const r of receives) {
      const po = poById.get(r.poId);
      if (po) hrs.push((new Date(r.createdAt).getTime() - new Date(po.createdAt).getTime()) / 3600000);
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      kpis: {
        ordersIssued: pos.filter((p: any) => !['draft', 'pending', 'cancelled'].includes(p.status)).length,
        ordersPending: pos.filter((p: any) => ['draft', 'pending'].includes(p.status)).length,
        billsProcessed: bills.filter((b: any) => ['paid', 'partially_paid'].includes(b.status)).length,
        billsAwaitingMatch: unmatchedBills.length,
        newItems: items.length,
        itemCategories: new Set(items.map((i: any) => i.category || 'Other')).size,
        newVendors: vendors.length,
        vendorsOnboarding: vendors.filter((v: any) => v.status !== 'active').length,
      },
      spend: { total: r2(poSpend + nonPoSpend), poSpend: r2(poSpend), nonPoSpend: r2(nonPoSpend), monthly: monthly.map(r2) },
      attention: { items: attn.slice(0, 5) },
      payables: {
        totalDue: r2(payable.reduce((s: number, b: any) => s + bal(b), 0)),
        overdueCount: overdue.length,
        buckets: { current: r2(buckets.current), d1_15: r2(buckets.d1_15), d16_30: r2(buckets.d16_30), d31_45: r2(buckets.d31_45), d45plus: r2(buckets.d45plus) },
      },
      budgets: [
        { name: 'IT & Infrastructure', usedPct: 0, cap: 500000 },
        { name: 'Operations & Logistics', usedPct: 0, cap: 350000 },
        { name: 'General Procurement', usedPct: 0, cap: 200000 },
      ],
      intelligence: { items: top(itemCounts, 'name', 'count'), vendors: top(vendorSpend, 'name', 'spend'), accounts: top(acctTotals, 'name', 'total') },
      paymentModes: { total: payments.length, channels },
      compliance: {
        rfqThin: thinRfqs.length,
        avgOrderToReceiveHrs: hrs.length ? Math.round((hrs.reduce((a, b) => a + b, 0) / hrs.length) * 10) / 10 : 0,
        autoscannedPct: 0,
        matchPct,
      },
    };
  }
}
