import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { healthCheck, getMe, setToken, ApiError, type MeResponse } from '../../api';

// ── Session model ────────────────────────────────────────────────────────────
// Identity comes from Catalyst hosted auth (Zoho Accounts). Boot answers, in
// order: is the API reachable → did the SDK load → is there a session → what
// does the workspace say about this account. Each answer is a distinct state
// so the UI can say exactly what is wrong instead of showing a spinner.

export type AuthState =
  | 'booting'
  | 'backend-down'     // /health failed: connectivity, not the account
  | 'sdk-failed'       // Catalyst web SDK did not load
  | 'signed-out'       // no Catalyst session
  | 'setup-required'   // signed in, but this installation has no workspace yet
  | 'not-member'       // signed in, workspace exists, account was never invited
  | 'inactive'         // signed in, membership deactivated
  | 'error'            // unexpected server error during boot
  | 'ready';

export type AccessUser = {
  id: string;
  email: string;
  name: string;
  orgName: string;
  /** Profile name(s) from the workspace. Empty = bootstrap full access. */
  roles?: string[];
  /** `<module>:<action>` grants resolved from the profile. */
  permissions?: string[];
  department?: string | null;
  status?: string;
  currency?: string;
  approvalLimit?: number;
  version?: string;
  demo?: boolean;
};

interface UserCtx {
  user: AccessUser | null;
  state: AuthState;
  loading: boolean;
  /** Human-readable detail for the failure states. */
  error: string;
  /** Catalyst identity (email/name) even before a workspace membership exists. */
  identity: { email: string; name: string } | null;
  /** One-time notice from the server (e.g. auto-provisioned as view-only). */
  notice: string | null;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Compatibility: kept for components that set a user after an action. */
  setUser: (tokenVal: string, userData: any) => void;
}

const AuthContext = createContext<UserCtx>({
  user: null, state: 'booting', loading: true, error: '', identity: null, notice: null,
  logout: () => {}, refresh: async () => {}, setUser: () => {},
});

export const APP_HOME = `${window.location.origin}/app/`;

function waitForCatalystSDK(timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const t = setInterval(() => {
      if (window.catalyst && window.catalyst.auth) { clearInterval(t); resolve(); }
      else if (Date.now() - started > timeoutMs) { clearInterval(t); reject(new Error('Catalyst SDK failed to load')); }
    }, 80);
  });
}

function toUser(me: MeResponse): AccessUser {
  return {
    id: me.id || '',
    email: me.email,
    name: me.name || me.email.split('@')[0],
    orgName: me.orgName || '',
    roles: me.roles || [],
    permissions: me.permissions || [],
    department: me.department ?? null,
    status: me.status,
    currency: me.orgSettings?.currency || 'LKR',
    version: me.version,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AccessUser | null>(null);
  const [state, setState] = useState<AuthState>('booting');
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState<{ email: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const boot = useCallback(async () => {
    setState('booting');
    setError('');
    // 1. Backend reachable? Answered first so an outage is never reported as
    //    a sign-in problem.
    const health = await healthCheck();
    if (!health.ok) {
      setError(`${health.reason} This is a connection problem, not your account.`);
      setState('backend-down');
      return;
    }
    // 2. SDK loaded?
    try { await waitForCatalystSDK(); } catch {
      setError('The Catalyst authentication SDK failed to load. This is usually a temporary network issue.');
      setState('sdk-failed');
      return;
    }
    // 3. Session?
    let auth: any;
    try {
      auth = await window.catalyst!.auth!.isUserAuthenticated!();
    } catch {
      setUserState(null);
      setState('signed-out');
      return;
    }
    const c = auth?.content || {};
    const ident = { email: String(c.email_id || '').toLowerCase(), name: `${c.first_name || ''} ${c.last_name || ''}`.trim() };
    setIdentity(ident);
    // 4. Membership.
    try {
      const me = await getMe();
      if (me.setupRequired) { setState('setup-required'); return; }
      setUserState(toUser(me));
      setNotice(me.notice || null);
      setState('ready');
    } catch (err: any) {
      const e = err as ApiError;
      if (e?.status === 401) { setUserState(null); setState('signed-out'); return; }
      if (e?.code === 'NOT_A_MEMBER') { setError(e.message); setState('not-member'); return; }
      if (e?.code === 'USER_INACTIVE') { setError(e.message); setState('inactive'); return; }
      if (e?.code === 'SETUP_REQUIRED') { setState('setup-required'); return; }
      setError(e?.message || 'Unexpected error while loading your workspace.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    boot();
    const onAuthRequired = () => { setToken(null); setUserState(null); setState('signed-out'); };
    window.addEventListener('procureflow:auth-required', onAuthRequired);
    return () => window.removeEventListener('procureflow:auth-required', onAuthRequired);
  }, [boot]);

  const logout = () => {
    setToken(null);
    setUserState(null);
    setState('signed-out');
    try {
      window.catalyst?.auth?.signOut?.(APP_HOME);
    } catch {
      window.location.href = APP_HOME;
    }
  };

  const setUser = (_token: string, userData: any) => {
    setUserState(userData);
    setState('ready');
  };

  return (
    <AuthContext.Provider value={{ user, state, loading: state === 'booting', error, identity, notice, logout, refresh: boot, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
