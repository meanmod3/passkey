import { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Button,
  Input,
  Spinner,
} from '@fluentui/react-components';
import type { RequestDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';

const EXTEND_PRESETS = [15, 30, 60] as const;

export function RenewalPromptDialog({
  request,
  open,
  onClose,
  onAction,
}: {
  request: RequestDTO | null;
  open: boolean;
  onClose: () => void;
  onAction: () => void;
}): JSX.Element | null {
  const secondsLeft = useCountdown(request?.leaseExpiresAt ?? null);
  const [customMin, setCustomMin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!request) return null;

  async function release(): Promise<void> {
    if (!request) return;
    setBusy('release');
    setError(null);
    try {
      await api.releaseRequest(request.id);
      onAction();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'release failed');
    } finally {
      setBusy(null);
    }
  }

  async function extend(minutes: number): Promise<void> {
    if (!request) return;
    setBusy(`extend-${minutes}`);
    setError(null);
    try {
      await api.extendRequest(request.id, { requestedDurationMin: minutes });
      onAction();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'extend failed');
    } finally {
      setBusy(null);
    }
  }

  const custom = Number(customMin);
  const canCustom = Number.isFinite(custom) && custom > 0 && custom <= 240;

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()} modalType="modal">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Lease ending — {request.record?.name ?? 'record'}</DialogTitle>
          <DialogContent>
            <div className="flex flex-col gap-4 mt-2">
              <div className="text-sm text-neutral-700">
                Your lease expires in <span className="font-mono font-semibold">{secondsLeft !== null ? formatCountdown(secondsLeft) : '—'}</span>.
                Extend it, or release now to return the record to the pool.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {EXTEND_PRESETS.map((p) => (
                  <Button
                    key={p}
                    appearance="primary"
                    onClick={() => extend(p)}
                    disabled={busy !== null}
                  >
                    {busy === `extend-${p}` ? <Spinner size="tiny" /> : `Extend ${p} min`}
                  </Button>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    size="small"
                    placeholder="Custom"
                    className="!w-24"
                    value={customMin}
                    onChange={(_e, d) => setCustomMin(d.value)}
                    min={1}
                    max={240}
                  />
                  <Button
                    size="small"
                    appearance="secondary"
                    onClick={() => canCustom && extend(custom)}
                    disabled={busy !== null || !canCustom}
                  >
                    Extend
                  </Button>
                </div>
                <div className="flex-1" />
                <Button appearance="outline" onClick={release} disabled={busy !== null}>
                  {busy === 'release' ? <Spinner size="tiny" /> : 'Release now'}
                </Button>
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <div className="text-xs text-neutral-500">
                Extension requests require approver confirmation. Max 240 min / 3 extensions per lease.
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="subtle" onClick={onClose} disabled={busy !== null}>Dismiss</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
