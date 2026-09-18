import { useAccess, canDo, canApprove } from './resolver';
import type { AccessAction } from './catalog';

// ── Declarative gating: hides UI the caller may not use ─────────────────────

export function Can({
  mod,
  action,
  ownerId,
  fallback = null,
  children,
}: {
  mod: string;
  action: AccessAction;
  ownerId?: string | null;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const access = useAccess();
  if (access.loading) return null;
  const ok = action === 'approve' ? canApprove(access, mod, ownerId) : canDo(access, mod, action);
  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}
