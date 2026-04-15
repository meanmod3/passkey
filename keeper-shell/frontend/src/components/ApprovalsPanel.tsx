import { useCallback, useEffect, useState } from 'react';
import {
  Body1,
  Button,
  Input,
  Spinner,
  Textarea,
} from '@fluentui/react-components';
import { ArrowClockwise20Regular } from '@fluentui/react-icons';
import type { RequestDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { TeamsUserPill } from './TeamsUserPill';
import { MessageInTeamsButton } from './MessageInTeamsButton';
import { useRightPanel } from '../stores/rightPanel.store';
import { PanelHeader } from './MyRequestsPanel';

export function ApprovalsPanel(): JSX.Element {
  const close = useRightPanel((s) => s.close);
  const [requests, setRequests] = useState<RequestDTO[]>([]);
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
        const data = await api.listRequests({ status: 'PENDING' });
        if (!cancelled) setRequests(data.requests);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Poll every 15s for new pending requests.
  useEffect(() => {
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <aside className="w-[420px] shrink-0 bg-[var(--surface-elevated)] flex flex-col overflow-hidden">
      <PanelHeader
        title="Approvals queue"
        subtitle={`${requests.length} pending ${requests.length === 1 ? 'request' : 'requests'}`}
        onClose={close}
      >
        <Button appearance="subtle" size="small" icon={<ArrowClockwise20Regular />} onClick={reload} />
      </PanelHeader>

      <div className="flex-1 overflow-auto px-3 py-2">
        {error && <div className="m-2 p-3 bg-red-50 dark:bg-red-900/30 text-sm text-red-800 dark:text-red-200 rounded">{error}</div>}

        {loading && requests.length === 0 ? (
          <div className="flex items-center gap-2 justify-center text-[var(--text-muted)] py-12">
            <Spinner size="small" /> <Body1>Loading...</Body1>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-muted)] text-sm">Nothing pending approval.</div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => <ApprovalCard key={r.id} request={r} onChange={reload} />)}
          </div>
        )}
      </div>
    </aside>
  );
}

function ApprovalCard({ request, onChange }: { request: RequestDTO; onChange: () => void }): JSX.Element {
  const [override, setOverride] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [mode, setMode] = useState<'idle' | 'approve' | 'deny'>('idle');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doApprove(): Promise<void> {
    setBusy('approve');
    setError(null);
    try {
      const input: { approvedDurationMin?: number } = {};
      const n = Number(override);
      if (override && Number.isFinite(n) && n > 0) input.approvedDurationMin = n;
      await api.approveRequest(request.id, input);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function doDeny(): Promise<void> {
    setBusy('deny');
    setError(null);
    try {
      await api.denyRequest(request.id, denyReason ? { reason: denyReason } : {});
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'deny failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md p-3 bg-[var(--surface-hover)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[14px] font-semibold truncate flex-1">{request.record?.name ?? 'record'}</span>
        <span className="text-[11px] text-[var(--text-subtle)] uppercase tracking-wider">
          {request.record?.environment}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
        <TeamsUserPill user={request.requester} size={20} />
        <span className="text-[var(--text-muted)]">requested</span>
        <span className="ks-mono font-semibold">{request.requestedDurationMin} min</span>
        {request.type === 'EXTENSION' && <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--status-warning)' }}>Extension</span>}
      </div>
      <div className="text-[13px] mb-3 whitespace-pre-wrap text-[var(--text)]">"{request.reason}"</div>
      {request.notes && <div className="text-[11px] text-[var(--text-muted)] mb-3">Notes: {request.notes}</div>}

      {mode === 'idle' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="small" appearance="primary" onClick={() => setMode('approve')}>Approve</Button>
          <Button size="small" appearance="secondary" onClick={() => setMode('deny')}>Deny</Button>
          <div className="flex-1" />
          <MessageInTeamsButton
            user={request.requester}
            draftMessage={`About your access request for ${request.record?.name ?? 'a record'} — `}
            label="Contact"
          />
        </div>
      )}

      {mode === 'approve' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[var(--text-muted)]">Approve for</span>
            <Input
              type="number"
              size="small"
              className="!w-20"
              value={override}
              placeholder={String(request.requestedDurationMin)}
              onChange={(_e, d) => setOverride(d.value)}
              min={1}
              max={480}
              contentAfter={<span className="text-xs text-[var(--text-muted)]">min</span>}
            />
            <span className="text-[11px] text-[var(--text-subtle)]">(blank = as requested)</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="small" appearance="subtle" onClick={() => setMode('idle')} disabled={busy !== null}>Cancel</Button>
            <div className="flex-1" />
            <Button size="small" appearance="primary" onClick={doApprove} disabled={busy !== null}>
              {busy === 'approve' ? <Spinner size="tiny" /> : 'Confirm approve'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'deny' && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={denyReason}
            onChange={(_e, d) => setDenyReason(d.value)}
            placeholder="Reason for denial (optional)"
            rows={2}
            resize="vertical"
          />
          <div className="flex items-center gap-2">
            <Button size="small" appearance="subtle" onClick={() => setMode('idle')} disabled={busy !== null}>Cancel</Button>
            <div className="flex-1" />
            <Button size="small" appearance="primary" onClick={doDeny} disabled={busy !== null}>
              {busy === 'deny' ? <Spinner size="tiny" /> : 'Confirm deny'}
            </Button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  );
}
