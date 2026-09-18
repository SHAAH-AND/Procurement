import { useNavigate, useParams } from 'react-router-dom';
import { findItem } from './registry';
import { useAccess, canDo } from '../access/resolver';
import { SETTING_ITEM_ACL } from '../access/catalog';

// ── Setting detail — professional SaaS standard ─────────────────────────────
// Breadcrumb · header card with icon tile + context chips · content card.
// Same registry item render; presentation only.

export function SettingDetailPage() {
  const navigate = useNavigate();
  const { pageId } = useParams<{ pageId: string }>();
  const found = pageId ? findItem(pageId) : null;

  if (!found) {
    return (
      <div className="bg-[#F6F7F9] min-h-full -m-0 px-4 sm:px-8 py-10">
        <div className="max-w-3xl mx-auto rounded-2xl border border-dashed border-slate-300 bg-white py-14 px-6 text-center">
          <p className="text-[14px] font-semibold text-slate-800">Setting not found</p>
          <p className="mt-1 text-[12.5px] text-slate-500">It may have been moved or renamed.</p>
          <button onClick={() => navigate('/workspace/settings')} className="mt-4 h-9 px-4 rounded-xl bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] transition-colors">
            Back to All Settings
          </button>
        </div>
      </div>
    );
  }

  const { item, group, card } = found;

  // Route-level restriction (Zoho parity): admin-only pages stay unreachable
  // by direct URL for users without the grant.
  const access = useAccess();
  const need = pageId ? SETTING_ITEM_ACL[pageId] : undefined;
  const restricted =
    !access.loading && !access.full && need
      ? !canDo(access, need.split(':')[0], need.split(':')[1] as 'view')
      : false;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F6F7F9] -m-0">
      {/* Top bar */}
      <header className="shrink-0 bg-white border-b border-slate-200">
        <div className="px-4 sm:px-8 py-4 max-w-[1080px] mx-auto w-full">
          <button
            onClick={() => navigate('/workspace/settings')}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-[#1a6fd6] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
            All Settings
          </button>
          <div className="mt-2.5 flex items-start gap-3.5">
            <span className="w-11 h-11 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#2084FA] shrink-0">
              {card.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{group.title}</span>
                <span className="text-slate-300 text-[11px]" aria-hidden="true">/</span>
                <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{card.title}</span>
              </div>
              <h1 className="text-[20px] font-bold text-slate-900 tracking-tight leading-tight mt-1">{item.title}</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">{item.desc}</p>
            </div>
            <button
              onClick={() => navigate('/workspace/settings')}
              className="hidden sm:inline-flex h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[12.5px] font-semibold text-slate-600 transition-colors shrink-0"
            >
              Close
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1080px] mx-auto w-full px-4 sm:px-8 py-6 pb-12">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="px-5 sm:px-7 pt-5 pb-1 flex items-center gap-2">
              <span className="text-[12px] font-bold text-slate-800">Configuration</span>
              <span className="text-[11.5px] text-slate-400">· changes save to your organization</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Autosafe
              </span>
            </div>
            <div className="px-5 sm:px-7 py-5">
              {restricted ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 py-12 px-6 text-center">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth={1.8} /><path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth={1.8} /></svg>
                  </div>
                  <p className="mt-3 text-[14px] font-semibold text-slate-800">Restricted — requires {need}</p>
                  <p className="mt-1 text-[12.5px] text-slate-500 max-w-md mx-auto">Your role doesn’t include this area. Ask an Admin to grant it (Settings → Users & Roles → Roles), then sign in again.</p>
                  <button onClick={() => navigate('/workspace/settings')} className="mt-4 h-9 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    Back to All Settings
                  </button>
                </div>
              ) : (
                item.render()
              )}
            </div>
          </div>
          <p className="mt-4 text-[12px] text-slate-400 text-center">
            Looking for something else? <button onClick={() => navigate('/workspace/settings')} className="font-semibold text-[#2084FA] hover:underline">Browse all settings</button>
          </p>
        </div>
      </div>
    </div>
  );
}
