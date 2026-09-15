import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import { MyHome } from './MyHome';
import { getDashboard } from '../../api';
import {
  ShoppingBag, Store, ClipboardList, ReceiptText, Upload, Copy, Pencil,
  Rocket, Plug, Blocks, Workflow, LifeBuoy, BookOpen, MessageCircleQuestion,
  ArrowRight, ExternalLink, Check,
} from 'lucide-react';

interface HomeViewProps {
  user: { name?: string; email?: string; orgName?: string } | null;
}

type Task = { id: string; title: string; body: string; action: string; done: boolean };

const INITIAL_GROUPS: { title: string; tasks: Task[] }[] = [
  {
    title: 'Set Up Your Organization',
    tasks: [
      { id: 'modules', title: 'Configure the modules required for your business', body: 'Enable Purchase Requests, RFQs, Goods Received Notes, or custom approvals.', action: 'Configure Modules', done: false },
      { id: 'users', title: 'Add users and assign them role-based access', body: 'Invite team members and cost-center heads.', action: '', done: true },
      { id: 'budgets', title: 'Define cost centres and department budgets', body: 'Set monthly budget thresholds and automated overrun alerts.', action: 'Set Budgets', done: false },
      { id: 'gl', title: 'Map General Ledger (GL) accounts and matching tolerances', body: 'Set automated 3-way matching threshold (e.g. ±2%).', action: 'Configure', done: false },
    ],
  },
  {
    title: 'Manage Items and Vendors',
    tasks: [
      { id: 'items', title: 'Add your first catalog items', body: 'Import catalog items with units, categories, and cost prices.', action: 'Add Item', done: false },
      { id: 'vendors', title: 'Establish your preferred vendor matrix', body: 'Add vendors once and reuse them across all properties.', action: 'Add Vendor', done: false },
    ],
  },
  {
    title: 'Streamline Bills and Vendor Payments',
    tasks: [
      { id: 'bills', title: 'Set up bill capture', body: 'Forward vendor bills to your inbound email or upload PDFs directly.', action: 'Open Bills', done: false },
      { id: 'payments', title: 'Schedule batch payments', body: 'Group approved bills and pay vendors in one run.', action: 'Open Payments', done: false },
    ],
  },
];

