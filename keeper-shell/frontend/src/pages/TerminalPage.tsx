import { useCallback, useEffect, useState } from 'react';
import { Body1, Button, Spinner, Title2 } from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import type { RequestDTO } from '@keeper-shell/shared';
import { StatusDot, statusLabel } from '../components/StatusDot';
import { TeamsUserPill } from '../components/TeamsUserPill';
import { useCountdown, formatCountdown } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';

/**
 * Admin operations view — every active passkey in flight, one row per lease,
 * live countdowns. Approvers and admins use this as the "fleet at a glance".
 */
export function TerminalPage(): JSX.Element {
  const [active, setActive] = useState<RequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        // Two queries in parallel: APPROVED + RENEWAL_PENDING. listRequests for
        // an admin returns all users' requests.
        const [approved, renewing] = await Promise.all([
          api.listRequests({ status: 'APPROVED' }),
          api.listRequests({ status: 'RENEWAL_PENDING' }),
        ]);
        const now = Date.now();
        const all = [...approved.requests, ...renewing.requests]
          .filter((r) => r.leaseExpiresAt && new Date(r.leaseExpiresAt).getTime() > now)
          .sort((a, b) => {
            const ax = a.leaseExpiresAt ? new Date(a.leaseExpiresAt).getTime() : 0;
            const bx = b.leaseExpiresAt ? new Date(b.leaseExpiresAt).getTime() : 0;
            return ax - bx;
          });
        if (!cancelled) setActive(all);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Auto-poll every 10s so the terminal stays current.
  useEffect(() => {
    const id = setInterval(reload, 10_000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 py-6 max-w-6xl">
        <header className="flex items-end justify-between mb-5">
          <div className="flex flex-col gap-1.5">
            <Title2 as="h1">Terminal</Title2>
            <Body1 className="text-[var(--text-muted)]">
              {active.length} active passkey{active.length === 1 ? '' : 's'} in flight
            </Body1>
          </div>
          <Button appearance="subtle" icon={<ArrowClockwise24Regular />} onClick={reload}>Refresh</Button>
        </header>

        {error && <div className="mb-4 p-3 bg-red-50 text-sm text-red-800 rounded">{error}</div>}

        {loading && active.length === 0 ? (
          <div className="flex items-center gap-3 py-12 justify-center text-[var(--text-muted)]">
            <Spinner size="small" /> Loading...
          </div>
        ) : active.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-muted)] text-sm">
            No passkeys are currently checked out.
          </div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-2">
            {active.map((r) => <TerminalRow key={r.id} request={r} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function TerminalRow({ request }: { request: RequestDTO }): JSX.Element {
  const seconds = useCountdown(request.leaseExpiresAt ?? null);
  const totalMin = request.approvedDurationMin ?? request.requestedDurationMin;
  return (
    <li className="bg-[var(--surface-elevated)] rounded-lg px-4 py-3 flex items-center gap-4">
      {/* User Teams avatar */}
      <TeamsUserPill user={request.requester} size={32} showName={false} />

      {/* Name + status */}
      <div className="min-w-0 w-44">
        <div className="text-sm font-semibold truncate">{request.requester?.displayName ?? 'Unknown'}</div>
        <div className="text-xs flex items-center gap-1.5 mt-0.5 text-[var(--text-muted)]">
          <StatusDot status={request.status} size={10} />
          {statusLabel(request.status)}
        </div>
      </div>

      {/* Associated record */}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Record</div>
        <div className="text-sm font-medium truncate">{request.record?.name ?? '—'}</div>
        <div className="text-[11px] ks-mono text-[var(--text-muted)] truncate">{request.record?.systemName}</div>
      </div>

      {/* Duration */}
      <div className="w-28 shrink-0">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Duration</div>
        <div className="text-sm font-medium">{totalMin} min</div>
        <div className="text-[11px] ks-mono text-[var(--text-muted)]">
          {seconds !== null ? formatCountdown(seconds) : '—'} left
        </div>
      </div>

      {/* Reason */}
      <div className="w-72 shrink-0 hidden lg:block">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Reason</div>
        <div className="text-sm truncate" title={request.reason}>{request.reason}</div>
      </div>
    </li>
  );
}
