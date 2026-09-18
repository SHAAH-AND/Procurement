import { useState } from 'react';
import { useSettingKey, saveSettings } from '../service';
import { INPUT, CrudList, ToggleRows } from '../blocks';
import { apiCallLog } from '../../../api';

// ── Zoho Apps connection ──

export function ZohoAppsPage() {
  const { value, loading } = useSettingKey<Record<string, any>>('dev.integrations', {});
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const zoho = { enabled: false, clientId: '', clientSecret: '', dataCenter: 'zoho.com', ...(draft ?? value ?? {}).zoho };
  const set = (patch: Record<string, any>) => setDraft({ ...(draft ?? value ?? {}), zoho: { ...zoho, ...patch } });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ 'dev.integrations': { ...((draft ?? value ?? {}) as object), zoho } });
      setDraft(null);
      setMsg(zoho.enabled ? 'Saved. No live Zoho connection is established yet.' : 'Saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-5">
      <label className="flex items-center gap-2.5 text-[13px] text-slate-800 cursor-pointer">
        <input type="checkbox" checked={!!zoho.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]" />
        Connect Zoho Apps
      </label>
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Client ID</label>
        <input value={zoho.clientId || ''} onChange={(e) => set({ clientId: e.target.value })} className={`${INPUT} w-full max-w-md mt-1.5`} />
      </div>
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Client Secret</label>
        <input value={zoho.clientSecret || ''} onChange={(e) => set({ clientSecret: e.target.value })} type="password" placeholder="Stored for this organization" className={`${INPUT} w-full max-w-md mt-1.5`} />
      </div>
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Data Center</label>
        <select value={zoho.dataCenter || 'zoho.com'} onChange={(e) => set({ dataCenter: e.target.value })} className={`${INPUT} w-full max-w-md mt-1.5`}>
          {['zoho.com', 'zoho.eu', 'zoho.in', 'zoho.com.au'].map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <p className={`text-[13px] ${zoho.enabled ? 'text-amber-600' : 'text-slate-400'}`}>
        {zoho.enabled ? 'Marked enabled, but no OAuth handshake runs yet — treat as not connected.' : 'Not connected.'}
      </p>
      <div className="flex items-center gap-3">
        {draft && (
          <button onClick={save} disabled={saving} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

// ── Webhooks with a live ping test ──

type Hook = { name: string; url: string; events: string };

export function WebhooksPage() {
  const { value, loading } = useSettingKey<Hook[]>('dev.webhooks', []);
  const [rows, setRows] = useState<Hook[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testOut, setTestOut] = useState<Record<number, string>>({});

  const cur = rows ?? (Array.isArray(value) ? value : []);
  const setCell = (i: number, id: keyof Hook, v: string) =>
    setRows(cur.map((r, j) => (j === i ? { ...r, [id]: v } : r)));

  const save = async () => {
    const clean = cur.filter((r) => r.name.trim() && r.url.trim());
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({ 'dev.webhooks': clean });
      setRows(null);
      setMsg('Saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const ping = async (i: number) => {
    const url = cur[i]?.url?.trim();
    if (!url) return;
    setTesting(i);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'procureflow.ping', at: new Date().toISOString() }),
      });
      setTestOut((o) => ({ ...o, [i]: `HTTP ${res.status} ${res.ok ? '— delivered' : '— rejected'}` }));
    } catch (e: any) {
      setTestOut((o) => ({ ...o, [i]: `Unreachable (${e?.message || 'network error'})` }));
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="max-w-4xl">
      <p className="text-[13px] text-slate-500 mb-3">POST a signed ping to any URL and see the real result. Events is a comma list like <span className="tabular-nums">bill.approve, payment.record</span>.</p>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: 'minmax(140px,1fr) minmax(200px,1.4fr) minmax(160px,1fr) 90px 40px' }}>
          <span className="px-3 py-2.5 border-r border-slate-100">Name</span>
          <span className="px-3 py-2.5 border-r border-slate-100">URL</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Events</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Test</span>
          <span />
        </div>
        {cur.length === 0 && <div className="py-8 text-center text-[13px] text-slate-400">No webhooks yet.</div>}
        {cur.map((r, i) => (
          <div key={i}>
            <div className="grid gap-0 border-b border-slate-100 text-[13px] bg-white" style={{ gridTemplateColumns: 'minmax(140px,1fr) minmax(200px,1.4fr) minmax(160px,1fr) 90px 40px' }}>
              <span className="px-2 py-1.5 border-r border-slate-100">
                <input value={r.name} onChange={(e) => setCell(i, 'name', e.target.value)} placeholder="e.g. Slack alerts" className="w-full h-8 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-300" />
              </span>
              <span className="px-2 py-1.5 border-r border-slate-100">
                <input value={r.url} onChange={(e) => setCell(i, 'url', e.target.value)} placeholder="https://…" className="w-full h-8 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-300" />
              </span>
              <span className="px-2 py-1.5 border-r border-slate-100">
                <input value={r.events} onChange={(e) => setCell(i, 'events', e.target.value)} placeholder="bill.approve" className="w-full h-8 px-2 rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-[#2084FA]/30 placeholder:text-slate-300" />
              </span>
              <span className="px-2 py-1.5 border-r border-slate-100 flex items-center">
                <button onClick={() => ping(i)} disabled={testing === i} className="text-[13px] font-medium text-[#2084FA] hover:underline disabled:opacity-50">
                  {testing === i ? 'Pinging…' : 'Ping'}
                </button>
              </span>
              <span className="flex items-center justify-center">
                <button onClick={() => setRows(cur.filter((_, j) => j !== i))} className="text-slate-300 hover:text-rose-500 text-lg leading-none" aria-label="Remove webhook">×</button>
              </span>
            </div>
            {testOut[i] && <div className="px-3 py-1.5 text-xs text-slate-500 bg-slate-50 border-b border-slate-100 tabular-nums">{testOut[i]}</div>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => setRows([...cur, { name: '', url: '', events: '' }])}
          className="px-3 h-9 rounded-md bg-slate-100 text-[13px] font-medium text-slate-700 hover:bg-slate-200 flex items-center gap-1.5"
        >
          <span className="w-4 h-4 rounded-full bg-[#2084FA] text-white flex items-center justify-center text-xs leading-none">+</span>
          Add Webhook
        </button>
        {rows && (
          <button onClick={save} disabled={saving} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

// ── Connections: plain persisted directory ──

export function ConnectionsPage() {
  return (
    <CrudList
      storageKey="dev.connections"
      columns={[
        { id: 'name', label: 'Connection', placeholder: 'e.g. Tally ERP' },
        { id: 'type', label: 'Type', placeholder: 'e.g. Accounting' },
        { id: 'detail', label: 'Detail', placeholder: 'Host, account, notes…' },
      ]}
      addLabel="Add Connection"
      emptyText="No connections yet."
    />
  );
}

// ── API catalog + this-session call counter ──

const CATALOG: { method: string; path: string; desc: string }[] = [
  { method: 'POST', path: '/api/v1/auth/login', desc: 'Sign in, returns a JWT' },
  { method: 'POST', path: '/api/v1/auth/signup', desc: 'Create organization + first user' },
  { method: 'GET', path: '/api/v1/auth/me', desc: 'Current user + tenant' },
  { method: 'GET/POST', path: '/api/v1/bills', desc: 'List / create bills' },
  { method: 'PATCH/DELETE', path: '/api/v1/bills/:id', desc: 'Edit / delete a bill' },
  { method: 'POST', path: '/api/v1/bills/:id/submit|approve|void|pay', desc: 'Bill lifecycle + payments' },
  { method: 'GET/POST', path: '/api/v1/pos', desc: 'List / create purchase orders' },
  { method: 'GET/POST', path: '/api/v1/receives[/from-po]', desc: 'Goods receipts' },
  { method: 'GET/POST', path: '/api/v1/vendors', desc: 'Vendor directory' },
  { method: 'GET/POST', path: '/api/v1/items', desc: 'Item catalog' },
  { method: 'POST', path: '/api/v1/payments/multi', desc: 'Pay several bills at once' },
  { method: 'GET/POST', path: '/api/v1/batches', desc: 'Payment batches' },
  { method: 'GET/POST', path: '/api/v1/recurrence', desc: 'Recurring bill schedules' },
  { method: 'GET/POST', path: '/api/v1/budgets', desc: 'Fiscal budgets' },
  { method: 'GET/PATCH', path: '/api/v1/settings', desc: 'Tenant settings store' },
  { method: 'GET/POST', path: '/api/v1/users', desc: 'Tenant users' },
  { method: 'GET', path: '/api/v1/roles', desc: 'Roles + permissions' },
  { method: 'GET', path: '/api/v1/dashboard/summary', desc: 'Dashboard aggregates' },
];

export function ApiUsagePage() {
  const [tick, setTick] = useState(0);
  const log = apiCallLog();
  void tick;
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-[13px] text-blue-800">
          Calls this session: <strong className="tabular-nums">{log.length}</strong>
        </span>
        <button onClick={() => setTick((t) => t + 1)} className="text-[13px] text-[#2084FA] hover:underline">Refresh counter</button>
        <span className="text-xs text-slate-400">Server-side metering is not instrumented — this counts calls from your browser.</span>
      </div>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="grid gap-0 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500" style={{ gridTemplateColumns: '110px minmax(220px,1fr) minmax(200px,1.2fr)' }}>
          <span className="px-3 py-2.5 border-r border-slate-100">Method</span>
          <span className="px-3 py-2.5 border-r border-slate-100">Path</span>
          <span className="px-3 py-2.5">Description</span>
        </div>
        {CATALOG.map((c) => (
          <div key={`${c.method}${c.path}`} className="grid gap-0 border-b border-slate-100 last:border-0 text-[13px] bg-white" style={{ gridTemplateColumns: '110px minmax(220px,1fr) minmax(200px,1.2fr)' }}>
            <span className="px-3 py-2 border-r border-slate-100 font-bold text-[#2084FA] tabular-nums">{c.method}</span>
            <span className="px-3 py-2 border-r border-slate-100 tabular-nums text-slate-800">{c.path}</span>
            <span className="px-3 py-2 text-slate-500">{c.desc}</span>
          </div>
        ))}
      </div>
      {log.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[13px] font-bold text-slate-900 mb-2">Recent calls (newest first)</h4>
          <div className="rounded-lg border border-slate-200 overflow-hidden max-h-56 overflow-y-auto">
            {log.slice(0, 30).map((l, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 last:border-0 bg-white text-xs tabular-nums">
                <span className="text-slate-400 w-20">{new Date(l.at).toLocaleTimeString()}</span>
                <span className="font-bold text-slate-700 w-14">{l.method}</span>
                <span className="text-slate-600 truncate">{l.path}</span>
                <span className={l.ok ? 'text-blue-700' : 'text-rose-600'}>{l.status || (l.ok ? 'ok' : 'fail')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Platform feature flags (honest: toggles tracked, providers not connected) ──

export function PlatformFeaturesPage() {
  return (
    <div className="max-w-2xl">
      <p className="text-[13px] text-slate-500 mb-3">No providers are connected yet — toggles record intent only.</p>
      <ToggleRows
        storageKey="dev.features"
        items={[
          { id: 'widgets', label: 'Widgets', desc: 'Embeddable dashboard widgets.' },
          { id: 'signals', label: 'Signals', desc: 'Event signals for automations.' },
          { id: 'deluge', label: 'Deluge Components', desc: 'Scripted UI components.' },
          { id: 'webforms', label: 'Web Forms', desc: 'Public intake forms.' },
          { id: 'datamgmt', label: 'Data Management', desc: 'Import, export and retention.' },
        ]}
      />
    </div>
  );
}
