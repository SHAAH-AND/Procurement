import { useState, useEffect } from 'react';
import { getDashboard, getMyPrs, getPendingPrs } from '../../../../api';

interface UseWorkspaceBootProps {
  loading: boolean;
  wsUser: any;
}

export function useWorkspaceBoot({ loading, wsUser }: UseWorkspaceBootProps) {
  const [bootProgress, setBootProgress] = useState(6);
  const [bootReady, setBootReady] = useState(false);
  const [bootData, setBootData] = useState<any>(null);

  useEffect(() => {
    if (loading || !wsUser || bootReady) return;
    let cancelled = false;
    const t0 = Date.now();
    const set = (n: number) => {
      if (!cancelled) setBootProgress(n);
    };
    (async () => {
      try {
        set(30);
        const dash = await getDashboard('year').catch(() => null);
        if (cancelled) return;
        if (dash) setBootData(dash);
        set(58);
        await Promise.all([getMyPrs().catch(() => null), getPendingPrs().catch(() => null)]);
        if (cancelled) return;
        set(86);
        const wait = Math.max(0, 1500 - (Date.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
        if (cancelled) return;
        set(100);
        await new Promise((r) => setTimeout(r, 280));
        if (!cancelled) setBootReady(true);
      } catch {
        if (!cancelled) setBootReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, wsUser, bootReady]);

  return { bootProgress, bootReady, bootData };
}