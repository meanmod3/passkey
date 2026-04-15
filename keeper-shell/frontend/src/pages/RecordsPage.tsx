import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Input,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import {
  Search16Regular,
  Dismiss24Regular,
  ChevronRight20Filled,
  ChevronDown20Filled,
  Database20Regular,
  ArrowSortDown20Regular,
  ArrowSortUp20Regular,
} from '@fluentui/react-icons';
import { TeamsUserPill } from '../components/TeamsUserPill';
import type { Environment, RecordDTO } from '@keeper-shell/shared';
import { StatusDot, statusLabel, useStatusLabel } from '../components/StatusDot';
import { RecordDetailDrawer } from '../components/RecordDetailDrawer';
import { MyRequestsPanel } from '../components/MyRequestsPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { RequestDetailPanel } from '../components/RequestDetailPanel';
import { ApprovalsPanel } from '../components/ApprovalsPanel';
import { formatTimeRemainingShort, useCountdown } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { useMyActiveLease } from '../hooks/useMyActiveLease';
import { useRightPanel } from '../stores/rightPanel.store';
import { useResizableWidth } from '../hooks/useResizableWidth';
import { ResizableDivider } from '../components/ResizableDivider';

// Right-panel resize bounds: 320 keeps buttons/copy legible; 720 leaves room
// for the vault column on a 1280px viewport. Default 420 = legacy w-[420px].
const RIGHT_PANEL_MIN = 320;
const RIGHT_PANEL_MAX = 720;
const RIGHT_PANEL_DEFAULT = 420;

const ENV_ORDER: Environment[] = ['SHARED', 'POD', 'PHARMACY', 'WIKI'];

const ENV_LABEL: Record<Environment, string> = {
  SHARED: 'Shared',
  POD: 'Pod',
  PHARMACY: 'Pharmacy',
  WIKI: 'Wiki',
};

/**
 * Status filter options shown in the footer Dropdown. Values map to the
 * user-facing label (not the backend RecordStatus) — when the user picks
 * "On Hold" we include both PENDING_APPROVAL and RENEWAL_PENDING records,
 * and similarly for "Closed" = LOCKED ∪ EXPIRED. 'all' is the default.
 */
const STATUS_FILTER_LABELS = ['All', 'Available', 'On Hold', 'Not Available', 'Closed'] as const;
type StatusFilterValue = (typeof STATUS_FILTER_LABELS)[number];

type OwnershipFilter = 'all' | 'mine';

