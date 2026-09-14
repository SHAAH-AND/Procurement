import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ShoppingCart,
  FileText,
  Package,
  Users,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle,
  Wallet,
  PieChart,
  CreditCard,
  ShieldCheck,
  ChevronRight,
  Clock,
  TrendingUp,
  Sparkles,
  Layers,
} from 'lucide-react';

// ── Data contract (backend GET /api/v1/dashboard/summary) ──

export interface DashboardKpis {
  ordersIssued: number;
  ordersPending: number;
  billsProcessed: number;
  billsAwaitingMatch: number;
  newItems: number;
  itemCategories: number;
  newVendors: number;
  vendorsOnboarding: number;
}

export interface DashboardSpend {
  total: number;
  poSpend: number;
  nonPoSpend: number;
  monthly: number[];
}

export interface AttentionItem {
  kind: string;
  title: string;
  detail: string;
  link: string;
}

export interface DashboardPayables {
  totalDue: number;
  overdueCount: number;
  buckets: {
    current: number;
    d1_15: number;
    d16_30: number;
    d31_45: number;
    d45plus: number;
  };
}

export interface DashboardBudget {
  name: string;
  usedPct: number;
  cap: number;
}

export interface DashboardIntelligence {
  items: { name: string; count: number }[];
  vendors: { name: string; spend: number }[];
  accounts: { name: string; total: number }[];
}

export interface DashboardPaymentModes {
  total: number;
  channels: { name: string; count: number; pct: number }[];
}

export interface DashboardCompliance {
  rfqThin: number;
  avgOrderToReceiveHrs: number;
  autoscannedPct: number;
  matchPct: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  spend: DashboardSpend;
  attention: { items: AttentionItem[] };
  payables: DashboardPayables;
  budgets: DashboardBudget[];
  intelligence: DashboardIntelligence;
  paymentModes: DashboardPaymentModes;
  compliance: DashboardCompliance;
}

export interface DashboardUser {
  name?: string;
  org?: string;
  role?: string;
}

interface DashboardHomeProps {
  data: DashboardData | null | undefined;
  user: DashboardUser | null | undefined;
  period: string;
  onPeriod: (p: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onNavigate: (path: string) => void;
}

// ── helpers ──

function fmtLkr(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `LKR ${Math.round(v).toLocaleString('en-LK')}`;
}

function fmtNum(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v).toLocaleString('en-LK');
}

