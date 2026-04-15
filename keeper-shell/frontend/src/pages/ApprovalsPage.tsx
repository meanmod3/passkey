import { useCallback, useEffect, useState } from 'react';
import {
  Body1,
  Button,
  Input,
  Spinner,
  Title2,
  Textarea,
} from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import type { RequestDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { TeamsUserPill } from '../components/TeamsUserPill';
import { MessageInTeamsButton } from '../components/MessageInTeamsButton';

export function ApprovalsPage(): JSX.Element {
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
    <div className="p-6 max-w-4xl">
      <header className="flex items-end justify-between mb-4">
        <div>
          <Title2 as="h1" className="block">Approvals queue</Title2>
          <Body1 className="block text-neutral-600 mt-1">
            {requests.length} pending {requests.length === 1 ? 'request' : 'requests'}
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
      ) : requests.length === 0 ? (
        <div className="py-16 text-center bg-white border border-dashed border-neutral-300 rounded-md">
          <Body1 className="block text-neutral-600">Nothing pending approval.</Body1>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => <ApprovalCard key={r.id} request={r} onChange={reload} />)}
        </div>
      )}
    </div>
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
    <div className="bg-white border border-neutral-200 rounded-md p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-semibold truncate">{request.record?.name ?? 'record'}</span>
        <StatusBadge status={request.status} />
        <span className="text-xs text-neutral-500">· {request.record?.environment}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-neutral-800 mb-2 flex-wrap">
        <TeamsUserPill user={request.requester} size={20} />
        <span>requested</span>
        <span className="ks-mono font-semibold">{request.requestedDurationMin} min</span>
        {request.type === 'EXTENSION' && <span className="text-amber-700 text-xs font-semibold uppercase tracking-wide">Extension</span>}
      </div>
      <div className="text-sm text-neutral-700 mb-3 whitespace-pre-wrap">"{request.reason}"</div>
      {request.notes && <div className="text-xs text-neutral-500 mb-3">Notes: {request.notes}</div>}

      {mode === 'idle' && (
        <div className="flex items-center gap-2">
          <Button appearance="primary" onClick={() => setMode('approve')}>Approve</Button>
          <Button appearance="secondary" onClick={() => setMode('deny')}>Deny</Button>
          <div className="flex-1" />
          <MessageInTeamsButton
            user={request.requester}
            draftMessage={`About your access request for ${request.record?.name ?? 'a record'} — `}
            label="Contact requester"
          />
        </div>
      )}

      {mode === 'approve' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-700">Approve for</span>
          <Input
            type="number"
            size="small"
            className="!w-20"
            value={override}
            placeholder={String(request.requestedDurationMin)}
            onChange={(_e, d) => setOverride(d.value)}
            min={1}
            max={480}
            contentAfter={<span className="text-xs text-neutral-500">min</span>}
          />
          <span className="text-xs text-neutral-500">(blank = as requested)</span>
          <div className="flex-1" />
          <Button size="small" appearance="primary" onClick={doApprove} disabled={busy !== null}>
            {busy === 'approve' ? <Spinner size="tiny" /> : 'Confirm approve'}
          </Button>
          <Button size="small" appearance="subtle" onClick={() => setMode('idle')} disabled={busy !== null}>
            Cancel
          </Button>
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
            <div className="flex-1" />
            <Button size="small" appearance="primary" onClick={doDeny} disabled={busy !== null}>
              {busy === 'deny' ? <Spinner size="tiny" /> : 'Confirm deny'}
            </Button>
            <Button size="small" appearance="subtle" onClick={() => setMode('idle')} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
