import { useCallback, useEffect, useMemo, useState } from 'react';
import { Body1, Button, Spinner, Title2 } from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import type { RequestDTO } from '@keeper-shell/shared';
import { StatusBadge } from '../components/StatusBadge';
import { RenewalPromptDialog } from '../components/RenewalPromptDialog';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';
import { useAuthStore } from '../stores/auth.store';

export function MyRequestsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<RequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [renewalFor, setRenewalFor] = useState<RequestDTO | null>(null);
  const [autoOpenedRenewal, setAutoOpenedRenewal] = useState<string | null>(null);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.listRequests({ requesterId: user.id });
        if (!cancelled) setRequests(data.requests);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, refreshKey]);

  // Poll every 20s for status updates (renewal window, expiry).
  useEffect(() => {
    const id = setInterval(reload, 20_000);
    return () => clearInterval(id);
  }, [reload]);

  // Auto-open the renewal dialog when any active lease enters RENEWAL_PENDING.
  useEffect(() => {
    const pending = requests.find((r) => r.status === 'RENEWAL_PENDING');
    if (pending && autoOpenedRenewal !== pending.id) {
      setRenewalFor(pending);
      setAutoOpenedRenewal(pending.id);
    }
  }, [requests, autoOpenedRenewal]);

  const groups = useMemo(() => {
    const active = requests.filter((r) => r.status === 'APPROVED' || r.status === 'RENEWAL_PENDING');
    const pending = requests.filter((r) => r.status === 'PENDING');
    const history = requests.filter((r) => ['DENIED', 'RELEASED', 'EXPIRED'].includes(r.status));
    return { active, pending, history };
  }, [requests]);

  if (!user) return <div className="p-6">Not signed in.</div>;

  return (
    <div className="p-6 max-w-6xl">
      <header className="flex items-end justify-between mb-4">
        <div className="flex flex-col gap-1.5">
          <Title2 as="h1">My Requests</Title2>
          <Body1 className="text-[var(--text-muted)]">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'}
          </Body1>
        </div>
        <Button appearance="subtle" icon={<ArrowClockwise24Regular />} onClick={reload}>
          Refresh
        </Button>
      </header>

      {error && <div className="mb-4 p-3 border border-red-200 bg-red-50 text-sm text-red-800 rounded">{error}</div>}

      {loading && requests.length === 0 ? (
        <div className="flex items-center gap-3 py-12 justify-center text-neutral-600">
          <Spinner size="small" /><Body1>Loading...</Body1>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.active.length > 0 && (
            <Section title={`Active (${groups.active.length})`}>
              {groups.active.map((r) => (
                <ActiveLeaseRow
                  key={r.id}
                  request={r}
                  onRelease={reload}
                  onOpenRenewal={() => setRenewalFor(r)}
                />
              ))}
            </Section>
          )}
          {groups.pending.length > 0 && (
            <Section title={`Pending approval (${groups.pending.length})`}>
              {groups.pending.map((r) => <PendingRow key={r.id} request={r} />)}
            </Section>
          )}
          {groups.history.length > 0 && (
            <Section title={`History (${groups.history.length})`}>
              {groups.history.map((r) => <HistoryRow key={r.id} request={r} />)}
            </Section>
          )}
          {requests.length === 0 && (
            <div className="py-12 text-center text-neutral-600">
              <Body1>No requests yet.</Body1>
            </div>
          )}
        </div>
      )}

      <RenewalPromptDialog
        request={renewalFor}
        open={renewalFor !== null}
        onClose={() => setRenewalFor(null)}
        onAction={reload}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">{children}</div>
    </div>
  );
}

function ActiveLeaseRow({
  request,
  onRelease,
  onOpenRenewal,
}: {
  request: RequestDTO;
  onRelease: () => void;
  onOpenRenewal: () => void;
}): JSX.Element {
  const seconds = useCountdown(request.leaseExpiresAt ?? null);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doRelease(): Promise<void> {
    setReleasing(true);
    setError(null);
    try {
      await api.releaseRequest(request.id);
      onRelease();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'release failed');
    } finally {
      setReleasing(false);
    }
  }

  const inRenewalWindow = request.status === 'RENEWAL_PENDING';
  const countdownClass = inRenewalWindow || (seconds !== null && seconds < 60)
    ? 'font-mono font-semibold text-red-700'
    : 'font-mono font-semibold text-neutral-800';

  return (
    <div className="px-4 py-3 border-b border-neutral-100 last:border-b-0">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{request.record?.name}</span>
            <StatusBadge status={request.status} />
          </div>
          <div className="text-xs text-neutral-500 truncate">{request.record?.systemName} · {request.reason}</div>
        </div>
        <div className="text-right">
          <div className={countdownClass}>
            {seconds !== null ? formatCountdown(seconds) : '—'}
          </div>
          <div className="text-xs text-neutral-500">
            {request.approvedDurationMin} min lease
          </div>
        </div>
        <div className="flex items-center gap-2">
          {inRenewalWindow && (
            <Button size="small" appearance="primary" onClick={onOpenRenewal}>
              Extend / Release
            </Button>
          )}
          {!inRenewalWindow && (
            <Button size="small" appearance="secondary" onClick={doRelease} disabled={releasing}>
              {releasing ? <Spinner size="tiny" /> : 'Release'}
            </Button>
          )}
        </div>
      </div>
      {request.shareLink && (
        <div className="mt-2 text-xs font-mono text-neutral-600 truncate">
          Share link: {request.shareLink}
        </div>
      )}
      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}

function PendingRow({ request }: { request: RequestDTO }): JSX.Element {
  return (
    <div className="px-4 py-3 border-b border-neutral-100 last:border-b-0 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{request.record?.name}</span>
          <StatusBadge status={request.status} />
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {request.record?.systemName} · {request.reason} · {request.requestedDurationMin} min requested
        </div>
      </div>
      <div className="text-xs text-neutral-500">
        {new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

function HistoryRow({ request }: { request: RequestDTO }): JSX.Element {
  return (
    <div className="px-4 py-3 border-b border-neutral-100 last:border-b-0 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm truncate">{request.record?.name}</span>
          <StatusBadge status={request.status} />
        </div>
        <div className="text-xs text-neutral-500 truncate">
          {request.reason} · {request.approvedDurationMin ?? request.requestedDurationMin} min
        </div>
      </div>
      <div className="text-xs text-neutral-500">
        {new Date(request.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
