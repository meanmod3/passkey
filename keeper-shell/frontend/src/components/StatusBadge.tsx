import type { RecordStatus, RequestStatus } from '@keeper-shell/shared';
import { StatusLabel } from './StatusDot';

// Back-compat wrapper — rendered as a dot + label pair.
export function StatusBadge({ status }: { status: RecordStatus | RequestStatus }): JSX.Element {
  return <StatusLabel status={status} />;
}