const LABEL = 'text-[13px] font-semibold text-slate-800';
const NUM = 'tabular-nums';

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] ${className}`}>
      {children}
    </section>
  );
}

function CardHead({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
      <h3 className="text-[13px] font-semibold text-slate-800">{label}</h3>
      {action}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
        <CheckCircle className="h-4 w-4 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ── small SVG donut ──

function Donut({
  segments,
  size = 148,
  thickness = 18,
  centerTop,
  centerBottom,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerTop: string;
  centerBottom: string;
}) {
  const total = segments.reduce((s, x) => s + (Number.isFinite(x.value) ? Math.max(x.value, 0) : 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s, i) => {
            const frac = Math.max(s.value, 0) / total;
            const dash = Math.max(frac * c - (segments.length > 1 ? 2 : 0), 0.5);
            const off = -acc * c;
            acc += frac;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={off}
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`text-sm font-bold text-slate-900 ${NUM}`}>{centerTop}</span>
        <span className="mt-0.5 max-w-[90px] text-[11px] leading-tight text-slate-500">{centerBottom}</span>
      </div>
    </div>
  );
}

// ── main component ──

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BLANK: DashboardData = {
  kpis: {
    ordersIssued: 0,
    ordersPending: 0,
    billsProcessed: 0,
    billsAwaitingMatch: 0,
    newItems: 0,
    itemCategories: 0,
    newVendors: 0,
    vendorsOnboarding: 0,
  },
  spend: { total: 0, poSpend: 0, nonPoSpend: 0, monthly: Array(12).fill(0) as number[] },
  attention: { items: [] },
  payables: {
    totalDue: 0,
    overdueCount: 0,
    buckets: { current: 0, d1_15: 0, d16_30: 0, d31_45: 0, d45plus: 0 },
  },
  budgets: [],
  intelligence: { items: [], vendors: [], accounts: [] },
  paymentModes: { total: 0, channels: [] },
  compliance: { rfqThin: 0, avgOrderToReceiveHrs: 0, autoscannedPct: 0, matchPct: 0 },
};

export function DashboardHome({ data, user: _user, period, onPeriod: _onPeriod, onRefresh: _onRefresh, refreshing: _refreshing, onNavigate }: DashboardHomeProps) {
  const d: DashboardData = data ?? BLANK;
  const [intelTab, setIntelTab] = useState<'items' | 'vendors' | 'accounts'>('items');

  const attention = d.attention?.items ?? [];
  const monthly = Array.from({ length: 12 }, (_, i) => d.spend?.monthly?.[i] ?? 0);
  const maxMonth = Math.max(...monthly, 0);

  const hasKpiActivity =
    d.kpis.ordersIssued + d.kpis.ordersPending + d.kpis.billsProcessed + d.kpis.billsAwaitingMatch +
    d.kpis.newItems + d.kpis.newVendors >
    0;
  const hasSpend = (d.spend?.total ?? 0) > 0 || monthly.some((m) => m > 0);
  const hasPayables = (d.payables?.totalDue ?? 0) > 0 || (d.payables?.overdueCount ?? 0) > 0;

  const kpis = [
    {
      icon: ShoppingCart,
      tint: 'bg-blue-50 text-[#2563eb]',
      label: 'Purchase Orders',
      value: d.kpis.ordersIssued,
      sub: `${fmtNum(d.kpis.ordersPending)} pending approval`,
      path: '/workspace/po',
    },
    {
      icon: FileText,
      tint: 'bg-emerald-50 text-emerald-600',
      label: 'Bills',
      value: d.kpis.billsProcessed,
      sub: `${fmtNum(d.kpis.billsAwaitingMatch)} awaiting match`,
      path: '/workspace/bills',
    },
    {
      icon: Package,
      tint: 'bg-amber-50 text-amber-600',
      label: 'Items',
      value: d.kpis.newItems,
      sub: `${fmtNum(d.kpis.itemCategories)} categories`,
      path: '/workspace/items',
    },
    {
      icon: Users,
      tint: 'bg-violet-50 text-violet-600',
      label: 'Vendors',
      value: d.kpis.newVendors,
      sub: `${fmtNum(d.kpis.vendorsOnboarding)} onboarding`,
      path: '/workspace/vendors',
    },
  ];

  const bucketRows = [
    { label: 'Current', value: d.payables?.buckets?.current ?? 0, color: 'bg-emerald-500' },
    { label: '1–15 days', value: d.payables?.buckets?.d1_15 ?? 0, color: 'bg-blue-500' },
    { label: '16–30 days', value: d.payables?.buckets?.d16_30 ?? 0, color: 'bg-amber-500' },
    { label: '31–45 days', value: d.payables?.buckets?.d31_45 ?? 0, color: 'bg-orange-500' },
    { label: '45+ days', value: d.payables?.buckets?.d45plus ?? 0, color: 'bg-rose-500' },
  ];
  const bucketTotal = bucketRows.reduce((s, r) => s + Math.max(r.value, 0), 0);

  const channelColors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9', '#f43f5e'];
  const channels = d.paymentModes?.channels ?? [];

  const complianceTiles = [
    {
      icon: Layers,
      label: 'Thin RFQs',
      value: fmtNum(d.compliance?.rfqThin ?? 0),
      hint: 'quotes below minimum',
      path: '/workspace/rfq',
    },
    {
      icon: Clock,
      label: 'Order → Receive',
      value: `${fmtNum(d.compliance?.avgOrderToReceiveHrs ?? 0)}h`,
      hint: 'average cycle time',
      path: '/workspace/receiving',
    },
    {
      icon: Sparkles,
      label: 'Autoscanned',
      value: `${fmtNum(d.compliance?.autoscannedPct ?? 0)}%`,
      hint: 'bills captured automatically',
      path: '/workspace/bills',
    },
    {
      icon: ShieldCheck,
      label: 'Match rate',
      value: `${fmtNum(d.compliance?.matchPct ?? 0)}%`,
      hint: 'PO–bill match accuracy',
      path: '/workspace/bills',
    },
  ];

  const intelTabs = [
    { key: 'items' as const, label: 'Top items' },
    { key: 'vendors' as const, label: 'Top vendors' },
    { key: 'accounts' as const, label: 'Top accounts' },
  ];

  return (
    <div className="min-h-full bg-[#fafbfc]">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-3 [zoom:1.1]">
        {/* ── KPI row — Zoho compact */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <button
              key={k.label}
              onClick={() => onNavigate(k.path)}
              className="group rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] transition-shadow hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)]"
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.tint}`}>
                  <k.icon className="h-4.5 w-4.5" />
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
              </div>
              <p className={`mt-2.5 text-2xl font-bold text-slate-900 ${NUM}`}>
                {hasKpiActivity || k.value > 0 ? fmtNum(k.value) : '—'}
              </p>
              <p className={`mt-1 text-sm font-medium text-slate-700`}>{k.label}</p>
              <p className="mt-0.5 text-[13px] text-slate-500">{k.sub}</p>
            </button>
          ))}
        </div>

        {/* ── spend + attention ── */}
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHead
              label="Spend Summary"
              action={
                <span className={`text-sm font-bold text-slate-900 ${NUM}`}>
                  {hasSpend ? fmtLkr(d.spend?.total ?? 0) : '—'}
                </span>
              }
            />
            <div className="flex flex-wrap gap-4 px-5 pb-1 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
                PO spend&nbsp;<strong className={`text-slate-800 ${NUM}`}>{fmtLkr(d.spend?.poSpend ?? 0)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                Non-PO&nbsp;<strong className={`text-slate-800 ${NUM}`}>{fmtLkr(d.spend?.nonPoSpend ?? 0)}</strong>
              </span>
            </div>
            {hasSpend ? (
              <div className="px-5 pb-5 pt-3">
                <div className="flex h-36 items-end gap-1.5">
                  {monthly.map((m, i) => (
                    <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                      <div
                        title={`${MONTHS[i]}: ${fmtLkr(m)}`}
                        className="w-full rounded-t-[4px] bg-[#2563eb]/85 transition-colors group-hover:bg-[#2563eb]"
                        style={{ height: `${maxMonth > 0 ? Math.max((m / maxMonth) * 100, 2) : 2}%` }}
                      />
                      <span className="mt-1.5 text-center text-[10px] font-medium text-slate-400">{MONTHS[i][0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="No spend recorded yet" hint="Approved orders and bills will appear here." />
            )}
          </Card>

          <Card>
            <CardHead label="Attention Required" />
            {attention.length === 0 ? (
              <div className="px-5 pb-5">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-6 text-center">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">All clear</p>
                  <p className="mt-1 text-xs text-slate-500">Nothing needs your review right now.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 px-1 pb-2">
                {attention.slice(0, 6).map((a, i) => (
                  <li key={i}>
                    <button
                      onClick={() => a.link && onNavigate(a.link)}
                      className="group flex w-full items-start gap-2.5 rounded-lg px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{a.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {[a.kind, a.detail].filter(Boolean).join(' • ')}
                        </span>
                      </span>
                      <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ── payables + budgets ── */}
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-3">
          <Card>
            <CardHead
              label="Payables"
              action={
                (d.payables?.overdueCount ?? 0) > 0 ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                    {fmtNum(d.payables.overdueCount)} overdue
                  </span>
                ) : undefined
              }
            />
            {hasPayables ? (
              <div className="flex items-center gap-4 px-5 pb-5">
                <Donut
                  segments={bucketRows.map((b, i) => ({
                    value: b.value,
                    color: ['#10b981', '#2563eb', '#f59e0b', '#f97316', '#f43f5e'][i]!,
                  }))}
                  centerTop={fmtLkr(d.payables?.totalDue ?? 0)}
                  centerBottom="total due"
                />
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {bucketRows.map((b) => (
                    <li key={b.label} className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${b.color}`} />
                      <span className="flex-1 truncate text-slate-500">{b.label}</span>
                      <span className={`font-semibold text-slate-700 ${NUM}`}>
                        {bucketTotal > 0 ? `${Math.round((Math.max(b.value, 0) / bucketTotal) * 100)}%` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState title="No payables outstanding" hint="Unpaid and overdue bills will show here." />
            )}
          </Card>

          <Card className="xl:col-span-2">
            <CardHead
              label="Budget Consumption"
              action={
                <button
                  onClick={() => onNavigate('/workspace/budgets')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563eb] hover:underline"
                >
                  Manage
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              }
            />
            {(d.budgets ?? []).length === 0 ? (
              <EmptyState title="No budgets yet" hint="Create a budget to track consumption against caps." />
            ) : (
              <ul className="space-y-3.5 px-5 pb-5">
                {(d.budgets ?? []).slice(0, 5).map((b, i) => {
                  const pct = Math.min(Math.max(b.usedPct ?? 0, 0), 100);
                  const over = (b.usedPct ?? 0) > 100;
                  return (
                    <li key={`${b.name}-${i}`}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-slate-700">{b.name}</span>
                        <span className={`shrink-0 font-semibold ${NUM} ${over ? 'text-rose-600' : 'text-slate-500'}`}>
                          {fmtNum(b.usedPct ?? 0)}%{b.cap > 0 ? ` of ${fmtLkr(b.cap)}` : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${over ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[#2563eb]'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ── intelligence + payment modes ── */}
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <h3 className={LABEL}>Spend Intelligence</h3>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                {intelTabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setIntelTab(t.key)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      intelTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {intelTab === 'items' &&
              ((d.intelligence?.items ?? []).length === 0 ? (
                <EmptyState title="No item data yet" hint="Purchased items will be ranked here." />
              ) : (
                <IntelRows
                  rows={(d.intelligence?.items ?? []).slice(0, 5).map((r) => ({ name: r.name, right: fmtNum(r.count) }))}
                />
              ))}
            {intelTab === 'vendors' &&
              ((d.intelligence?.vendors ?? []).length === 0 ? (
                <EmptyState title="No vendor data yet" hint="Vendor spend will be ranked here." />
              ) : (
                <IntelRows
                  rows={(d.intelligence?.vendors ?? []).slice(0, 5).map((r) => ({ name: r.name, right: fmtLkr(r.spend) }))}
                />
              ))}
            {intelTab === 'accounts' &&
              ((d.intelligence?.accounts ?? []).length === 0 ? (
                <EmptyState title="No account data yet" hint="Spend by account will be ranked here." />
              ) : (
                <IntelRows
                  rows={(d.intelligence?.accounts ?? []).slice(0, 5).map((r) => ({ name: r.name, right: fmtLkr(r.total) }))}
                />
              ))}
          </Card>

          <Card>
            <CardHead label="Payment Modes" />
            {channels.length === 0 ? (
              <EmptyState title="No payments yet" hint="Payment channel mix will appear here." />
            ) : (
              <div className="flex items-center gap-4 px-5 pb-5">
                <Donut
                  segments={channels.map((c, i) => ({ value: c.count, color: channelColors[i % channelColors.length]! }))}
                  centerTop={fmtNum(d.paymentModes?.total ?? 0)}
                  centerBottom="payments"
                />
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {channels.slice(0, 6).map((c, i) => (
                    <li key={`${c.name}-${i}`} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: channelColors[i % channelColors.length] }}
                      />
                      <span className="flex-1 truncate text-slate-500">{c.name}</span>
                      <span className={`font-semibold text-slate-700 ${NUM}`}>{fmtNum(c.pct)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* ── compliance tiles ── */}
        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {complianceTiles.map((t) => (
            <button
              key={t.label}
              onClick={() => onNavigate(t.path)}
              className="group rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.22)] transition-shadow hover:shadow-[0_2px_6px_rgba(15,23,42,0.08),0_18px_44px_-16px_rgba(15,23,42,0.28)]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <t.icon className="h-4 w-4" />
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
              </div>
              <p className={`mt-2.5 text-2xl font-bold text-slate-900 ${NUM}`}>{t.value}</p>
              <p className={`mt-1 ${LABEL}`}>{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.hint}</p>
            </button>
          ))}
        </div>

        {/* ── helper footer bar ── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200/90 bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-16px_rgba(15,23,42,0.20)]">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Wallet className="h-3.5 w-3.5 text-slate-400" />
            All amounts in LKR
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <PieChart className="h-3.5 w-3.5 text-slate-400" />
            {period} view
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
            PO coverage&nbsp;
            <strong className={`text-slate-700 ${NUM}`}>
              {(d.spend?.total ?? 0) > 0
                ? `${Math.round(((d.spend?.poSpend ?? 0) / (d.spend?.total ?? 1)) * 100)}%`
                : '—'}
            </strong>
          </span>
          <button
            onClick={() => onNavigate('/workspace')}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#2563eb] hover:underline"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Open workspace guide
          </button>
        </div>
      </div>
    </div>
  );
}

function IntelRows({ rows }: { rows: { name: string; right: string }[] }) {
  const max = rows.length;
  return (
    <ul className="space-y-1 px-2 pb-4 pt-2">
      {rows.map((r, i) => (
        <li
          key={`${r.name}-${i}`}
          className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50"
        >
          <span className={`w-5 shrink-0 text-xs font-bold text-slate-400 ${NUM}`}>{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.name}</span>
          <span className={`shrink-0 text-sm font-semibold text-slate-700 ${NUM}`}>{r.right}</span>
        </li>
      ))}
      {max === 0 && <li className="px-3 py-4 text-center text-xs text-slate-400">Nothing to show yet.</li>}
    </ul>
  );
}

export default DashboardHome;
