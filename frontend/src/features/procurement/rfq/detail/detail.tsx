import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocStatusPill } from '../../shared/hooks';
import { getRfq, getRfqCompare, rfqAction, awardToPo, getMe } from '../../../../api';

type DetailTab = 'details' | 'items' | 'vendors' | 'team';

const STAGES = ['Draft', 'Published', 'Awarded', 'Closed'];

function stageIndex(status?: string): number {
  switch ((status || '').toLowerCase()) {
    case 'submitted':
    case 'published': return 1;
    case 'awarded_partial': return 2;
    case 'awarded': return 3;
    default: return 0;
  }
}

const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
};

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmtDate(iso);
};

type Comment = { name: string; text: string; at: string };
type Activity = { text: string; at: string };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

export function RfqDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rfq, setRfq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>('details');
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [compare, setCompare] = useState<any>(null);
  const [awardBid, setAwardBid] = useState('');
  const [awardQty, setAwardQty] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>(() => loadJson(`pf-rfq-comments-${id}`, []));
  const [activity, setActivity] = useState<Activity[]>(() => loadJson(`pf-rfq-activity-${id}`, []));
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    if (!id) return;
    setLoading(true);
    getRfq(id)
      .then((r: any) => setRfq(r?.data ?? r))
      .catch((e: any) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [id]);
  useEffect(() => { getMe().then(setMe).catch(() => {}); }, []);

  useEffect(() => {
    if (!tabMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setTabMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [tabMenuOpen]);

  const logActivity = (text: string) => {
    const entry = { text, at: new Date().toISOString() };
    setActivity((a) => {
      const next = [entry, ...a];
      try { localStorage.setItem(`pf-rfq-activity-${id}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const publish = async () => {
    if (!id) return;
    setActing(true);
    try {
      const updated: any = await rfqAction(id, 'submit');
      setRfq(updated?.data ?? updated);
      logActivity('Request for quote published.');
    } catch (e: any) { setError(e?.message || 'Publish failed'); } finally { setActing(false); }
  };

  const cancel = async () => {
    if (!id || !window.confirm(`Cancel ${rfq?.rfqNumber || 'this RFQ'}?`)) return;
    setActing(true);
    try {
      const updated: any = await rfqAction(id, 'cancel');
      setRfq(updated?.data ?? updated);
      logActivity('Request for quote cancelled.');
    } catch (e: any) { setError(e?.message || 'Cancel failed'); } finally { setActing(false); }
  };

  const showCompare = async () => {
    if (!id) return;
    try { setCompare(await getRfqCompare(id)); setAwardBid(''); setAwardQty({}); } catch (e: any) { setError(e?.message || 'Compare failed'); }
  };

  const award = async () => {
    const bidLines = Object.entries(awardQty).filter(([, q]) => Number(q) > 0).map(([bidLineId, q]) => ({ bidLineId, quantity: Number(q) }));
    if (!awardBid || !bidLines.length) { setError('Pick a bid and award quantities'); return; }
    setActing(true);
    try {
      await rfqAction(awardBid, 'award');
      logActivity('Bid awarded.');
      setCompare(null); setAwardBid(''); setAwardQty({});
      reload();
    } catch (e: any) { setError(e?.message || 'Award failed'); } finally { setActing(false); }
  };

  const convertToPo = async (awardId: string) => {
    setActing(true);
    try {
      await awardToPo(awardId);
      logActivity('Award converted to purchase order.');
      reload();
    } catch (e: any) { setError(e?.message || 'Convert to PO failed'); } finally { setActing(false); }
  };

  const postComment = () => {
    const text = commentText.trim();
    if (!text) return;
    const name = me?.name || me?.email?.split('@')[0] || 'You';
    const entry = { name, text, at: new Date().toISOString() };
    setComments((c) => {
      const next = [...c, entry];
      try { localStorage.setItem(`pf-rfq-comments-${id}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setCommentText('');
  };

  const team: any[] = useMemo(() => {
    try {
      const arr = rfq?.team ? JSON.parse(rfq.team) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }, [rfq]);

  const documents: string[] = useMemo(() => {
    try {
      const arr = rfq?.documents ? JSON.parse(rfq.documents) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }, [rfq]);

  const bids = useMemo(() => {
    const out: any[] = [];
    (rfq?.bids || []).forEach((b: any) => out.push(b));
    return out;
  }, [rfq]);

  const quotedCount = useMemo(() => {
    const vendors = rfq?.vendors || [];
    return vendors.filter((v: any) => ['quoted', 'submitted'].includes(String(v.quoteStatus || '').toLowerCase())).length;
  }, [rfq]);

  const activityFeed = useMemo(() => {
    const feed: (Activity & { key: string })[] = activity.map((a, i) => ({ ...a, key: `local-${i}` }));
    if (rfq?.updatedAt && rfq.updatedAt !== rfq.createdAt) feed.push({ key: 'updated', text: 'Request for quote updated.', at: rfq.updatedAt });
    if (rfq?.createdAt) feed.push({ key: 'created', text: 'Request for quote created.', at: rfq.createdAt });
    return feed.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [activity, rfq]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="py-20 text-center text-sm text-slate-400">Loading request for quote…</div>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="flex flex-col h-full">
        <div className="py-20 text-center">
          <div className="text-sm font-medium text-slate-700">Request for quote not found</div>
          <button onClick={() => navigate('/workspace/rfq')} className="mt-4 text-sm font-semibold text-[#2084FA] hover:underline">Back to Request for Quotes</button>
        </div>
      </div>
    );
  }

  const isDraft = rfq.status === 'draft';
  const canCancel = !['awarded', 'cancelled'].includes(rfq.status);
  const stage = stageIndex(rfq.status);
  const cancelled = ['cancelled', 'expired'].includes(String(rfq.status || '').toLowerCase());
  const authorName = me?.name || me?.email?.split('@')[0] || 'U';
  const bidPeriod = rfq.bidStart && rfq.bidEnd
    ? `${fmtDateTime(rfq.bidStart)} - ${fmtDateTime(rfq.bidEnd)}`
    : rfq.dueDate
      ? `Bidding closes ${fmtDate(rfq.dueDate)}`
      : '—';

  return (
    <div className="flex flex-col h-full">
      {/* Header — Zoho style */}
      <div className="flex items-center justify-between gap-3 px-1 pt-1 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[17px] font-semibold text-slate-900 truncate">{rfq.rfqNumber} - ({rfq.title || 'dddsd'})</h2>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{rfq.status}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setCommentsOpen(true)} className="flex items-center gap-1.5 text-[14px] font-medium text-[#2084FA] hover:text-[#1a6fd6]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h2a8 8 0 018 8z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /><circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="13" cy="12" r="1.2" fill="currentColor" /><circle cx="17" cy="12" r="1.2" fill="currentColor" /></svg>
            Comments
          </button>
          {isDraft && (
            <button onClick={publish} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60 shadow-sm">Publish</button>
          )}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setTabMenuOpen((v) => !v)} className="w-9 h-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500" aria-label="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
            </button>
            {tabMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-30">
                <button onClick={() => { window.print(); setTabMenuOpen(false); }} className="w-full px-4 py-2 text-[14px] text-left text-slate-800 hover:bg-slate-50 flex items-center gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-slate-500"><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v7H6z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
                  Print
                </button>
                {canCancel && (
                  <button onClick={() => { setTabMenuOpen(false); cancel(); }} className="w-full px-4 py-2 text-[14px] text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Cancel RFQ
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => navigate('/workspace/rfq')} className="w-9 h-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500" aria-label="Close details">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-1 mb-2 rounded-md px-4 py-2.5 text-sm font-medium border bg-rose-50 border-rose-200 text-rose-800 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-1 pb-6">
        {/* Summary band */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#2084FA] shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={1.7} /><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></svg>
            </span>
            <span>
              <span className="block text-[13px] text-slate-500">Bidding Period</span>
              <span className="block text-[14px] font-medium text-slate-900 mt-0.5">{bidPeriod}</span>
            </span>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#2084FA] shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 8l4 4 5-6 5 6 4-4-1.5 10h-15L3 8z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" /></svg>
            </span>
            <span>
              <span className="block text-[13px] text-slate-500">Awarding Date</span>
              <span className="block text-[14px] font-medium text-slate-900 mt-0.5">{fmtDate(rfq.awardDate) === '—' ? '-' : fmtDate(rfq.awardDate)}</span>
            </span>
          </div>
          <div>
            <div className="text-[14px] text-slate-600">Status: <span className="font-semibold text-slate-900 capitalize">{rfq.status}</span></div>
            <div className="flex mt-1.5" aria-label={`Stage ${stage + 1} of ${STAGES.length}`}>
              {STAGES.map((s, i) => (
                <span
                  key={s}
                  title={s}
                  className={`h-2 flex-1 ${i === 0 ? 'rounded-l-full' : ''} ${i === STAGES.length - 1 ? 'rounded-r-full' : ''} ${cancelled ? 'bg-slate-200' : i <= stage ? 'bg-[#2084FA]' : 'bg-slate-200'}`}
                  style={i > 0 ? { marginLeft: 3, clipPath: 'polygon(0 0, 100% 0, calc(100% - 6px) 50%, 100% 100%, 0 100%, 6px 50%)' } : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        {/* What's next */}
        <div className="mt-4 rounded-md bg-blue-50/70 border border-blue-100 px-4 py-3 text-[14px] text-slate-700 flex items-start gap-2.5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="text-purple-500 shrink-0 mt-0.5"><path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /><path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></svg>
          <span>
            <span className="font-semibold text-slate-900">What's next:</span>{' '}
            {(rfq.lines || []).length === 0
              ? 'Add the items for which you are creating the request for quote.'
              : (rfq.vendors || []).length === 0
                ? 'Add the vendors who will participate in this request for quote.'
                : isDraft
                  ? 'Publish the request for quote to invite vendors.'
                  : 'Track vendor participation and compare bids as they arrive.'}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mt-5 border-b border-slate-200">
          {(['details', 'items', 'vendors', 'team'] as DetailTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative pb-2.5 text-[14px] capitalize ${tab === t ? 'font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t}
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-[2.5px] rounded-t bg-[#2084FA]" />}
            </button>
          ))}
        </div>

        {tab === 'details' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl bg-white border border-slate-200 p-5">
                <h3 className="text-[15px] font-semibold text-slate-900">Vendor Participation Summary</h3>
                {isDraft && (rfq.vendors || []).length === 0 ? (
                  <p className="text-[14px] text-slate-500 mt-6 mb-2 text-center">Publish the request for quote, send invites to vendors, and track the participation summary here.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 py-3">
                      <div className="text-[20px] font-bold text-slate-900 tabular-nums">{(rfq.vendors || []).length}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Invited</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 py-3">
                      <div className="text-[20px] font-bold text-slate-900 tabular-nums">{quotedCount}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Quoted</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 py-3">
                      <div className="text-[20px] font-bold text-slate-900 tabular-nums">{bids.length}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Bids</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-5">
                <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Activity Logs</h3>
                <div className="space-y-4">
                  {activityFeed.map((a) => (
                    <div key={a.key} className="flex gap-3">
                      <span className="flex flex-col items-center">
                        <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex items-center justify-center border border-emerald-100">{authorName.charAt(0).toUpperCase()}</span>
                        <span className="w-px flex-1 bg-slate-200 mt-1" />
                      </span>
                      <span className="pb-1">
                        <span className="block text-[13px] text-slate-700"><span className="font-medium">{authorName}</span> <span className="text-slate-400 text-xs ml-1">{timeAgo(a.at)}</span></span>
                        <span className="block text-[13px] text-slate-600 mt-0.5">{a.text}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <aside className="rounded-xl bg-[#fbfcff] border border-slate-200 p-5 h-fit">
              <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Basic Details</h3>
              <dl className="space-y-4 text-[14px]">
                <div>
                  <dt className="text-slate-500">Description:</dt>
                  <dd className="text-slate-900 mt-0.5 break-words">{rfq.message || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Currency:</dt>
                  <dd className="text-slate-900 mt-0.5">{rfq.currency || 'LKR'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Reference#:</dt>
                  <dd className="text-slate-900 mt-0.5">{rfq.reference || '-'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Created By:</dt>
                  <dd className="mt-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1 pr-2.5 py-0.5 text-[13px] text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex items-center justify-center border border-emerald-100">{authorName.charAt(0).toUpperCase()}</span>
                      {authorName}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Approval Flow:</dt>
                  <dd className="text-slate-900 mt-0.5">-</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Time Zone:</dt>
                  <dd className="text-slate-900 mt-0.5">{Intl.DateTimeFormat().resolvedOptions().timeZone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Terms and Conditions</dt>
                  <dd className="text-slate-900 mt-0.5 break-words">{rfq.terms || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Documents</dt>
                  <dd className="text-slate-900 mt-0.5">{documents.length ? documents.join(', ') : '-'}</dd>
                </div>
              </dl>
            </aside>
          </div>
        )}

        {tab === 'items' && (
          <div className="mt-4 rounded-xl bg-white border border-slate-200 overflow-hidden">
            <h3 className="text-[15px] font-semibold text-slate-900 px-5 pt-4">Requested Items ({(rfq.lines || []).length})</h3>
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 mt-2 bg-[#f8fafc] border-y border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="col-span-1">#</span>
              <span className="col-span-5">Name</span>
              <span className="col-span-2 text-right">Quantity</span>
              <span className="col-span-2">Expected Date</span>
              <span className="col-span-2 text-right">Expected Unit Price</span>
            </div>
            {(rfq.lines || []).length === 0 ? (
              <div className="py-16 text-center text-[14px] text-slate-500">No data to display</div>
            ) : (
              (rfq.lines || []).map((l: any, i: number) => (
                <div key={l.id || i} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-100 text-[13px] last:border-0">
                  <span className="col-span-1 text-slate-500">{i + 1}</span>
                  <span className="col-span-5 text-slate-900 font-medium truncate">{l.itemName}</span>
                  <span className="col-span-2 text-right text-slate-600 tabular-nums">{l.quantity}</span>
                  <span className="col-span-2 text-slate-600 tabular-nums">{fmtDate(l.needBy)}</span>
                  <span className="col-span-2 text-right text-slate-600 tabular-nums">—</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'vendors' && (
          <div className="mt-4">
            {(rfq.vendors || []).length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[14px] text-slate-500">Add the vendors who will participate in this request for quote.</p>
                {!isDraft && (
                  <p className="text-xs text-slate-400 mt-2">Vendor invites are sent when the RFQ is published.</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-[#f8fafc] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="col-span-5">Vendor</span>
                  <span className="col-span-4">Contact Email</span>
                  <span className="col-span-3">Quote Status</span>
                </div>
                {(rfq.vendors || []).map((v: any) => (
                  <div key={v.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-slate-100 text-[13px] last:border-0">
                    <span className="col-span-5 font-medium text-slate-900 truncate">{v.vendorName}</span>
                    <span className="col-span-4 text-slate-600 truncate">{v.contactEmail || '—'}</span>
                    <span className="col-span-3"><DocStatusPill status={v.quoteStatus || 'invited'} /></span>
                  </div>
                ))}
              </div>
            )}
            {['submitted', 'awarded_partial'].includes(rfq.status) && (
              <div className="mt-3">
                <button onClick={showCompare} disabled={acting} className="px-4 h-9 rounded-md bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 disabled:opacity-60">Compare Bids</button>
              </div>
            )}
            {compare?.rfqId === rfq.id && (
              <div className="mt-3 rounded-xl bg-white border border-slate-200 p-5 space-y-4">
                {compare.matrix.map((m: any) => (
                  <div key={m.rfqLineId} className="text-sm">
                    <div className="font-semibold text-slate-900">{m.itemName} × {m.quantity} <span className="text-slate-400 font-normal">(open {m.openQty})</span></div>
                    {m.quotes.length === 0 ? <div className="text-xs text-slate-400 mt-1">No bids yet.</div> : (
                      <div className="mt-1 divide-y divide-slate-100">
                        {m.quotes.map((q: any) => (
                          <div key={q.bidLineId} className="py-1.5 flex items-center gap-3 text-xs">
                            <input type="radio" name={`bid-${m.rfqLineId}`} checked={awardBid === q.bidId} onChange={() => setAwardBid(q.bidId)} title="Award this bid" />
                            <span className="flex-1 text-slate-700">{q.vendorName} — LKR {Number(q.unitPrice).toFixed(2)} {q.leadDays != null ? `· ${q.leadDays}d lead` : ''}</span>
                            {q.isBest && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">BEST</span>}
                            <input value={awardQty[q.bidLineId] || ''} onChange={(e) => setAwardQty((a) => ({ ...a, [q.bidLineId]: e.target.value }))} type="number" min={0} max={m.openQty} placeholder="Award qty" className="h-7 w-24 px-2 rounded border border-slate-300 text-xs" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={award} disabled={acting} className="px-4 h-9 rounded-md bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-60">Award Selected</button>
              </div>
            )}
            {(rfq.awards || []).length > 0 && (
              <div className="mt-3 rounded-xl bg-white border border-slate-200 p-5 text-xs space-y-2">
                {(rfq.awards || []).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <DocStatusPill status={a.status} />
                    <span className="text-slate-600">{(a.lines || []).length} line(s){a.reason ? ` · ${a.reason}` : ''}</span>
                    {a.status === 'active' && <button onClick={() => convertToPo(a.id)} disabled={acting} className="font-semibold text-blue-700 hover:underline disabled:opacity-60">Convert to PO</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'team' && (
          <div className="mt-4 rounded-xl bg-white border border-slate-200 overflow-hidden">
            <h3 className="text-[15px] font-semibold text-slate-900 px-5 pt-4">Team Member ({String(team.length + 1).padStart(2, '0')})</h3>
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 mt-2 bg-[#f8fafc] border-y border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="col-span-1">#</span>
              <span className="col-span-3">Name</span>
              <span className="col-span-2">Phone</span>
              <span className="col-span-2">Designation</span>
              <span className="col-span-2">Role</span>
              <span className="col-span-2">Shown in Portal</span>
            </div>
            <div className="grid grid-cols-12 gap-2 px-5 py-3 text-[13px] items-center">
              <span className="col-span-1 text-slate-500">1</span>
              <span className="col-span-3 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold flex items-center justify-center border border-emerald-100 shrink-0">{authorName.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 truncate">{authorName}</span>
                    <span className="block text-xs text-slate-500 truncate">{me?.email || ''}</span>
                  </span>
                </span>
              </span>
              <span className="col-span-2 text-slate-600">-</span>
              <span className="col-span-2 text-slate-600">-</span>
              <span className="col-span-2 text-slate-700">Request for Quote Organizer</span>
              <span className="col-span-2 text-slate-600">Yes</span>
            </div>
            {team.map((m: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-5 py-3 border-t border-slate-100 text-[13px] items-center">
                <span className="col-span-1 text-slate-500">{i + 2}</span>
                <span className="col-span-3 min-w-0">
                  <span className="block font-medium text-slate-900 truncate">{m.name || '—'}</span>
                  <span className="block text-xs text-slate-500 truncate">{m.email || ''}</span>
                </span>
                <span className="col-span-2 text-slate-600">{m.phone || '-'}</span>
                <span className="col-span-2 text-slate-600">{m.designation || '-'}</span>
                <span className="col-span-2 text-slate-700">{m.role || '—'}</span>
                <span className="col-span-2 text-slate-600">{m.contact ? 'Yes' : 'No'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {commentsOpen && (
        <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setCommentsOpen(false)}>
          <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Comments</h3>
              <button onClick={() => setCommentsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              {comments.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-10">No comments yet. Start the discussion.</div>
              ) : (
                comments.map((c, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">{c.name.charAt(0).toUpperCase()}</span>
                    <span>
                      <span className="block text-[13px]"><span className="font-semibold text-slate-900">{c.name}</span> <span className="text-xs text-slate-400 ml-1">{timeAgo(c.at)}</span></span>
                      <span className="block text-[13px] text-slate-700 mt-0.5">{c.text}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <input
                value={commentText} onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') postComment(); }}
                placeholder="Write a comment…"
                className="flex-1 h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2084FA]/20 focus:border-[#2084FA]"
              />
              <button onClick={postComment} disabled={!commentText.trim()} className="px-4 h-10 rounded-lg bg-[#2084FA] text-white text-sm font-semibold hover:bg-[#1a6fd6] disabled:opacity-50">Post</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
