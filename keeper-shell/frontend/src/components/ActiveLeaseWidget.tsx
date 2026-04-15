import { useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import type { RequestDTO } from '@keeper-shell/shared';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';
import { PasskeyBrandIcon } from './PasskeyBrandIcon';

/**
 * Sidebar empty state — shown when the user has no active passkey.
 * Lives in the same slot as ActiveLeaseWidget so the bottom of the
 * sidebar always has something to anchor the user's eye.
 */
export function ActiveLeaseEmptyWidget(): JSX.Element {
  return (
    <div className="m-3 rounded-xl bg-[var(--surface-hover)] p-3 text-center">
      <div className="mb-3 flex justify-center">
        <PasskeyBrandIcon className="w-8 h-8 text-[var(--text-muted)]" iconSize={18} />
      </div>
      <div className="text-[12px] font-semibold text-[var(--text-muted)]">No passkey active</div>
      <div className="text-[11px] text-[var(--text-subtle)] mt-0.5">
        Select a record to request access
      </div>
    </div>
  );
}

/**
 * Pinned at the bottom of the sidebar whenever the user holds an active
 * passkey. Live countdown + "Return" button.
 */
export function ActiveLeaseWidget({
  lease,
  onReturned,
}: {
  lease: RequestDTO;
  onReturned: () => void;
}): JSX.Element {
  const seconds = useCountdown(lease.leaseExpiresAt ?? null);
  const totalMin = lease.approvedDurationMin ?? lease.requestedDurationMin;
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lowTime = seconds !== null && seconds < 60;

  async function handleReturn(): Promise<void> {
    setReturning(true);
    setError(null);
    try {
      await api.releaseRequest(lease.id);
      onReturned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'release failed');
    } finally {
      setReturning(false);
    }
  }

  return (
    <div className="m-3 rounded-xl bg-[var(--surface-hover)] p-3">
      <div>
        <div className="text-[13px] font-bold truncate">{lease.record?.name ?? 'Active passkey'}</div>
        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
          <span className={`ks-mono font-semibold ${lowTime ? 'text-red-500' : ''}`}>
            {seconds !== null ? formatCountdown(seconds) : '—'}
          </span>
          <span className="opacity-60"> / {totalMin}:00</span>
        </div>
      </div>
      <button
        type="button"
        onClick={handleReturn}
        disabled={returning}
        className="
          mt-3 w-full text-[12px] font-bold uppercase tracking-wider
          rounded-md py-2
          bg-[var(--accent-soft)] text-[var(--accent-dark)]
          border border-[var(--accent-soft)]
          hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)]
          disabled:opacity-60 disabled:cursor-not-allowed
          transition-colors flex items-center justify-center gap-2
        "
      >
        {returning ? <Spinner size="tiny" /> : 'Return'}
      </button>
      {error && <div className="mt-2 text-[11px] text-red-500">{error}</div>}
    </div>
  );
}
