import { useCallback, useEffect, useState } from 'react';
import { Body1, Button, Dropdown, Option, Spinner, Title2 } from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import type { AuditAction, AuditEventDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { TeamsUserPill } from '../components/TeamsUserPill';

const ACTIONS: Array<AuditAction | 'ALL'> = [
  'ALL',
  'REQUEST_CREATED',
  'REQUEST_APPROVED',
  'REQUEST_DENIED',
  'LEASE_STARTED',
  'SHARE_ISSUED',
  'RENEWAL_PROMPTED',
  'RENEWAL_REQUESTED',
  'EXTENSION_APPROVED',
  'EXTENSION_DENIED',
  'LEASE_RELEASED',
  'LEASE_EXPIRED',
  'RECORD_LOCKED',
  'RECORD_UNLOCKED',
];

export function AuditPage(): JSX.Element {
  const [events, setEvents] = useState<AuditEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditAction | 'ALL'>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.listAudit(filter === 'ALL' ? {} : { action: filter });
        if (!cancelled) setEvents(data.events);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter, refreshKey]);

  return (
    <div className="h-full overflow-auto bg-[var(--surface)] text-[var(--text)]">
      <div className="p-6 max-w-6xl">
        <header className="flex items-end justify-between mb-4">
          <div>
            <Title2 as="h1" className="block">Audit log</Title2>
            <Body1 className="block text-[var(--text-muted)] mt-1">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </Body1>
          </div>
          <div className="flex items-center gap-2">
            <Dropdown
              value={filter === 'ALL' ? 'All actions' : filter}
              selectedOptions={[filter]}
              onOptionSelect={(_e, d) => setFilter((d.optionValue ?? 'ALL') as AuditAction | 'ALL')}
            >
              {ACTIONS.map((a) => (
                <Option key={a} value={a} text={a === 'ALL' ? 'All actions' : a}>
                  {a === 'ALL' ? 'All actions' : a}
                </Option>
              ))}
            </Dropdown>
            <Button appearance="subtle" icon={<ArrowClockwise24Regular />} onClick={reload} />
          </div>
        </header>

        {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-sm text-red-800 dark:text-red-200 rounded">{error}</div>}

        {loading && events.length === 0 ? (
          <div className="flex items-center gap-3 py-12 justify-center text-[var(--text-muted)]">
            <Spinner size="small" /><Body1>Loading...</Body1>
          </div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-muted)]">
            <Body1>No matching events.</Body1>
          </div>
        ) : (
          <div className="bg-[var(--surface-elevated)] rounded-md overflow-hidden">
            <div className="grid grid-cols-[140px_180px_160px_1fr] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide px-4 py-2 bg-[var(--surface-hover)]">
              <span>When</span>
              <span>Action</span>
              <span>Actor</span>
              <span>Detail</span>
            </div>
            {events.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[140px_180px_160px_1fr] items-center px-4 py-2 text-sm hover:bg-[var(--surface-hover)] transition-colors"
              >
                <span className="text-[var(--text-muted)]">
                  {new Date(e.createdAt).toLocaleString([], {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </span>
                <span className="ks-mono text-xs text-[var(--text)]">{e.action}</span>
                <TeamsUserPill user={e.actor} size={20} />
                <span className="text-[var(--text-muted)] truncate">{e.detail ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
