import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

declare global {
  interface Window {
    catalyst?: {
      auth?: {
        signIn?: (containerId: string, opts?: Record<string, string>) => Promise<unknown> | void;
        signOut?: (redirect?: string) => void;
        isUserAuthenticated?: () => Promise<{ content?: Record<string, string> }>;
      };
    };
  }
}

type Phase = "checking" | "signin" | "workspace";

interface Workspace {
  orgName: string;
  orgStatus: string;
  userName: string;
  userEmail: string;
  userRole: string;
  counts: { properties: number; items: number; suppliers: number };
  backendVersion: string;
  setupRequired?: boolean;
  notice?: string;
}

function waitForSDK(timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const t = setInterval(() => {
      if (window.catalyst?.auth) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(t);
        reject(new Error("SDK failed to load"));
      }
    }, 80);
  });
}

const APP_BASE = typeof window !== "undefined"
  ? ((typeof window !== "undefined" && /:(5173|5175)$/.test(window.location.port)) ? "http://localhost:5174" : "") || window.location.origin
  : "";

export function AuthPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    async function init() {
      try {
        await waitForSDK(7000);
        if (!mountedRef.current) return;
        setPhase("signin");
      } catch {
        if (mountedRef.current) setError("SDK failed to load — Zoho Catalyst auth is not available in this environment.");
      }
    }
    init();
    return () => { mountedRef.current = false; };
  }, []);

  async function signIn() {
    if (!window.catalyst?.auth || !containerRef.current) return;
    setPhase("checking");
    setError("");
    try {
      const auth = window.catalyst.auth;
      if (!auth?.signIn) { setPhase("signin"); return; }
      await auth.signIn(containerRef.current.id);
      const auth2 = window.catalyst.auth;
      if (!auth2?.isUserAuthenticated) { setPhase("signin"); return; }
      const { content } = await auth2.isUserAuthenticated();
      if (!content) { setPhase("signin"); return; }
      setWs({
        orgName: content.OrgName || "Workspace",
        orgStatus: content.OrgStatus || "Active",
        userName: content.FullName || "You",
        userEmail: content.Email || "",
        userRole: content.Role || "Admin",
        counts: {
          properties: Number(content.PropertyCount || 0),
          items: Number(content.ItemCount || 0),
          suppliers: Number(content.SupplierCount || 0),
        },
        backendVersion: content.BackendVersion || "4.1.2",
        setupRequired: content.SetupRequired === "true",
        notice: content.Notice,
      });
      setPhase("workspace");
    } catch (err: any) {
      if (mountedRef.current) {
        setPhase("signin");
        setError(err?.message || "Auth error");
      }
    }
  }

  async function signOut() {
    window.catalyst?.auth?.signOut?.("/");
    setPhase("checking");
    setWs(null);
  }

  const isAppRoute = /\/app(?:\/|$)/.test(window.location.pathname);
  const overlay = phase === "signin" && !isAppRoute;
  const backdrop = phase === "workspace" || (phase === "signin" && isAppRoute);

  return (
    <>
      {overlay && (
        <div id="overlay" className="fixed inset-0 z-50 bg-[#0c0f14] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-[#1f2937]/60 bg-[#0f172a] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.6)]"
          >
            <div id="auth-card" className="p-7">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#1e6b52] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 13h2v5H3v-5zm10 0h2v5h-2v-5zm-10 3h14v2H3v-2z" fill="white"/></svg>
                  </div>
                  <span className="font-extrabold text-[15px] tracking-tight text-white">ProcureFlow</span>
                </div>
                <div className="text-[10px] font-bold tracking-[0.16em] text-[#7ad3b0]">SIGN IN</div>
              </div>
              <div className="rounded-xl bg-[#161e2b] p-4 mb-4">
                <div className="text-[11px] font-bold tracking-[0.16em] text-[#7ad3b0] mb-2">GOOD TO SEE YOU</div>
                <h3 className="text-[24px] font-extrabold text-white tracking-tight">Sign in to your account</h3>
                <p className="text-[#94a3b8] text-sm mt-1.5 mb-3">Don&apos;t have an account? &nbsp;<a href="/signup" className="text-[#7ad3b0] font-semibold hover:underline">Sign up</a></p>
                <motion.button
                  whileHover={{ y: -1, boxShadow: "0 10px 24px -8px rgba(30,107,82,0.35)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={signIn}
                  className="w-full h-11 rounded-full bg-[#1e6b52] text-white font-semibold inline-flex items-center justify-center"
                >
                  <span className="gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5 5-5-5M10 7l-5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Sign in with ProcureFlow
                  </span>
                </motion.button>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-white/30 uppercase">
                <span className="h-px w-6 bg-white/10" />
                or
                <span className="h-px w-6 bg-white/10" />
              </div>
              <a
                href={`${APP_BASE}/app/`}
                className="mt-3 h-11 w-full rounded-full border border-[#1e6b52]/30 text-[#7ad3b0] font-semibold inline-flex items-center justify-center hover:bg-[#1e3a2c]/40 transition-colors"
              >
                Continue without Zoho login
              </a>
              {error && (
                <p className="text-[11px] text-rose-400 mt-2 text-center">{error}</p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {backdrop && (
        <div
          id="backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12, 16, 20, 0.67)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
          }}
        >
          <div id="auth-card" className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-[#1f2937]/60 bg-[#0f172a] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.6)] p-7">
            {phase === "workspace" && ws && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between mb-5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#1e6b52] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 13h2v5H3v-5zm10 0h2v5h-2v-5zm-10 3h14v2H3v-2z" fill="white"/></svg>
                  </div>
                  <span className="font-extrabold text-[15px] tracking-tight text-white">ProcureFlow</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.16em] text-[#7ad3b0]">{ws.orgStatus}</span>
                  <button onClick={signOut} className="text-[#94a3b8] hover:text-white transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </motion.div>
            )}
            {phase === "workspace" && ws && (
              <div id="workspace-panel" className="rounded-xl bg-[#161e2b] p-4 mb-4">
                <div className="text-[11px] font-bold tracking-[0.16em] text-[#7ad3b0] mb-2">YOU&apos;RE SIGNED IN</div>
                <h3 className="text-[24px] font-extrabold text-white tracking-tight mb-4">{ws.orgName}</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Properties", value: ws.counts.properties },
                    { label: "Items", value: ws.counts.items },
                    { label: "Suppliers", value: ws.counts.suppliers },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl bg-[#0f172a] p-3">
                      <div className="text-xl font-extrabold text-white">{c.value}</div>
                      <div className="text-[11px] text-[#94a3b8]">{c.label}</div>
                    </div>
                  ))}
                </div>
                {ws.notice && (
                  <p className="text-[11px] text-rose-400 mt-3 text-center">{ws.notice}</p>
                )}
              </div>
            )}
            <a
              href={`${APP_BASE}/app/`}
              className="h-11 w-full rounded-full bg-[#1e6b52] text-white font-semibold inline-flex items-center justify-center hover:brightness-110 transition-colors"
            >
              Enter workspace
            </a>
          </div>
        </div>
      )}
    </>
  );
}
