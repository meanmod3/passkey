import { useCallback, useEffect, useMemo, useState } from 'react';
import { Body1, Button, Spinner } from '@fluentui/react-components';
import { Dismiss24Regular, ArrowClockwise20Regular } from '@fluentui/react-icons';
import type { RequestDTO } from '@keeper-shell/shared';
import { StatusDot, statusLabel } from './StatusDot';
import { MessageInTeamsButton } from './MessageInTeamsButton';
import { useCountdown, formatCountdown } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { useRightPanel } from '../stores/rightPanel.store';

export function MyRequestsPanel(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const close = useRightPanel((s) => s.close);
  const showRequest = useRightPanel((s) => s.showRequest);
  const [requests, setRequests] = useState<RequestDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const groups = useMemo(() => {
    const active = requests.filter((r) => r.status === 'APPROVED' || r.status === 'RENEWAL_PENDING');
    const pending = requests.filter((r) => r.status === 'PENDING');
    const history = requests.filter((r) => ['DENIED', 'RELEASED', 'EXPIRED'].includes(r.status));
    return { active, pending, history };
  }, [requests]);

  return (
    <aside className="w-[420px] shrink-0 bg-[var(--surface-elevated)] flex flex-col overflow-hidden">
      <PanelHeader title="My Requests" subtitle={`${requests.length} total`} onClose={close}>
        <Button appearance="subtle" size="small" icon={<ArrowClockwise20Regular />} onClick={reload} />
      </PanelHeader>

      <div className="flex-1 overflow-auto px-3 py-2">
        {error && <div className="m-2 p-3 bg-red-50 text-sm text-red-800 rounded">{error}</div>}
        {loading && requests.length === 0 ? (
          <div className="flex items-center gap-2 justify-center text-[var(--text-muted)] py-12">
            <Spinner size="small" /> Loading...
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-muted)] text-sm">No requests yet.</div>
        ) : (
          <div className="space-y-4">
            {groups.active.length > 0 && (
              <Section title="Active">
                {groups.active.map((r) => (
                  <RequestTile key={r.id} request={r} onOpen={() => showRequest(r.id)} />
                ))}
              </Section>
            )}
            {groups.pending.length > 0 && (
              <Section title="Pending approval">
                {groups.pending.map((r) => (
                  <RequestTile key={r.id} request={r} onOpen={() => showRequest(r.id)} />
                ))}
              </Section>
            )}
            {groups.history.length > 0 && (
              <Section title="History">
                {groups.history.map((r) => (
                  <RequestTile key={r.id} request={r} onOpen={() => showRequest(r.id)} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)] font-bold px-2 mb-2">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function RequestTile({ request, onOpen }: { request: RequestDTO; onOpen: () => void }): JSX.Element {
  const seconds = useCountdown(request.leaseExpiresAt ?? null);
  const isActive = request.status === 'APPROVED' || request.status === 'RENEWAL_PENDING';
  const partner = request.approver ?? null;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="rounded-md p-3 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <StatusDot status={request.status} size={14} />
        <span className="text-[14px] font-semibold truncate flex-1">{request.record?.name ?? 'Record'}</span>
        {isActive && seconds !== null && (
          <span className="text-xs ks-mono text-[var(--text-muted)]">{formatCountdown(seconds)}</span>
        )}
      </div>
      <div className="text-[12px] text-[var(--text-muted)] mb-2 truncate">
        {request.reason} · {request.requestedDurationMin} min
      </div>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[11px] text-[var(--text-subtle)]">{statusLabel(request.status)}</span>
        <div className="flex-1" />
        <MessageInTeamsButton
          user={partner}
          draftMessage={`About my access request for ${request.record?.name ?? 'a record'}: `}
          label="Message"
        />
      </div>
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="px-5 pt-4 pb-3 flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <h2 className="text-[18px] font-extrabold leading-tight truncate">{title}</h2>
        {subtitle && <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{subtitle}</div>}
      </div>
      {children}
      <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
    </div>
  );
}
