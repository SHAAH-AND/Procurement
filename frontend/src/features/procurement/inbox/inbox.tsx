import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBill, getBills } from '../../../api';

type InboxFile = { id: string; name: string; size: number; addedAt: string };
type InboxConfig = { prefix: string };

const CONFIG_KEY = 'pf-inbox-config';
const DOMAIN = 'inbox.procureflow.io';

function loadConfig(): InboxConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && typeof c.prefix === 'string' && c.prefix ? c : null;
  } catch { return null; }
}

function randomSuffix(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s}_${Math.random().toString(36).slice(2, 8)}`;
}

const fmtSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
};

export function InboxPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<InboxConfig | null>(() => loadConfig());
  const [editing, setEditing] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [copied, setCopied] = useState(false);
  const [files, setFiles] = useState<InboxFile[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const attachRef = useRef<HTMLDivElement>(null);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [convertVendor, setConvertVendor] = useState('');
  const [convertAmount, setConvertAmount] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const address = config ? `${config.prefix}@${DOMAIN}` : '';

  useEffect(() => {
    if (!attachOpen) return;
    const close = (e: MouseEvent) => {
      if (attachRef.current && !attachRef.current.contains(e.target as Node)) setAttachOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [attachOpen]);

  useEffect(() => {
    getBills().then((r: any) => setBills(Array.isArray(r) ? r : r?.data || [])).catch(() => {});
  }, []);

  const startEdit = () => {
    setPrefix(config?.prefix.split('.')[0] || '');
    setEditing(true);
  };

  const saveConfig = (p: string) => {
    const clean = p.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'procurement';
    const next = { prefix: `${clean}.${randomSuffix()}` };
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setConfig(next);
    setEditing(false);
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError('Copy failed — select the address manually.'); }
  };

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setFiles((fs) => [
      ...arr.map((f) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, size: f.size, addedAt: new Date().toISOString() })),
      ...fs,
    ]);
    setNotice(`${arr.length} file(s) added to the inbox.`);
  };

  const suggestions = useMemo(() => {
    const map = new Map<string, any[]>();
    files.forEach((f) => {
      const name = f.name.toLowerCase();
      const hits = bills.filter((b: any) => {
        const v = String(b.vendorName || '').toLowerCase();
        return v && name.includes(v.split(' ')[0]) && ['draft', 'open', 'pending'].includes(String(b.status || '').toLowerCase());
      }).slice(0, 3);
      map.set(f.id, hits);
    });
    return map;
  }, [files, bills]);

  const convert = async () => {
    const file = files.find((f) => f.id === convertId);
    if (!file) return;
    if (!convertVendor.trim()) { setError('Pick a vendor for the bill'); return; }
    const amount = Number(convertAmount) || 0;
    if (amount <= 0) { setError('Enter the bill amount'); return; }
    setSaving(true);
    setError('');
    try {
      await createBill({
        vendorName: convertVendor.trim(),
        notes: `Created from inbox file: ${file.name}`,
        lines: [{ itemName: `As per attached bill ${file.name}`, quantity: 1, rate: amount }],
      });
      setFiles((fs) => fs.filter((f) => f.id !== convertId));
      setConvertId(null);
      setConvertVendor('');
      setConvertAmount('');
      setNotice(`"${file.name}" converted to a draft bill.`);
    } catch (e: any) { setError(e?.message || 'Convert failed'); } finally { setSaving(false); }
  };

  // ── Configuration gate (Zoho requires the inbox address to be configured first) ──
  if (!config) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-[20px] font-bold text-[#07175A] px-1 pt-1 pb-3">Inbox</h2>
        <div className="flex-1 overflow-auto">
          <div className="py-16 flex flex-col items-center text-center px-6 max-w-xl mx-auto">
            <div className="w-[72px] h-[72px] rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.08)] flex items-center justify-center mb-6">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="text-slate-800"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h3 className="text-[22px] font-bold text-slate-900">Set Up Your Bill Inbox</h3>
            <p className="text-[15px] text-slate-500 mt-3">Generate a unique email address for your organization. Forward vendor bills to it and they will land here, ready to verify and convert.</p>
            <button onClick={() => saveConfig('procurement')} className="mt-6 px-5 py-2.5 rounded-md bg-[#2084FA] text-white text-[14px] font-semibold hover:bg-[#1a6fd6] shadow-sm">
              Generate Inbox Address
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-[20px] font-bold text-[#07175A] px-1 pt-1 pb-3">Inbox</h2>

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-blue-50 border-blue-200 text-blue-800 flex items-center justify-between gap-3" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Inbound address banner — Zoho style */}
      <div className="mx-1 mb-4 rounded-lg bg-[#f2f7ff] border border-[#dbe7fb] px-4 py-3 flex items-center gap-2.5 flex-wrap text-[13.5px]">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="shrink-0"><circle cx="12" cy="12" r="10" fill="#dbeafe" /><rect x="6" y="8.5" width="12" height="8" rx="1.5" fill="#2084FA" /><path d="M6.5 9.5l5.5 3.5 5.5-3.5" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-slate-700">Receive vendor bills in ProcureFlow by sending them to the following email address :</span>
        {editing ? (
          <span className="flex items-center gap-2 flex-wrap">
            <input
              autoFocus value={prefix} onChange={(e) => setPrefix(e.target.value)}
              placeholder="organization"
              className="h-8 px-2.5 rounded-md border border-slate-300 text-[13px] w-40 focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
            />
            <span className="text-slate-500 text-[13px]">@{DOMAIN}</span>
            <button onClick={() => saveConfig(prefix)} className="px-3 h-8 rounded-md bg-[#2084FA] text-white text-xs font-semibold hover:bg-[#1a6fd6]">Save</button>
            <button onClick={() => setEditing(false)} className="px-3 h-8 rounded-md bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50">Cancel</button>
          </span>
        ) : (
          <>
            <span className="font-semibold text-slate-900 break-all">{address}</span>
            <button onClick={copyAddress} className="flex items-center gap-1 text-[13px] font-medium text-[#2084FA] hover:text-[#1a6fd6]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth={1.7} /><path d="M5 15V6a2 2 0 012-2h9" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <span className="text-slate-300">|</span>
            <button onClick={startEdit} className="flex items-center gap-1 text-[13px] font-medium text-[#2084FA] hover:text-[#1a6fd6]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
              Edit
            </button>
          </>
        )}
      </div>

      {/* Dropzone — Zoho style */}
      <div className="flex-1 overflow-auto px-1 pb-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className={`mx-auto max-w-4xl rounded-xl border border-dashed px-6 py-16 flex flex-col items-center text-center cursor-pointer transition-colors ${dragOver ? 'border-[#2084FA] bg-blue-50/50' : 'border-slate-300 bg-white'}`}
        >
          <span className="w-14 h-14 rounded-full bg-[#e8f1fe] flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#2084FA]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.7} /><path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <h3 className="text-[16px] font-semibold text-slate-900">Upload Bills</h3>
          <p className="text-[14px] text-slate-600 mt-1.5">Drag & Drop or <span className="text-[#2084FA] font-medium">Click to Upload</span> your bills<br />directly into the inbox</p>
          <div className="relative mt-5" ref={attachRef}>
            <button onClick={(e) => { e.stopPropagation(); setAttachOpen((v) => !v); }} className="px-5 h-10 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] inline-flex items-center shadow-sm">Upload Bills</button>
            {attachOpen && (
              <div onClick={(e) => { e.stopPropagation(); setAttachOpen(false); fileRef.current?.click(); }} className="absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap rounded-lg bg-white border border-slate-200 shadow-xl px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 cursor-pointer">
                Attach From Desktop
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.csv,.xls,.xlsx" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {/* Inbox files */}
        {files.length > 0 && (
          <div className="mx-auto max-w-4xl mt-6 rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="col-span-5">File</span>
              <span className="col-span-2">Size</span>
              <span className="col-span-2">Added</span>
              <span className="col-span-3">Suggested Match</span>
            </div>
            {files.map((f) => {
              const hits = suggestions.get(f.id) || [];
              return (
                <div key={f.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-100 text-[13px] last:border-0 items-center">
                  <span className="col-span-5 font-medium text-slate-900 truncate" title={f.name}>{f.name}</span>
                  <span className="col-span-2 text-slate-600 tabular-nums">{fmtSize(f.size)}</span>
                  <span className="col-span-2 text-slate-600">{fmtDate(f.addedAt)}</span>
                  <span className="col-span-3 flex items-center justify-end gap-2">
                    {hits.length > 0 && <span className="text-xs text-slate-500 truncate" title={hits.map((h: any) => h.billNumber || h.vendorName).join(', ')}>{hits[0].billNumber || hits[0].vendorName}</span>}
                    <button onClick={() => { setConvertId(f.id); setConvertVendor(''); setConvertAmount(''); setError(''); }} className="text-xs font-semibold text-[#2084FA] hover:underline whitespace-nowrap">Convert to Bill</button>
                    <button onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} className="text-slate-300 hover:text-rose-500" aria-label={`Remove ${f.name}`}>×</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Convert modal */}
      {convertId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-16 px-4" onClick={() => setConvertId(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Convert to Bill</h3>
              <button onClick={() => setConvertId(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Vendor *</label>
                <input value={convertVendor} onChange={(e) => setConvertVendor(e.target.value)} placeholder="Vendor name" className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Bill Amount *</label>
                <input value={convertAmount} onChange={(e) => setConvertAmount(e.target.value)} type="number" min={0} step="0.01" placeholder="0.00" className="mt-1 w-full h-9 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConvertId(null)} className="px-4 h-9 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">Cancel</button>
                <button onClick={convert} disabled={saving} className="px-4 h-9 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Create Draft Bill</button>
              </div>
              <button onClick={() => { setConvertId(null); navigate('/workspace/bills'); }} className="w-full text-center text-xs font-semibold text-[#2084FA] hover:underline">View Bills instead</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
