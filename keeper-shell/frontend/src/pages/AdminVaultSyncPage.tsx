import { useCallback, useEffect, useState } from 'react';
import {
  Body1,
  Button,
  Spinner,
  Title2,
  Tooltip,
} from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import type {
  VaultSyncRecordDTO,
  VaultSyncStatusResponse,
} from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';

/**
 * Admin-only read-only vault-sync dashboard (intent 144 Phase 1).
 * Shows, per Record, how fresh the local cache is vs. the Keeper vault.
 * Auto-refreshes every 30 s (same cadence as AppShell's unread-count poll).
 *
 * Phase 2 (future intent) will add:
 *   - Sync Now button (manual sync for a single record)
 *   - Reconcile Orphaned form (re-link to a new keeperRecordUid)
 *   - Background-sync-job status (last run / next run / failures)
 */
export function AdminVaultSyncPage(): JSX.Element {
  const [data, setData] = useState<VaultSyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      if (data === null) setLoading(true);
      try {
        const res = await api.getVaultSyncStatus();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Auto-refresh every 30 s.
  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 py-6 max-w-6xl">
        <header className="flex items-end justify-between mb-5">
          <div className="flex flex-col gap-1.5">
            <Title2 as="h1">Vault sync</Title2>
            <Body1 className="text-[var(--text-muted)]">
              {data
                ? `${data.summary.totalRecords} records · freshness threshold ${data.staleSinceMinutes} min`
                : 'Loading vault sync status...'}
            </Body1>
          </div>
          <Button appearance="subtle" icon={<ArrowClockwise24Regular />} onClick={reload}>
            Refresh
          </Button>
        </header>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-sm text-red-800 rounded">{error}</div>
        )}

        {loading && !data ? (
          <div className="flex items-center gap-3 py-12 justify-center text-[var(--text-muted)]">
            <Spinner size="small" /> Loading...
          </div>
        ) : !data ? (
          <div className="py-16 text-center text-[var(--text-muted)] text-sm">
            No data.
          </div>
        ) : (
          <>
            <SummaryGrid summary={data.summary} />
            <RecordsTable records={data.records} />
            {data.generatedAt && (
              <div className="mt-4 text-[11px] text-[var(--text-subtle)] text-right">
                Snapshot: {new Date(data.generatedAt).toLocaleTimeString()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: VaultSyncStatusResponse['summary'] }): JSX.Element {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <SummaryCard label="Total records" value={summary.totalRecords} tone="neutral" />
      <SummaryCard label="Synced < 1 h" value={summary.syncedInLastHour} tone="ok" />
      <SummaryCard label="Stale" value={summary.stale} tone="warn" />
      <SummaryCard label="Orphaned" value={summary.orphaned} tone="alert" />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'ok' | 'warn' | 'alert';
}): JSX.Element {
  // Tones use existing status color variables; stay consistent with the
  // StatusDot colour palette rather than introducing ad-hoc hex values.
  const toneColor: Record<typeof tone, string> = {
    neutral: 'var(--text)',
    ok: 'var(--status-available)',
    warn: 'var(--status-warning)',
    alert: 'var(--status-dnd)',
  };
  return (
    <div className="rounded-md bg-[var(--surface-elevated)] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </div>
      <div className="text-[28px] font-bold mt-1" style={{ color: toneColor[tone] }}>
        {value}
      </div>
    </div>
  );
}

function RecordsTable({ records }: { records: VaultSyncRecordDTO[] }): JSX.Element {
  if (records.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--text-muted)] rounded-md bg-[var(--surface-elevated)]">
        No records registered yet.
      </div>
    );
  }
  return (
    <div className="rounded-md bg-[var(--surface-elevated)] overflow-hidden">
      <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_0.8fr_1fr] gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)] border-b border-[var(--border)]">
        <div>Record</div>
        <div>Status</div>
        <div>Last synced</div>
        <div>Age</div>
        <div>Revision</div>
        <div>Health</div>
      </div>
      {records.map((r) => (
        <VaultSyncRow key={r.id} record={r} />
      ))}
    </div>
  );
}

function VaultSyncRow({ record }: { record: VaultSyncRecordDTO }): JSX.Element {
  const healthToneClass: Record<VaultSyncRecordDTO['healthLabel'], string> = {
    FRESH: 'text-[var(--status-available)]',
    STALE: 'text-[var(--status-warning)]',
    ORPHANED: 'text-[var(--status-dnd)]',
    UNKNOWN: 'text-[var(--text-muted)]',
  };
  const synced = new Date(record.syncedAt);
  return (
    <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_0.8fr_1fr] gap-3 px-4 py-2.5 text-sm hover:bg-[var(--surface-hover)] transition-colors border-b border-[var(--border)] last:border-b-0">
      <div className="min-w-0">
        <div className="font-semibold truncate">{record.name}</div>
        {record.keeperUid && (
          <div className="text-[11px] ks-mono text-[var(--text-subtle)] truncate">
            {record.keeperUid}
          </div>
        )}
      </div>
      <div className="text-[var(--text-muted)] truncate">{record.status}</div>
      <Tooltip content={synced.toLocaleString()} relationship="label" positioning="above-start">
        <div className="text-[var(--text-muted)] truncate">
          {synced.toLocaleTimeString()}
        </div>
      </Tooltip>
      <div className="text-[var(--text-muted)]">{record.ageMinutes} min</div>
      <div className="ks-mono text-[var(--text-muted)]">{record.revision}</div>
      <div className={`font-semibold ${healthToneClass[record.healthLabel]}`}>
        {record.healthLabel}
      </div>
    </div>
  );
}