export function RecordsPage(): JSX.Element {
  const [records, setRecords] = useState<RecordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('All');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [expanded, setExpanded] = useState<Set<Environment>>(() => new Set<Environment>());
  const [refreshKey, setRefreshKey] = useState(0);
  const currentUser = useAuthStore((s) => s.user);
  const { lease: myLease, reload: reloadMyLease } = useMyActiveLease();
  const blockedByActiveLease = !!myLease && !currentUser?.allowMultipleLeases;
  const panel = useRightPanel();
  const selectedId = panel.mode === 'record' ? panel.recordId ?? null : null;

  // Right-panel resize — width persisted under ks:rightPanelWidth.
  const rightPanel = useResizableWidth({
    storageKey: 'ks:rightPanelWidth',
    defaultWidth: RIGHT_PANEL_DEFAULT,
    minWidth: RIGHT_PANEL_MIN,
    maxWidth: RIGHT_PANEL_MAX,
    edge: 'left',
  });

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
    reloadMyLease();
  }, [reloadMyLease]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.listRecords({
          q: search.trim() || undefined,
        });
        if (!cancelled) setRecords(data.records);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 200 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, refreshKey]);

  /**
   * Records after the two client-side filters are applied:
   *   - status filter (All | Available | On Hold | Not Available | Closed)
   *   - ownership filter (all | mine — records owned by the current user)
   *
   * Search goes server-side via listRecords({ q }); these two stay client-side
   * so the counts / ordering update instantly without refetching.
   */
  const visibleRecords = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== 'All' && statusLabel(r.status) !== statusFilter) return false;
      if (ownershipFilter === 'mine' && r.ownerId !== currentUser?.id) return false;
      return true;
    });
  }, [records, statusFilter, ownershipFilter, currentUser?.id]);

  const grouped = useMemo(() => {
    const map = new Map<Environment, RecordDTO[]>();
    for (const r of visibleRecords) {
      const list = map.get(r.environment) ?? [];
      list.push(r);
      map.set(r.environment, list);
    }
    // Records inside each folder stay alphabetical regardless of sort direction —
    // the Sort by Name control targets FOLDER order, not record order.
    for (const [env, list] of map) {
      list.sort((a, b) => a.name.localeCompare(b.name));
      map.set(env, list);
    }
    return map;
  }, [visibleRecords]);

  /**
   * Folder (environment) render order driven by the Sort by Name toggle.
   * Asc = A→Z by ENV_LABEL ("Development", "Production", "Shared", "Staging")
   * Desc = Z→A. Replaces the previous hardcoded ENV_ORDER render.
   */
  const envOrder = useMemo<Environment[]>(() => {
    const present = ENV_ORDER.filter((env) => grouped.has(env));
    return present.slice().sort((a, b) =>
      sortDir === 'asc'
        ? ENV_LABEL[a].localeCompare(ENV_LABEL[b])
        : ENV_LABEL[b].localeCompare(ENV_LABEL[a]),
    );
  }, [grouped, sortDir]);

  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  function toggleEnv(env: Environment): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(env)) next.delete(env); else next.add(env);
      return next;
    });
  }

  return (
    <div className="h-full flex bg-[var(--surface)] text-[var(--text)] min-h-0">
      {/* Vault column (search + list) — left of the right panel, both full-height siblings */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Search bar + Sort — single row */}
        <div className="px-6 py-4 flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-2xl">
            <Input
              contentBefore={<Search16Regular className="text-[var(--text-muted)]" />}
              contentAfter={search ? (
                <Button appearance="transparent" size="small" icon={<Dismiss24Regular />} onClick={() => setSearch('')} />
              ) : undefined}
              placeholder="Search by record name or owner"
              className="!w-full ks-search"
              value={search}
              onChange={(_e, d) => setSearch(d.value)}
            />
          </div>
          <button
            type="button"
            aria-label={`Sort folders ${sortDir === 'asc' ? 'A to Z' : 'Z to A'} — click to toggle`}
            title={`Folder order — click to toggle (currently ${sortDir === 'asc' ? 'A → Z' : 'Z → A'})`}
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)] shrink-0"
          >
            {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
            {sortDir === 'asc' ? <ArrowSortDown20Regular /> : <ArrowSortUp20Regular />}
          </button>
        </div>

        <div className="flex-1 overflow-auto">

          {error && <div className="mx-6 mb-3 p-3 bg-red-50 text-sm text-red-800 rounded">{error}</div>}

          {loading && records.length === 0 ? (
            <div className="flex items-center gap-3 py-12 justify-center text-[var(--text-muted)]">
              <Spinner size="small" /> Loading vault...
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-muted)] text-sm">
              {records.length === 0 ? 'No records match your search.' : 'No records match the current filters.'}
            </div>
          ) : (
            <ul className="pb-10 list-none m-0 p-0 px-3">
              {envOrder.map((env) => {
                const list = grouped.get(env) ?? [];
                const isOpen = expanded.has(env);
                return (
                  <li key={env} className="select-none mb-1">
                    <button
                      type="button"
                      onClick={() => toggleEnv(env)}
                      className="w-full flex items-center gap-2 px-3 py-3 text-left rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <span className="w-5 shrink-0 text-[var(--text-muted)]">
                        {isOpen ? <ChevronDown20Filled /> : <ChevronRight20Filled />}
                      </span>
                      <FolderIcon />
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold truncate">{ENV_LABEL[env]}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {list.length} {list.length === 1 ? 'record' : 'records'}
                        </div>
                      </div>
                      <FolderStatusDots records={list} dimmed={isOpen} />
                    </button>
                    {isOpen && (
                      <ul className="list-none m-0 p-0">
                        {list.map((r) => (
                          <RecordRow
                            key={r.id}
                            record={r}
                            selected={r.id === selectedId}
                            isAdmin={currentUser?.role === 'ADMIN'}
                            onSelect={() => panel.showRecord(r.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Vault footer — count (bottom-left), my-accesses radio (center),
            status filter dropdown (bottom-right). */}
        <div className="shrink-0 border-t border-[var(--border)] px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-muted)]">
          <span aria-live="polite">
            {visibleRecords.length} {visibleRecords.length === 1 ? 'record' : 'records'}
            {(search.trim() || statusFilter !== 'All' || ownershipFilter !== 'all') ? ' (filtered)' : ''}
          </span>
          <span className="flex-1" />
          {currentUser && (
            <RadioGroup
              value={ownershipFilter}
              onChange={(_e, d) => setOwnershipFilter(d.value as OwnershipFilter)}
              layout="horizontal"
              aria-label="Filter by ownership"
            >
              <Radio value="all" label="All" />
              <Radio value="mine" label="My accesses" />
            </RadioGroup>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="shrink-0">Status</label>
            <Dropdown
              id="status-filter"
              size="small"
              value={statusFilter}
              selectedOptions={[statusFilter]}
              onOptionSelect={(_e, d) => setStatusFilter((d.optionValue as StatusFilterValue) ?? 'All')}
              aria-label="Filter records by status"
            >
              {STATUS_FILTER_LABELS.map((label) => (
                <Option key={label} value={label} text={label}>
                  {label}
                </Option>
              ))}
            </Dropdown>
          </div>
        </div>
      </div>

      {/* Draggable gutter between the vault column and the right panel. */}
      <ResizableDivider
        ariaLabel="Resize right panel"
        ariaValueNow={rightPanel.width}
        ariaValueMin={RIGHT_PANEL_MIN}
        ariaValueMax={RIGHT_PANEL_MAX}
        isDragging={rightPanel.isDragging}
        onPointerDown={rightPanel.onPointerDown}
        onKeyDown={rightPanel.onKeyDown}
      />

      {/* Right panel — sibling of the vault column, spans the full page height.
          Width is controlled here; inner panels render `w-full` to fill. */}
      <aside
        style={{ width: rightPanel.width }}
        className="shrink-0 flex min-h-0"
      >
        {panel.mode === 'my-requests' && <MyRequestsPanel />}
        {panel.mode === 'notifications' && <NotificationsPanel />}
        {panel.mode === 'approvals' && <ApprovalsPanel />}
        {panel.mode === 'request' && panel.requestId && <RequestDetailPanel requestId={panel.requestId} />}
        {(panel.mode === 'record' || panel.mode === 'empty') && (
          <RecordDetailDrawer
            record={selected}
            isAdmin={currentUser?.role === 'ADMIN'}
            isOwner={!!selected && !!currentUser && selected.ownerId === currentUser.id}
            isHolder={!!selected?.currentLease && selected.currentLease.requesterId === currentUser?.id}
            blockedByActiveLease={blockedByActiveLease}
            onClose={() => panel.close()}
            onRequestSubmitted={reload}
            onRelease={async (requestId) => {
              await api.releaseRequest(requestId);
              reload();
            }}
          />
        )}
      </aside>
    </div>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <span
      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
      style={{ background: 'var(--accent-soft)', color: 'var(--accent-dark)' }}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.38a1.5 1.5 0 0 1 1.06.44l1.12 1.12a.5.5 0 0 0 .35.15H16.5A1.5 1.5 0 0 1 18 7.2V15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15V5.5Z" />
      </svg>
    </span>
  );
}

/**
 * Compact row of small dots — one per child record, color-keyed to status.
 * Lets the user scan whether anything in the folder is requestable without
 * having to expand it. Tooltip surfaces the count breakdown.
 */
function FolderStatusDots({ records, dimmed = false }: { records: RecordDTO[]; dimmed?: boolean }): JSX.Element {
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      const label = statusLabel(r.status);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  const tooltip = breakdown.map(([label, n]) => `${n} ${label}`).join(' · ');
  const MAX_DOTS = 8;
  const visible = records.slice(0, MAX_DOTS);
  const overflow = records.length - visible.length;

  return (
    <Tooltip content={tooltip} relationship="label" positioning="below">
      <span
        className={`flex items-center gap-1 ml-2 shrink-0 transition-opacity ${dimmed ? 'opacity-40' : 'opacity-100'}`}
      >
        {visible.map((r) => (
          <StatusDot key={r.id} status={r.status} size={10} />
        ))}
        {overflow > 0 && (
          <span className="text-[10px] text-[var(--text-muted)] ml-0.5">+{overflow}</span>
        )}
      </span>
    </Tooltip>
  );
}

/** Status label that reads the admin override at render time. */
function RowStatusLabel({ status }: { status: RecordDTO['status'] }): JSX.Element {
  const label = useStatusLabel(status);
  return <span className="text-xs text-[var(--text-muted)]">{label}</span>;
}

/** Inline live countdown for a leased record — text only, no chip. */
function InlineCountdown({ record }: { record: RecordDTO }): JSX.Element | null {
  const seconds = useCountdown(record.currentLease?.leaseExpiresAt ?? null);
  if (seconds === null) return null;
  return (
    <span className="text-xs ks-mono text-[var(--text-muted)]" title="Time remaining on current lease">
      {formatTimeRemainingShort(seconds)}
    </span>
  );
}

function RecordRow({
  record,
  selected,
  isAdmin,
  onSelect,
}: {
  record: RecordDTO;
  selected: boolean;
  isAdmin: boolean;
  onSelect: () => void;
}): JSX.Element {
  const lease = record.currentLease;
  const isUnavailable = record.status === 'LEASED' || record.status === 'RENEWAL_PENDING';
  // Borrower is shown when the admin hasn't disabled viewership, OR when the
  // current viewer is themselves an admin.
  const borrowerVisible = !record.hideBorrower || isAdmin;
  // Suppress the "Not Available" text label when the borrower IS visible —
  // the avatar + countdown already convey "in use". Show the label only when
  // the user has nothing else to read the state from (borrower hidden).
  const showStatusLabel = !(isUnavailable && borrowerVisible);

  return (
    <li>
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
        className={`
          group relative flex items-center gap-3 pl-9 pr-3 py-2.5 my-0.5 rounded-md cursor-pointer transition-colors
          hover:bg-[var(--surface-hover)]
          ${selected ? 'ring-1 ring-inset ring-[var(--border-strong)]' : 'ring-0'}
        `}
      >
        <span className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-[var(--surface-hover)] text-[var(--text-muted)]">
          <Database20Regular />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold truncate">{record.name}</div>
          {isAdmin && (
            <div className="text-[12px] ks-mono truncate text-[var(--text-muted)]">
              {record.systemName}
            </div>
          )}
        </div>

        {/* Borrower avatar + inline countdown — only when borrower viewership is allowed */}
        {isUnavailable && lease?.requester && borrowerVisible && (
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <TeamsUserPill user={lease.requester} size={32} showName={false} />
            <InlineCountdown record={record} />
          </div>
        )}

        {/* Status label (text) + dot on the far right.
            For unavailable records, the label is suppressed when the borrower
            is on display — the avatar + countdown already say "in use". */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {showStatusLabel && (
            <RowStatusLabel status={record.status} />
          )}
          <StatusDot status={record.status} size={10} />
        </div>
      </div>
    </li>
  );
}
