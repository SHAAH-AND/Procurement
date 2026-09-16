import { useState } from 'react';
import {
  FileText,
  Package,
  Users,
  Clock,
  Copy,
  Sparkles,
  ShieldCheck,
  Layers,
  Info,
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

function fmtInr(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

const NUM = 'tabular-nums';

// ── small SVG donut ──

function Donut({
  segments,
  size = 144,
  thickness = 12,
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

// ── Zoho-style grouped column chart (PO vs Non-PO per month) ──
// White plot, dashed gridlines, y-axis labels, rounded column tops, hover highlight.
function ZohoGroupedColumns({ months, po, nonPo, maxMonth }: { months: string[]; po: number[]; nonPo: number[]; maxMonth: number }) {
  const peak = Math.max(maxMonth, 1);
  const ticks = [1, 0.75, 0.5, 0.25].map((f) => peak * f);
  const fmtTick = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : `${Math.round(v)}`);
  return (
    <div>
      <div className="relative h-44">
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-2">
          {ticks.map((t, i) => (
            <span key={i}>{fmtTick(t)}</span>
          ))}
          <span>0</span>
        </div>
        <div className="ml-10 h-[calc(100%-24px)] flex flex-col justify-between">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="border-t border-dashed border-slate-200 w-full" />
          ))}
        </div>
        <div className="absolute inset-0 ml-10 mb-6 flex items-end gap-1.5">
          {months.map((m, i) => {
            const a = po[i] ?? 0;
            const b = nonPo[i] ?? 0;
            const ha = Math.max((a / peak) * 100, a > 0 ? 2 : 0);
            const hb = Math.max((b / peak) * 100, b > 0 ? 2 : 0);
            return (
              <div key={m} className="group relative flex h-full flex-1 items-end justify-center gap-[3px]">
                <div
                  title={`${m} PO: ${fmtLkr(a)} | Non-PO: ${fmtLkr(b)}`}
                  className="w-full rounded-t-[3px] bg-[#3B82F6]/85 transition-colors group-hover:bg-[#3B82F6]"
                  style={{ height: `${ha}%` }}
                />
                <div
                  title={`${m} PO: ${fmtLkr(a)} | Non-PO: ${fmtLkr(b)}`}
                  className="w-full rounded-t-[3px] bg-[#F59E0B]/80 transition-colors group-hover:bg-[#F59E0B]"
                  style={{ height: `${hb}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-10 flex gap-1.5">
        {months.map((m) => (
          <span key={m} className="flex-1 text-center text-[10px] font-medium text-slate-400">{m}</span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3B82F6]" /> PO spend</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#F59E0B]" /> Non-PO spend</span>
      </div>
    </div>
  );
}

export function DashboardHome({ data, user, period, onPeriod, onNavigate }: DashboardHomeProps) {
  const d: DashboardData = data ?? BLANK;
  const rawName = user?.name?.split(/[@.\s]/)[0] || 'there';
  const first = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const org = user?.org || '';
  const [intelTab, setIntelTab] = useState<'vendors' | 'items' | 'accounts'>('vendors');

  const attention = d.attention?.items ?? [];
  const monthly = Array.from({ length: 12 }, (_, i) => d.spend?.monthly?.[i] ?? 0);
  const maxMonth = Math.max(...monthly, 0);
  const hasSpend = (d.spend?.total ?? 0) > 0 || monthly.some((m) => m > 0);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const orderBillPct = (d.spend?.total ?? 0) > 0 ? Math.round(((d.spend?.poSpend ?? 0) / (d.spend?.total ?? 1)) * 100) : 0;
  const poRatio = (d.spend?.total ?? 0) > 0 ? Math.min(Math.max((d.spend?.poSpend ?? 0) / (d.spend?.total ?? 1), 0), 1) : 0.6;
  const channels = d.paymentModes?.channels ?? [];
  const channelColors = ['#2563eb', '#2084FA', '#f59e0b', '#8b5cf6', '#0ea5e9', '#f43f5e'];
  const mostRequested = (d.intelligence?.items ?? []).slice(0, 5);

  const kpis = [
    {
      label: 'Orders Issued',
      value: d.kpis.ordersIssued,
      icon: FileText,
    },
    {
      label: 'Bills Processed',
      value: d.kpis.billsProcessed,
      icon: FileText,
    },
    {
      label: 'New Items',
      value: d.kpis.newItems,
      icon: Package,
    },
    {
      label: 'New Vendors',
      value: d.kpis.newVendors,
      icon: Users,
    },
  ];

  const bucketRows = [
    { label: 'Current Due', value: d.payables?.buckets?.current ?? 0, color: 'bg-blue-500' },
    { label: 'Overdue by 1-15 days', value: d.payables?.buckets?.d1_15 ?? 0, color: 'bg-purple-500' },
    { label: 'Overdue by 16-30 days', value: d.payables?.buckets?.d16_30 ?? 0, color: 'bg-amber-400' },
    { label: 'Overdue by 31-45 days', value: d.payables?.buckets?.d31_45 ?? 0, color: 'bg-orange-400' },
    { label: 'Overdue by above 45 days', value: d.payables?.buckets?.d45plus ?? 0, color: 'bg-rose-500' },
  ];

  const complianceTiles = [
    {
      label: 'RFQs Closed With < 3 Vendors',
      value: fmtNum(d.compliance?.rfqThin ?? 0),
      icon: Layers,
    },
    {
      label: 'Average Order to Receive Time',
      value: `${fmtNum(d.compliance?.avgOrderToReceiveHrs ?? 0)} m`,
      icon: Clock,
    },
    {
      label: 'Autoscanned Bills',
      value: `${fmtNum(d.compliance?.autoscannedPct ?? 0)}%`,
      icon: Sparkles,
    },
    {
      label: 'Order to Bill Compliance %',
      value: `${fmtNum(d.compliance?.matchPct ?? 0)}%`,
      icon: ShieldCheck,
    },
  ];

  const intelData =
    intelTab === 'vendors'
      ? (d.intelligence?.vendors ?? []).slice(0, 5).map((r) => ({ name: r.name, right: fmtLkr(r.spend) }))
      : intelTab === 'items'
        ? (d.intelligence?.items ?? []).slice(0, 5).map((r) => ({ name: r.name, right: fmtNum(r.count) }))
        : (d.intelligence?.accounts ?? []).slice(0, 5).map((r) => ({ name: r.name, right: fmtLkr(r.total) }));

  return (
    <div className="min-h-full bg-[#f4f5f8]">
      <div className="mx-auto max-w-6xl px-3 sm:px-4 pb-8 pt-3 space-y-4">
        {/* Welcome */}
        <div className="flex items-center gap-3 pt-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
            <Copy size={20} className="text-slate-500" />
          </span>
          <span>
            <span className="block text-[17px] font-bold text-slate-900">Hello, {first}</span>
            {org ? <span className="block text-[13px] text-slate-500">{org}</span> : null}
          </span>
        </div>
        {/* Date Range */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-slate-600 font-medium">Date Range:</span>
          <select
            value={period}
            onChange={(e) => onPeriod(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-700 font-medium pr-7 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option>This Year</option>
            <option>This quarter</option>
            <option>This month</option>
            <option>Last month</option>
          </select>
        </div>

        {/* Spend Summary + Attention Required — Zoho order */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-[#e4e7eb] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#f8fafc] border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Spend Summary</h2>
              <span className={`text-sm font-bold text-slate-900 ${NUM}`}>{hasSpend ? fmtLkr(d.spend?.total ?? 0) : '—'}</span>
            </div>
            <div className="flex flex-wrap gap-4 px-5 pt-3 pb-1 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Total Spend&nbsp;<strong className={`text-slate-800 ${NUM}`}>{fmtLkr(d.spend?.total ?? 0)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                PO spend&nbsp;<strong className={`text-slate-800 ${NUM}`}>{fmtLkr(d.spend?.poSpend ?? 0)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Non-PO&nbsp;<strong className={`text-slate-800 ${NUM}`}>{fmtLkr(d.spend?.nonPoSpend ?? 0)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                Bills on PO&nbsp;<strong className={`text-slate-800 ${NUM}`}>{orderBillPct}%</strong>
              </span>
            </div>
            {hasSpend ? (
              <div className="px-5 pb-5 pt-3">
                <ZohoGroupedColumns
                  months={MONTHS}
                  po={monthly.map((m) => m * poRatio)}
                  nonPo={monthly.map((m) => m * (1 - poRatio))}
                  maxMonth={maxMonth}
                />
              </div>
            ) : (
              <div className="px-5 pb-5 pt-3">
                <div className="relative h-44">
                  <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-2">
                    <span>4 K</span>
                    <span>3 K</span>
                    <span>2 K</span>
                    <span>1 K</span>
                    <span>0</span>
                  </div>
                  <div className="ml-10 h-[calc(100%-24px)] flex flex-col justify-between">
                    {[0, 1, 2, 3].map((r) => (
                      <div key={r} className="border-t border-dashed border-slate-200 w-full" />
                    ))}
                  </div>
                  <div className="absolute inset-0 ml-10 mb-6 flex flex-col items-center justify-center gap-1">
                    <span className="text-xs text-slate-500">No data to display</span>
                    <span className="text-[11px] text-slate-400">Monthly PO vs Non-PO spend will appear here once orders and bills are recorded.</span>
                  </div>
                </div>
                <div className="ml-10 flex gap-1.5">
                  {MONTHS.map((m) => (
                    <span key={m} className="flex-1 text-center text-[10px] font-medium text-slate-400">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white border border-[#e4e7eb] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Attention Required</h2>
            </div>
            {attention.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <Info size={16} className="text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                  <Info size={14} className="text-slate-400" /> No Attention Required.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 px-1 pb-2">
                {attention.slice(0, 6).map((a, i) => (
                  <li key={i}>
                    <button
                      onClick={() => a.link && onNavigate(a.link)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-4 py-2.5 text-left hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{a.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{[a.kind, a.detail].filter(Boolean).join(' • ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Metric stat cards — Zoho horizontal: icon left, label over value */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="bg-white border border-[#e4e7eb] rounded-lg p-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors"
            >
              <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                <k.icon size={20} />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium block leading-tight">{k.label}</span>
                <span className={`text-xl font-bold text-slate-800 tracking-tight block mt-0.5 ${NUM}`}>{fmtNum(k.value)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Payables + Budget */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-[#e4e7eb] rounded-lg p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Payables Summary</h2>
              <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-8 py-3">
                <Donut
                  segments={bucketRows.map((b, i) => ({
                    value: b.value,
                    color: ['#3b82f6', '#8b5cf6', '#f59e0b', '#f97316', '#ef4444'][i]!,
                  }))}
                  size={144}
                  thickness={12}
                  centerTop={fmtInr(d.payables?.totalDue ?? 0)}
                  centerBottom="total"
                />
                <div className="space-y-2.5 text-xs flex-1 w-full max-w-xs">
                  {bucketRows.map((b) => (
                    <div key={b.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${b.color}`} />
                        <span className="text-slate-600">{b.label}</span>
                      </div>
                      <span className={`font-medium text-slate-800 ${NUM}`}>{fmtInr(b.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-dashed border-slate-200 pt-3 mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Total Payables</span>
              <span className={`text-base font-bold text-slate-900 ${NUM}`}>{fmtInr(d.payables?.totalDue ?? 0)}</span>
            </div>
          </div>

          <div className="bg-white border border-[#e4e7eb] rounded-lg p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Budget Consumption Summary</h2>
            {(d.budgets ?? []).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] text-center p-6">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-2">
                  <Info size={18} />
                </div>
                <span className="text-xs text-slate-500">No data to display</span>
              </div>
            ) : (
              <ul className="space-y-3 mt-3">
                {(d.budgets ?? []).slice(0, 5).map((b, i) => {
                  const pct = Math.min(Math.max(b.usedPct ?? 0, 0), 100);
                  return (
                    <li key={`${b.name}-${i}`}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-slate-700">{b.name}</span>
                        <span className={`shrink-0 font-semibold ${NUM} ${pct > 100 ? 'text-rose-600' : 'text-slate-500'}`}>
                          {fmtNum(b.usedPct ?? 0)}%{b.cap > 0 ? ` of ${fmtLkr(b.cap)}` : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${pct > 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Compliance strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {complianceTiles.map((t) => (
            <div
              key={t.label}
              className="bg-white border border-[#e4e7eb] rounded-lg p-4 flex items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 flex-shrink-0">
                <t.icon size={18} />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium leading-tight block">{t.label}</span>
                <span className={`text-lg font-bold text-slate-800 tracking-tight mt-0.5 block ${NUM}`}>{t.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Top Spend tabs — Zoho screenshots order */}
        <div className="bg-white border border-[#e4e7eb] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="flex items-center gap-6 px-5 border-b border-[#e4e7eb] bg-[#f8fafc]">
            {(
              [
                { key: 'vendors' as const, label: 'Top Vendors' },
                { key: 'items' as const, label: 'Top Items' },
                { key: 'accounts' as const, label: 'Top Accounts' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setIntelTab(t.key)}
                className={`py-3 px-1 text-xs font-medium border-b-2 transition-colors ${
                  intelTab === t.key ? 'text-[#2563eb] border-[#2563eb] font-semibold' : 'text-slate-500 border-transparent hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-8 flex flex-col items-center justify-center min-h-[160px]">
            {intelData.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Info size={16} className="text-slate-400" />
                <span>No data to display</span>
              </div>
            ) : (
              <ul className="w-full max-w-lg space-y-1">
                {intelData.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                    <span className={`w-5 shrink-0 text-xs font-bold text-slate-400 ${NUM}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.name}</span>
                    <span className={`shrink-0 text-sm font-semibold text-slate-700 ${NUM}`}>{r.right}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Most Requested + Payment Modes — below Top Spend per Zoho help order */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-[#e4e7eb] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Most Requested Items</h2>
            </div>
            {mostRequested.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center min-h-[160px] text-xs text-slate-500">
                <Info size={16} className="text-slate-400 mb-1" />
                <span>No data to display</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 px-2 py-2">
                {mostRequested.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2">
                    <span className={`w-5 shrink-0 text-xs font-bold text-slate-400 ${NUM}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.name}</span>
                    <span className={`shrink-0 text-sm font-semibold text-slate-700 ${NUM}`}>{fmtNum(r.count)} requests</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white border border-[#e4e7eb] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="px-5 py-3.5 bg-[#f8fafc] border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-800">Payment Modes</h2>
            </div>
            {channels.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center min-h-[160px] text-xs text-slate-500">
                <Info size={16} className="text-slate-400 mb-1" />
                <span>No data to display</span>
              </div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-5">
                <Donut
                  segments={channels.map((c, i) => ({ value: c.count, color: channelColors[i % channelColors.length]! }))}
                  centerTop={fmtNum(channels.reduce((s, c) => s + (c.count ?? 0), 0))}
                  centerBottom="payments"
                />
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {channels.slice(0, 6).map((c, i) => (
                    <li key={`${c.name}-${i}`} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: channelColors[i % channelColors.length] }} />
                      <span className="flex-1 truncate text-slate-500">{c.name}</span>
                      <span className={`font-semibold text-slate-700 ${NUM}`}>{fmtNum(c.pct)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardHome;
