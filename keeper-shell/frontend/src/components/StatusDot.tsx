import type { RecordStatus, RequestStatus } from '@keeper-shell/shared';
import { useSettings } from '../stores/settings.store';

type AnyStatus = RecordStatus | RequestStatus;

type Variant = 'available' | 'not-available' | 'on-hold' | 'down' | 'closed';

interface StatusMeta {
  variant: Variant;
  label: string;
}

/**
 * Backend → user-facing taxonomy.
 *
 *   AVAILABLE         → Available       (green check)
 *   LEASED            → Not Available   (red dash)
 *   PENDING_APPROVAL  → On Hold         (amber dash)
 *   RENEWAL_PENDING   → On Hold         (orange clock)
 *   LOCKED            → Closed          (grey X)
 *   EXPIRED           → Closed          (grey clock)
 *
 * 'Down' is reserved for a future health-check state surfaced from the real
 * Keeper Vault when the underlying record's target system is unreachable.
 * Today no records are marked Down; the variant + dot are wired so flipping
 * a record to that state lights up the right glyph immediately.
 */
const META: Record<string, StatusMeta> = {
  // Record states
  AVAILABLE: { variant: 'available', label: 'Available' },
  LEASED: { variant: 'not-available', label: 'Not Available' },
  PENDING_APPROVAL: { variant: 'on-hold', label: 'On Hold' },
  RENEWAL_PENDING: { variant: 'on-hold', label: 'On Hold' },
  LOCKED: { variant: 'closed', label: 'Closed' },
  EXPIRED: { variant: 'closed', label: 'Closed' },
  DOWN: { variant: 'down', label: 'Down' },
  // Request states (kept for backwards-compat in MyRequests / Approvals / Audit)
  PENDING: { variant: 'on-hold', label: 'On Hold' },
  APPROVED: { variant: 'not-available', label: 'Active' },
  DENIED: { variant: 'closed', label: 'Denied' },
  RELEASED: { variant: 'closed', label: 'Released' },
};

const COLOR: Record<Variant, string> = {
  available: 'var(--status-available)',
  'not-available': 'var(--status-dnd)',
  'on-hold': 'var(--status-warning)',
  down: 'var(--status-busy)',
  closed: 'var(--status-offline)',
};

export function StatusDot({
  status,
  size = 12,
}: {
  status: AnyStatus | 'DOWN';
  size?: number;
}): JSX.Element {
  const overrides = useSettings((s) => s.statusOverrides[status]);
  const meta = META[status] ?? { variant: 'closed' as Variant, label: status };
  const color = overrides?.color ?? COLOR[meta.variant];
  const label = overrides?.label ?? meta.label;
  return (
    <span
      className="shrink-0 inline-block rounded-full"
      style={{ width: size, height: size, background: color }}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

export function StatusLabel({
  status,
  size = 16,
  className = '',
}: {
  status: AnyStatus | 'DOWN';
  size?: number;
  className?: string;
}): JSX.Element {
  const override = useSettings((s) => s.statusOverrides[status]);
  const meta = META[status] ?? { variant: 'closed' as Variant, label: status };
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <StatusDot status={status} size={size} />
      <span className="text-sm font-medium">{override?.label ?? meta.label}</span>
    </span>
  );
}

/**
 * Hook variant — used in JSX where you can call hooks. Honors admin overrides.
 */
export function useStatusLabel(status: AnyStatus | 'DOWN'): string {
  const override = useSettings((s) => s.statusOverrides[status]);
  return override?.label ?? META[status]?.label ?? status;
}

/** Plain function — does NOT honor overrides. Used in non-React contexts. */
export function statusLabel(status: AnyStatus | 'DOWN'): string {
  return (META[status] ?? { label: status }).label;
}
