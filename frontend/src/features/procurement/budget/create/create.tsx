import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createBudget, getBudget, updateBudget, getBills } from '../../../../api';
import { useTags } from '../../../settings/bind';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORIES = [
  'Food & Beverage', 'Housekeeping', 'Engineering', 'Office Supplies',
  'Linen & Laundry', 'Kitchen Equipment', 'Maintenance', 'Transport',
  'Utilities', 'Marketing', 'Staff Welfare', 'Other',
];

const FISCAL_YEARS = [2024, 2025, 2026, 2027, 2028].map((y) => ({
  id: String(y),
  label: `Jan ${y} - Dec ${y}`,
  start: `${y}-01-01`,
}));

const PERIODS = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly', label: 'Yearly' },
];

const BUDGET_TYPES = ['Amount', 'Quantity'];

const INPUT =
  'h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA] bg-white';
const LABEL = 'text-[13px] text-slate-800';
const REQ = 'text-red-600';

const fmtMoney = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Col = { index: number; label: string; year: number; month: number; span: number };

function columnsFor(fiscalStart: string, period: string): Col[] {
  const s = new Date(`${fiscalStart}T00:00:00`);
  const y = s.getFullYear();
  if (period === 'quarterly') {
    return [0, 1, 2, 3].map((q) => ({
      index: q,
      label: `Q${q + 1} ${y}`,
      year: y,
      month: q * 3,
      span: 3,
    }));
  }
  if (period === 'yearly') {
    return [{ index: 0, label: `FY ${y}`, year: y, month: 0, span: 12 }];
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, i, 1);
    return { index: i, label: `${MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth(), span: 1 };
  });
}

const billTotal = (b: any) =>
  Number(b.total ?? (b.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.rate || 0), 0));

export function BudgetCreatePage({ editId }: { editId?: string }) {
  const navigate = useNavigate();
  const isEdit = !!editId;
  const [bills, setBills] = useState<any[]>([]);
  const [editLoading, setEditLoading] = useState(isEdit);
  const [editName, setEditName] = useState('');
  const [name, setName] = useState('');
  const [fiscalId, setFiscalId] = useState(String(new Date().getFullYear()));
  const [period, setPeriod] = useState('monthly');
  const [budgetType, setBudgetType] = useState('Amount');
  const [showTag, setShowTag] = useState(false);
  const [tag, setTag] = useState('');
  const tagOptions = useTags();
  const [cats, setCats] = useState<string[]>(['All']);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [catPicker, setCatPicker] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editId) return;
    setEditLoading(true);
    getBudget(editId)
      .then((b: any) => {
        const budget = b?.data ?? b;
        setEditName(budget.name || '');
        setName(budget.name || '');
        const fy = FISCAL_YEARS.find((f) => f.label === budget.fiscalYear);
        const startYear = budget.fiscalStart ? new Date(budget.fiscalStart).getFullYear() : new Date().getFullYear();
        setFiscalId(fy ? fy.id : String(startYear));
        setPeriod(['monthly', 'quarterly', 'yearly'].includes(budget.period) ? budget.period : 'monthly');
        setBudgetType(budget.budgetType || 'Amount');
        if (budget.tag) { setTag(budget.tag); setShowTag(true); }
        const lines = Array.isArray(budget.lines) ? budget.lines : [];
        const categories = Array.from(new Set(lines.map((l: any) => l.category || 'All')));
        if (!categories.includes('All')) categories.unshift('All');
        setCats(categories as string[]);
        const m: Record<string, string> = {};
        lines.forEach((l: any) => {
          if (Number(l.amount) > 0) m[`${l.category || 'All'}::${l.monthIndex}`] = String(l.amount);
        });
        setAmounts(m);
      })
      .catch((e: any) => setError(e?.message || 'Failed to load budget'))
      .finally(() => setEditLoading(false));
  }, [editId]);

  const fiscal = FISCAL_YEARS.find((f) => f.id === fiscalId) || FISCAL_YEARS[2];
  const cols = useMemo(() => columnsFor(fiscal.start, period), [fiscal, period]);

  const resetGrid = (nextFiscal: string, nextPeriod: string) => {
    setFiscalId(nextFiscal);
    setPeriod(nextPeriod);
    setCats(['All']);
    setAmounts({});
  };

  const cellKey = (cat: string, idx: number) => `${cat}::${idx}`;
  const cellNum = (cat: string, idx: number) => Number(amounts[cellKey(cat, idx)] || 0) || 0;

  const catTotal = (cat: string) => cols.reduce((s, c) => s + cellNum(cat, c.index), 0);
  const grandTotal = useMemo(() => cats.reduce((s, cat) => s + catTotal(cat), 0), [cats, amounts, cols]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const prefillActuals = () => {
    const m: Record<string, string> = {};
    cols.forEach((c) => {
      let sum = 0;
      bills.forEach((b: any) => {
        if (!b.issueDate) return;
        const d = new Date(b.issueDate);
        if (Number.isNaN(d.getTime())) return;
        // same months, previous year
        for (let k = 0; k < c.span; k++) {
          const mm = (c.month + k) % 12;
          const yy = c.year - 1 + (c.month + k > 11 ? 1 : 0);
          if (d.getFullYear() === yy && d.getMonth() === mm) sum += billTotal(b);
        }
      });
      if (sum > 0) m[cellKey('All', c.index)] = String(Math.round(sum * 100) / 100);
    });
    setAmounts((a) => ({ ...a, ...m }));
    setNotice('All-category months filled from last year actuals. Category rows are untouched.');
  };

  const addCategory = (cat: string) => {
    setCats((cs) => (cs.includes(cat) ? cs : [...cs, cat]));
    setCatPicker(false);
  };

  const removeCategory = (cat: string) => {
    setCats((cs) => cs.filter((c) => c !== cat));
    setAmounts((a) => {
      const next = { ...a };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${cat}::`)) delete next[k]; });
      return next;
    });
  };

  const validate = (): string => {
    if (!name.trim()) return 'Enter a budget name';
    return '';
  };

  const buildLines = () => {
    const lines: { category: string; monthIndex: number; amount: number }[] = [];
    cats.forEach((cat) => {
      cols.forEach((c) => {
        const amt = cellNum(cat, c.index);
        if (amt > 0) lines.push({ category: cat, monthIndex: c.index, amount: Math.round(amt * 100) / 100 });
      });
    });
    return lines;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      window.scrollTo({ top: 0 });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        fiscalYear: fiscal.label,
        fiscalStart: fiscal.start,
        period,
        budgetType,
        tag: showTag ? tag.trim() || undefined : undefined,
        lines: buildLines(),
      };
      if (isEdit && editId) {
        await updateBudget(editId, payload);
      } else {
        await createBudget(payload);
      }
      navigate('/workspace/budgets', { state: { notice: isEdit ? `Budget "${name.trim()}" updated.` : `Budget "${name.trim()}" created.` } });
    } catch (e: any) {
      setError(e?.message || 'Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  // dynamic grid: sticky category column + scrollable month columns
  const gridCols = `minmax(180px,1.4fr) repeat(${cols.length}, minmax(110px,1fr)) minmax(110px,0.9fr)`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — Zoho style */}
      <div className="flex items-center gap-2.5 px-1 pt-1 pb-3 shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-slate-800">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.7} />
          <path d="M3 9h18M8 4v5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
        </svg>
        <h2 className="text-[20px] font-medium text-slate-900 flex-1">
          {isEdit ? `Edit Budget${editName ? ` — ${editName}` : ''}` : 'New Budget'}
        </h2>
        <button
          onClick={() => navigate('/workspace/budgets')}
          className="w-9 h-9 rounded-md border border-slate-300 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center"
          aria-label="Close"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
        </button>
      </div>

      {error && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3 shrink-0" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3 shrink-0" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {editLoading && (
        <div className="mx-1 mb-3 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 shrink-0" role="status">
          Loading budget…
        </div>
      )}

      {/* Body scrolls vertically; the category grid scrolls horizontally */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-4">
        <div className="px-1 max-w-3xl space-y-5">
          <div>
            <label className={`${LABEL} block mb-1.5`}>Name<span className={REQ}> *</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} w-full max-w-md`} />
          </div>
          <div>
            <label className={`${LABEL} block mb-1.5`}>Fiscal Year<span className={REQ}> *</span></label>
            <select value={fiscalId} onChange={(e) => resetGrid(e.target.value, period)} className={`${INPUT} w-full max-w-md bg-white`}>
              {FISCAL_YEARS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className={`${LABEL} block mb-1.5`}>Budget Period<span className={REQ}> *</span></label>
            <select value={period} onChange={(e) => resetGrid(fiscalId, e.target.value)} className={`${INPUT} w-full max-w-md bg-white`}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {!showTag ? (
            <button onClick={() => setShowTag(true)} className="text-[13px] text-[#2084FA] hover:underline flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12l-8 8-9-9V4h7l10 8z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /></svg>
              Create this budget for a specific tag or project
            </button>
          ) : (
            <div>
              <label className={`${LABEL} block mb-1.5`}>Tag / Project</label>
              <div className="flex gap-2 max-w-md">
                <input value={tag} onChange={(e) => setTag(e.target.value)} list="budget-tags" placeholder="e.g. Galle Face — F&B" className={`${INPUT} flex-1 min-w-0`} />
                <datalist id="budget-tags">
                  {tagOptions.map((t) => <option key={t} value={t} />)}
                </datalist>
                <button onClick={() => { setShowTag(false); setTag(''); }} className="text-xs text-slate-400 hover:text-rose-500 whitespace-nowrap">Remove</button>
              </div>
            </div>
          )}
          <div>
            <label className={`${LABEL} block mb-1.5`}>Budget Type<span className={REQ}> *</span></label>
            <select value={budgetType} onChange={(e) => setBudgetType(e.target.value)} className={`${INPUT} w-full max-w-md bg-white`}>
              {BUDGET_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Category × months grid — horizontal scroll */}
        <div className="px-1 mt-6">
          <div className="flex items-center justify-end max-w-none mb-2">
            <button onClick={prefillActuals} className="text-[13px] text-[#2084FA] hover:underline flex items-center gap-1 whitespace-nowrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.7} /></svg>
              Pre-fill from Previous Years' Actuals
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 overflow-x-auto bg-white">
            <div style={{ minWidth: `${220 + cols.length * 120 + 120}px` }}>
              <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: gridCols }}>
                <span className="px-4 py-2.5 border-r border-slate-200 sticky left-0 bg-[#f8fafc] z-10">Category</span>
                {cols.map((c) => <span key={c.index} className="px-2 py-2.5 border-r border-slate-100 text-right whitespace-nowrap">{c.label}</span>)}
                <span className="px-2 py-2.5 text-right">Total</span>
              </div>
              {cats.map((cat) => (
                <div key={cat} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white" style={{ gridTemplateColumns: gridCols }}>
                  <span className="px-4 py-1.5 border-r border-slate-200 flex items-center gap-2 sticky left-0 bg-white z-10">
                    <span className="font-medium text-slate-800 truncate flex-1">{cat}</span>
                    {cat !== 'All' && (
                      <button onClick={() => removeCategory(cat)} className="text-slate-300 hover:text-rose-500 text-base leading-none shrink-0" aria-label={`Remove ${cat}`}>×</button>
                    )}
                  </span>
                  {cols.map((c) => (
                    <span key={c.index} className="px-2 py-1.5 border-r border-slate-100">
                      <input
                        value={amounts[cellKey(cat, c.index)] ?? ''}
                        onChange={(e) => setAmounts((a) => ({ ...a, [cellKey(cat, c.index)]: e.target.value }))}
                        type="number" min={0} step="0.01"
                        placeholder="0"
                        className="w-full h-9 px-2 rounded text-right tabular-nums text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-300"
                      />
                    </span>
                  ))}
                  <span className="px-2 py-1.5 flex items-center justify-end tabular-nums font-semibold">{fmtMoney(catTotal(cat))}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-3">
            {!catPicker ? (
              <button onClick={() => setCatPicker(true)} className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
                Add Category Row
              </button>
            ) : (
              <div className="rounded-lg bg-white border border-slate-200 shadow-xl p-2 w-72">
                {CATEGORIES.filter((c) => !cats.includes(c)).map((c) => (
                  <button key={c} onClick={() => addCategory(c)} className="w-full px-3 py-2 text-[13px] text-left text-slate-700 hover:bg-slate-50 rounded-md">{c}</button>
                ))}
                {CATEGORIES.every((c) => cats.includes(c)) && <p className="px-3 py-2 text-[13px] text-slate-400">All categories added.</p>}
                <button onClick={() => setCatPicker(false)} className="w-full px-3 py-2 text-[13px] text-left text-slate-400 hover:bg-slate-50 rounded-md">Done</button>
              </div>
            )}
          </div>
          <div className="flex justify-end mt-4">
            <div className="rounded-xl bg-slate-50/70 px-4 py-3 text-[13px] flex items-center gap-6">
              <span className="font-bold text-slate-900 text-[15px]">Budget Total</span>
              <span className="tabular-nums font-bold text-[15px]">{fmtMoney(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-200 px-1 pb-1 bg-white sticky bottom-0 shrink-0">
        <button
          onClick={save}
          disabled={saving || editLoading}
          className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save'}
        </button>
        <button
          onClick={() => navigate('/workspace/budgets')}
          className="px-4 h-9 rounded-md border border-slate-300 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function BudgetEditPage() {
  const { id } = useParams<{ id: string }>();
  return <BudgetCreatePage editId={id} />;
}