const TASK_ROUTE: Record<string, string> = {
  items: '/workspace/items',
  vendors: '/workspace/vendors',
  bills: '/workspace/bills',
  payments: '/workspace/payments',
  budgets: '/workspace/budgets',
};

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <button
          onClick={onToggle}
          aria-label={task.done ? 'Mark as not done' : 'Mark as completed'}
          className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            task.done ? 'bg-emerald-500 text-white' : 'border border-slate-300 hover:border-blue-500'
          }`}
        >
          {task.done && <Check size={11} strokeWidth={3.5} />}
        </button>
        <div className="min-w-0">
          <div className={`font-medium text-[13px] ${task.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.title}</div>
          <div className={`text-[12px] mt-0.5 ${task.done ? 'text-slate-400' : 'text-slate-500'}`}>{task.body}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {task.done ? (
          <span className="text-[12px] text-emerald-600 font-medium flex items-center gap-1">
            <Check size={14} /> Completed
          </span>
        ) : (
          <>
            <button onClick={onToggle} className="text-[12px] text-blue-600 hover:underline hidden sm:block">
              Mark as Completed
            </button>
            {task.action && (
              <button
                onClick={() => { const r = TASK_ROUTE[task.id]; if (r) navigate(r); }}
                className={`px-3 py-1 rounded font-medium text-[12px] transition-colors shadow-sm ${
                  task.id === 'modules'
                    ? 'bg-[#2563eb] hover:bg-blue-700 text-white'
                    : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                {task.action}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SetupHome({ user }: HomeViewProps) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [open, setOpen] = useState<number | null>(0);
  const [queuedBills, setQueuedBills] = useState<string[]>([]);

  const toggleTask = (gi: number, id: string) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, tasks: g.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) } : g)));

  const doneCount = (gi: number) => groups[gi].tasks.filter((t) => t.done).length;

  const firstName = user?.name?.split(/[@.\s]/)[0] || 'there';
  const cap = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="max-w-4xl mx-auto space-y-9 pb-8">
      {/* 1. Welcome header */}
      <div className="space-y-1">
        <h1 className="text-[23px] font-bold text-slate-900 tracking-tight">
          Hi {cap}, let&rsquo;s streamline your procurement process!
        </h1>
        <p className="text-[13.5px] text-slate-500">
          Set up {user?.orgName || 'your organization'} parameters, add master records, and configure bills matching.
        </p>
      </div>

      {/* 2. Onboarding accordions */}
      <div className="space-y-3" id="onboarding-section">
        {groups.map((g, gi) => (
          <div key={g.title} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors"
              onClick={() => setOpen(open === gi ? null : gi)}
              aria-expanded={open === gi}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${
                  doneCount(gi) === g.tasks.length ? 'border-emerald-500 text-emerald-600' : doneCount(gi) > 0 ? 'border-blue-500 text-blue-600' : 'border-slate-200 text-slate-400'
                }`}>
                  {doneCount(gi)}/{g.tasks.length}
                </div>
                <h2 className="text-[14.5px] font-semibold text-slate-900">{g.title}</h2>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={`text-slate-400 transition-transform duration-200 ${open === gi ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {open === gi && (
              <div className="px-5 pb-4 pt-1 border-t border-slate-100">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={() => toggleTask(gi, t.id)} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 3. Start journey */}
      <div className="bg-white rounded-xl border border-slate-200 p-7 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2 text-[16px] font-bold text-slate-900">
          <Rocket size={20} className="text-blue-600" />
          Start Your Procurement Journey
        </div>
        <p className="text-[13px] text-slate-500 mt-1 mb-6">Create the following records to kick start your procurement journey.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          {[
            { label: 'Item', icon: ShoppingBag, bg: 'bg-cyan-50 text-cyan-600', route: '/workspace/items' },
            { label: 'Vendor', icon: Store, bg: 'bg-emerald-50 text-emerald-600', route: '/workspace/vendors' },
            { label: 'Purchase Request', icon: ClipboardList, bg: 'bg-blue-50 text-blue-600', route: '/workspace/pr' },
            { label: 'Purchase Order', icon: ReceiptText, bg: 'bg-purple-50 text-purple-600', route: '/workspace/po' },
          ].map((t) => (
            <button
              key={t.label}
              onClick={() => navigate(t.route)}
              className="group p-5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 transition-all flex flex-col items-center"
            >
              <div className={`w-11 h-11 rounded-full ${t.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <t.icon size={22} />
              </div>
              <span className="text-[13px] font-medium text-slate-700 group-hover:text-blue-600 mt-3">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Bills dropzone */}
        <div className="mt-8 border border-dashed border-slate-300 rounded-lg p-8 bg-slate-50/50 flex flex-col items-center max-w-2xl mx-auto">
          <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm mb-3">
            <Upload size={22} />
          </div>
          <div className="text-[14px] font-medium text-slate-800">Drag and Drop Bills</div>
          <div className="text-[12px] text-slate-400 mt-1 mb-4">You can add up to 20 bills, each with a maximum size of 5 MB</div>
          <label className="inline-flex rounded-md shadow-sm cursor-pointer">
            <span className="px-4 py-1.5 bg-[#2563eb] hover:bg-blue-700 text-white text-[12.5px] font-medium rounded-md transition-colors">
              Upload files
            </span>
            <input
              type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="hidden"
              onChange={(e) => setQueuedBills(Array.from(e.target.files || []).map((f) => f.name))}
            />
          </label>
          {queuedBills.length > 0 && (
            <div className="mt-3 text-[12px] text-slate-600">
              {queuedBills.length} file{queuedBills.length > 1 ? 's' : ''} selected — bill OCR lands with the Bills module.
            </div>
          )}
          <div className="mt-6 pt-5 border-t border-slate-200/80 w-full text-center">
            <span className="text-[12px] text-slate-500">Send your vendor bills to the following email address</span>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[12.5px] text-blue-600 font-medium">
              <Copy size={15} className="cursor-pointer hover:text-blue-800" />
              <span className="cursor-pointer hover:underline">bills@{ (user?.orgName || 'procureflow').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'procureflow' }.procureflow.io</span>
              <Pencil size={15} className="text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Advanced features */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-[14.5px] font-bold text-slate-900">Advanced features to elevate your procurement process</h3>
          <p className="text-[12.5px] text-slate-500 mt-0.5">Integrations, custom modules, and workflow automation for your hotel group.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {[
            { label: 'Connect Other Apps', icon: Plug, bg: 'bg-emerald-50 text-emerald-600' },
            { label: 'Create Modules', icon: Blocks, bg: 'bg-amber-50 text-amber-600' },
            { label: 'Configure Workflows', icon: Workflow, bg: 'bg-blue-50 text-blue-600' },
          ].map((f) => (
            <div key={f.label} className="p-3.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-slate-50/50 flex items-center gap-3 transition-colors">
              <div className={`w-8 h-8 rounded-md ${f.bg} flex items-center justify-center flex-shrink-0`}>
                <f.icon size={19} />
              </div>
              <span className="text-[13px] font-medium text-slate-700">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Need assistance */}
      <div className="space-y-3">
        <h3 className="text-[14.5px] font-bold text-slate-900">Need Assistance?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: 'Contact Support', icon: LifeBuoy, body: 'Write to us and the ProcureFlow team will answer you.', link: 'Mail us', arrow: true },
            { title: 'Help Docs', icon: BookOpen, body: 'Read the help docs for an in-depth understanding of ProcureFlow.', link: 'Help Docs', ext: true },
            { title: 'FAQs', icon: MessageCircleQuestion, body: 'Get answers to common questions about using ProcureFlow.', link: 'FAQs', ext: true },
          ].map((c) => (
            <div key={c.title} className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-[13.5px] text-slate-800">
                  <c.icon size={18} className="text-slate-500" />
                  {c.title}
                </div>
                <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">{c.body}</p>
              </div>
              <span className="text-[12.5px] font-medium text-blue-600 inline-flex items-center gap-1 mt-4">
                {c.link} {c.arrow ? <ArrowRight size={14} /> : <ExternalLink size={13} />}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Post-setup home: My Home + Dashboard + Setup (tabs owned by Workspace header) ──
const PERIOD_PARAM: Record<string, string> = {
  'This month': 'month',
  'Last month': 'lastmonth',
  'This quarter': 'quarter',
  'This year': 'year',
};

const LINK_MAP: Record<string, string> = {
  '/purchase-requests': '/workspace/pr',
  '/bills': '/workspace/bills',
  '/rfqs': '/workspace/rfq',
  '/workspace/receiving': '/workspace/receives',
};

export type HomeSubView = 'myhome' | 'dashboard' | 'setup';

export function HomeView({ user, view, onViewChange, initialData }: HomeViewProps & { view: HomeSubView; onViewChange: (v: HomeSubView) => void; initialData?: any }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('This year');
  const [data, setData] = useState<any>(initialData ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const firstRun = useRef(true);

  const load = (p: string) => {
    setRefreshing(true);
    getDashboard(PERIOD_PARAM[p] || 'year')
      .then(setData)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      // Boot gate already fetched the default period — don't hit the backend twice
      if (initialData && period === 'This year') return;
    }
    load(period);
  }, [period]);

  const handleNavigate = (path: string) => {
    if (path === '/workspace') { onViewChange('setup'); return; }
    navigate(LINK_MAP[path] || path);
  };

  if (view === 'setup') {
    return (
      <div>
        <button onClick={() => onViewChange('dashboard')} className="mb-4 text-xs font-semibold text-emerald-700 hover:underline">
          ← Back to Dashboard
        </button>
        <SetupHome user={user} />
      </div>
    );
  }

  if (view === 'myhome') {
    return <MyHome />;
  }

  return (
    <DashboardHome
      data={data}
      user={{ name: user?.name || user?.email?.split('@')[0] || '', org: user?.orgName || '', role: 'Enterprise Buyer' }}
      period={period}
      onPeriod={setPeriod}
      onRefresh={() => load(period)}
      refreshing={refreshing}
      onNavigate={handleNavigate}
    />
  );
}
