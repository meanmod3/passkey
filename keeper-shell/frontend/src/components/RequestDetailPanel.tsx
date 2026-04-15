import { useEffect, useState } from 'react';
import { Button, Spinner } from '@fluentui/react-components';
import type { RequestDTO } from '@keeper-shell/shared';
import { StatusDot, statusLabel } from './StatusDot';
import { TeamsUserPill } from './TeamsUserPill';
import { MessageInTeamsButton } from './MessageInTeamsButton';
import { useCountdown, formatCountdown } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { useRightPanel } from '../stores/rightPanel.store';
import { PanelHeader } from './MyRequestsPanel';
import { ShareLinkBlock } from './ShareLinkBlock';

export function RequestDetailPanel({ requestId }: { requestId: string }): JSX.Element {
  const close = useRightPanel((s) => s.close);
  const showMyRequests = useRightPanel((s) => s.showMyRequests);
  const meId = useAuthStore((s) => s.user?.id);
  const [request, setRequest] = useState<RequestDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seconds = useCountdown(request?.leaseExpiresAt ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { request: r } = await api.listRequests({ requesterId: meId })
          .then((d) => ({ request: d.requests.find((x) => x.id === requestId) ?? null }));
        if (!cancelled) setRequest(r);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [requestId, meId]);

  async function handleRelease(): Promise<void> {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const { request: updated } = await api.releaseRequest(request.id);
      setRequest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'release failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <aside className="w-full bg-[var(--surface-elevated)] flex items-center justify-center">
        <Spinner size="small" />
      </aside>
    );
  }
  if (!request) {
    return (
      <aside className="w-full bg-[var(--surface-elevated)] flex flex-col">
        <PanelHeader title="Request" onClose={close} />
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
          {error ?? 'Request not found.'}
        </div>
      </aside>
    );
  }

  const partner = request.approver ?? null;
  const isMine = request.requesterId === meId;
  const canRelease = isMine && (request.status === 'APPROVED' || request.status === 'RENEWAL_PENDING');

  return (
    <aside className="w-full bg-[var(--surface-elevated)] flex flex-col overflow-hidden">
      <PanelHeader
        title={request.record?.name ?? 'Request'}
        subtitle={request.record?.systemName}
        onClose={close}
      />

      <div className="flex-1 overflow-auto px-5 py-2 space-y-4">
        <div>
          <div className="text-[12px] text-[var(--text-muted)] mb-1">Status</div>
          <span className="inline-flex items-center gap-2">
            <StatusDot status={request.status} size={16} />
            <span className="text-sm font-semibold">{statusLabel(request.status)}</span>
            {seconds !== null && (request.status === 'APPROVED' || request.status === 'RENEWAL_PENDING') && (
              <span className="text-xs ks-mono text-[var(--text-muted)] ml-2">{formatCountdown(seconds)}</span>
            )}
          </span>
        </div>

        <div>
          <div className="text-[12px] text-[var(--text-muted)] mb-1">Reason</div>
          <div className="text-sm">{request.reason}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] text-[var(--text-muted)] mb-1">Requested</div>
            <div className="text-sm font-medium">{request.requestedDurationMin} min</div>
          </div>
          {request.approvedDurationMin !== null && request.approvedDurationMin !== undefined && (
            <div>
              <div className="text-[12px] text-[var(--text-muted)] mb-1">Approved</div>
              <div className="text-sm font-medium">{request.approvedDurationMin} min</div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[12px] text-[var(--text-muted)] mb-1">Approver</div>
          <div className="flex items-center justify-between gap-2">
            <TeamsUserPill user={partner} size={24} />
            {partner && (
              <MessageInTeamsButton
                user={partner}
                draftMessage={`About my access request for ${request.record?.name ?? 'a record'}: `}
                label="Message"
              />
            )}
          </div>
        </div>

        {request.shareLink && isMine && (
          <ShareLinkBlock value={request.shareLink} />
        )}

        {request.notes && (
          <div>
            <div className="text-[12px] text-[var(--text-muted)] mb-1">Notes</div>
            <div className="text-sm whitespace-pre-wrap">{request.notes}</div>
          </div>
        )}

        {error && <div className="text-xs text-red-500">{error}</div>}
      </div>

      <div className="px-5 py-3 bg-[var(--surface-elevated)] flex items-center gap-2">
        <Button appearance="subtle" onClick={showMyRequests}>← All requests</Button>
        <div className="flex-1" />
        {canRelease && (
          <Button appearance="primary" onClick={handleRelease} disabled={busy}>
            {busy ? <Spinner size="tiny" /> : 'Return passkey'}
          </Button>
        )}
      </div>
    </aside>
  );
}
