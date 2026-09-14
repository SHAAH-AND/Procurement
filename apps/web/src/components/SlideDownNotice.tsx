import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Mail, ShieldCheck, X } from 'lucide-react';

const ADMIN_EMAIL = 'admin@procureflow.io';

/** Visible strip height in peek — the "1/4" the sheet rests at. */
const PEEK_VISIBLE_PX = 150;
/** Slow glide used for every snap (entry, open, dismiss). Sheet stays opaque. */
const GLIDE = 'transform 1.4s cubic-bezier(0.22, 0.8, 0.24, 1)';

type Phase = 'hidden' | 'peek' | 'open';

/**
 * Windows slidetoshutdown-style notice, pointer-tracked like SlideToAction:
 * - No motion library in the drag path: while dragging, transition is off
 *   and the sheet sticks to the cursor 1:1 via direct DOM writes.
 * - 5s after entering signup it GLIDES down slowly and rests at a peek.
 * - Small tug down → slow glide to full-page cover.
 * - Push up → back to peek / away. Drag far down from open → off the
 *   bottom (dismissed, signup revealed).
 */
export default function SlideDownNotice() {
  const shadeRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const isDragging = useRef(false);
  const [phase, setPhase] = useState<Phase>('hidden');
  /** Once the user pulls/dismisses, the pull-hint row stays hidden. */
  const [touched, setTouched] = useState(false);

  const phaseRef = useRef<Phase>('hidden');
  phaseRef.current = phase;

  useEffect(() => {
    const t = setTimeout(() => setPhase('peek'), 5000);
    return () => clearTimeout(t);
  }, []);

  // Resting offset per phase (px from fully-covering position).
  const restOffset = () => {
    const el = shadeRef.current;
    if (!el) return 0;
    if (phaseRef.current === 'open') return 0;
    return -(el.clientHeight - PEEK_VISIBLE_PX);
  };

  // Glide to the resting offset whenever phase changes (and not dragging).
  useEffect(() => {
    const el = shadeRef.current;
    if (!el || phase === 'hidden' || isDragging.current) return;
    el.style.transition = GLIDE;
    el.style.transform = `translateY(${restOffset()}px)`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'hidden') return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Let links/buttons work normally.
    if ((e.target as HTMLElement).closest('a,button')) return;
    isDragging.current = true;
    startY.current = e.clientY;
    startOffset.current = restOffset();
    const el = shadeRef.current;
    if (el) {
      el.style.transition = 'none';
      el.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const el = shadeRef.current;
    if (!el) return;
    // Downward only from peek; from open allow up (tuck) and down (dismiss).
    let delta = e.clientY - startY.current;
    if (phaseRef.current === 'peek') delta = Math.max(-1e5, delta);
    const y = startOffset.current + delta;
    // Never drag above fully-hidden. Fully opaque throughout — no see-through.
    const min = -el.clientHeight;
    el.style.transform = `translateY(${Math.max(min, y)}px)`;
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const el = shadeRef.current;
    if (!el) return;
    const h = el.clientHeight || 1;
    const delta = e.clientY - startY.current;
    el.style.transition = GLIDE;

    if (phaseRef.current === 'peek') {
      if (delta > Math.min(110, h * 0.18)) {
        // Small tug → slow glide to full-page cover.
        setTouched(true);
        setPhase('open');
      } else if (delta < -60) {
        setTouched(true);
        setPhase('hidden');
      } else {
        el.style.transform = `translateY(${restOffset()}px)`;
      }
    } else {
      // open: far down → off the bottom (dismissed); up → back to peek.
      if (delta > h * 0.4) {
        el.style.transform = 'translateY(105%)';
        setTouched(true);
        setTimeout(() => setPhase('hidden'), 900);
      } else if (delta < -60) {
        setTouched(true);
        setPhase('peek');
      } else {
        el.style.transform = 'translateY(0px)';
      }
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {/* darkens the signup page behind — deeper when fully covered */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#040a1e] transition-opacity duration-1000"
        style={{ opacity: phase === 'open' ? 0.55 : 0.22 }}
      />
      <div
        ref={shadeRef}
        className="absolute inset-x-0 top-0 flex h-full w-full cursor-grab flex-col items-center justify-center overflow-hidden text-center text-white active:cursor-grabbing"
        style={{
          transform: 'translateY(-100%)',
          willChange: 'transform',
          background:
            'linear-gradient(160deg, #2084FA 0%, #4a5cf5 38%, #7F3EDD 100%)',
          boxShadow: '0 24px 60px -12px rgba(7,23,90,0.45)',
        }}
      >
        {/* ProcureFlow watermark covering the whole sheet */}
        <img
          src="/img/procureflow-p-icon.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[min(115%,760px)] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-20 select-none"
          draggable={false}
        />
        {/* soft blurred shapes, lock-screen feel */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-white/15 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 bottom-1/4 h-96 w-96 rounded-full bg-black/15 blur-3xl"
        />

        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/15">
          <ShieldCheck className="h-7 w-7 text-white" />
        </span>
        <p className="relative mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          Invitation-only access
        </p>
        <h2 className="relative mt-3 max-w-md px-6 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          Secure, controlled access for authorized users only.
        </h2>
        <p className="relative mt-2 max-w-md px-6 text-sm leading-relaxed text-white/70">
          ProcureFlow is invitation-only. Accounts are created by your
          organization administrator.
        </p>

        <ol className="relative mt-6 grid w-full max-w-lg gap-2 px-6 text-left sm:grid-cols-3">
          {[
            'Request an invite from your administrator',
            'Admin creates your seat and assigns a role',
            'Sign in with your work email',
          ].map((text, i) => (
            <li
              key={i}
              className="rounded-xl border border-white/20 bg-white/[0.12] px-3 py-3"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold text-white">
                {i + 1}
              </span>
              <span className="mt-2 block text-xs font-medium leading-snug text-white/90">
                {text}
              </span>
            </li>
          ))}
        </ol>

        <a
          href={`mailto:${ADMIN_EMAIL}?subject=Request%20ProcureFlow%20Access`}
          className="relative mt-6 inline-flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-slate-900"
        >
          <Mail className="h-4 w-4" />
          Contact administrator
        </a>

        {/* peek strip pinned to the sheet's bottom edge (click-through except dismiss) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[150px] flex-col items-center justify-start gap-1 px-6 pt-3">
          <span className="h-1 w-12 rounded-full bg-white/40" />
          <span className="mt-1.5 flex items-center gap-2 text-[13px] font-semibold text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
            Invitation-only access
          </span>
          {!touched && (
            <span className="flex items-center gap-3 text-[11px] font-medium text-white/70">
              <span className="flex items-center gap-1">
                <ChevronDown className="h-3 w-3" /> pull down to open
              </span>
              <span className="h-3 w-px bg-white/25" />
              <span className="flex items-center gap-1">
                <ChevronUp className="h-3 w-3" /> push up to dismiss
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              setPhase('hidden');
            }}
            aria-label="Dismiss"
            className="pointer-events-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
