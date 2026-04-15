import { useEffect, useState } from 'react';

/**
 * Returns remaining seconds until `target` (UTC ISO string or Date), ticking once per second.
 * Returns 0 when elapsed. Returns null when target is null.
 */
export function useCountdown(target: string | Date | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;
  const ms = (typeof target === 'string' ? new Date(target).getTime() : target.getTime()) - now;
  return Math.max(0, Math.floor(ms / 1000));
}

export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Short human-readable version, e.g. "1h 2m", "12m", "<1m".
 * Used on unavailable record rows to show when the record frees up.
 */
export function formatTimeRemainingShort(seconds: number): string {
  if (seconds <= 0) return 'now';
  if (seconds < 60) return '<1m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
