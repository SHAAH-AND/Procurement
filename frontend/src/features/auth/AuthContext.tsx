import { createContext, useContext, useState, useEffect } from 'react';

export const DEMO_USER = {
  id: 'demo',
  email: 'demo@procureflow.io',
  name: 'Demo User',
  orgName: 'Demo Hotel Group',
  demo: true,
};

export type AccessUser = {
  id: string;
  email: string;
  name: string;
  orgName: string;
  demo?: boolean;
  /** System roles from /auth/me (e.g. Admin, Approver). Empty = bootstrap full access. */
  roles?: string[];
  /** Backend permission strings (module:action) + legacy aliases. */
  permissions?: string[];
  department?: string | null;
  status?: string;
};

interface UserCtx {
  user: AccessUser | null;
  setUser: (tokenVal: string, userData: any) => void;
  loading: boolean;
  logout: () => void;
  loginDemo: () => void;
}

const AuthContext = createContext<UserCtx>({ 
  user: null, 
  setUser: null as any, 
  loading: true, 
  logout: () => {},
  loginDemo: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('pf_demo') === '1') {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }
    const token = localStorage.getItem('pf_token');
    if (token) {
      import('../../api').then(({ getMe, setToken }) => {
        setToken(token);
        getMe().then(u => { setUser(u); setLoading(false); }).catch(() => { localStorage.removeItem('pf_token'); setLoading(false); });
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (tokenVal: string, userData: any) => {
    localStorage.setItem('pf_token', tokenVal);
    import('../../api').then(({ setToken }) => setToken(tokenVal));
    setUser(userData);
  };

  const loginDemo = () => {
    localStorage.setItem('pf_demo', '1');
    localStorage.removeItem('pf_token');
    setUser(DEMO_USER);
  };

  const logout = () => {
    localStorage.removeItem('pf_token');
    localStorage.removeItem('pf_demo');
    import('../../api').then(({ setToken }) => setToken(null)).catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser: login, loading, logout, loginDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
