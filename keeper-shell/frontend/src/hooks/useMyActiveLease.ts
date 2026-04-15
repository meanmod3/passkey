import { useCallback, useEffect, useState } from 'react';
import type { RequestDTO } from '@keeper-shell/shared';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth.store';

/**
 * Polls /api/requests for the current user and surfaces their single active
 * passkey (if any). Refreshes on a tick so the sidebar widget stays accurate
 * without each consumer having to manage its own polling.
 */
export function useMyActiveLease(): {
  lease: RequestDTO | null;
  reload: () => void;
} {
  const userId = useAuthStore((s) => s.user?.id);
  const [lease, setLease] = useState<RequestDTO | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const { requests } = await api.listRequests({ requesterId: userId });
      const now = Date.now();
      const active = requests.find(
        (r) =>
          (r.status === 'APPROVED' || r.status === 'RENEWAL_PENDING') &&
          r.leaseExpiresAt !== null &&
          new Date(r.leaseExpiresAt!).getTime() > now,
      );
      setLease(active ?? null);
    } catch {
      // Sidebar shouldn't surface noise.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void reload();
    const id = setInterval(reload, 10_000);
    return () => clearInterval(id);
  }, [userId, reload]);

  return { lease, reload };
}
