import { useEffect, useState } from 'react';
import {
  Button,
  Dropdown,
  Field as FluentField,
  Option,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Info20Regular,
  Copy20Regular,
  Checkmark20Regular,
  History20Regular,
  Document20Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
  EyeOff20Regular,
  Edit20Regular,
} from '@fluentui/react-icons';
import type { AuditEventDTO, CreateRequestInput, RecordDTO, RecordStatus, UserDTO } from '@keeper-shell/shared';
import { StatusDot, statusLabel } from './StatusDot';
import { TeamsUserPill } from './TeamsUserPill';
import { MessageInTeamsButton } from './MessageInTeamsButton';
import { useCountdown, formatCountdown, formatTimeRemainingShort } from '../hooks/useCountdown';
import { api, ApiError } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { useSettings } from '../stores/settings.store';

function formatDuration(mins: number): string {
  if (mins >= 60 && mins % 60 === 0) {
    const h = mins / 60;
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  return `${mins} min`;
}

export function RecordDetailDrawer({
  record,
  isAdmin,
  isOwner,
  isHolder,
  blockedByActiveLease,
  onClose,
  onRequestSubmitted,
  onRelease,
}: {
  record: RecordDTO | null;
  isAdmin: boolean;
  isOwner: boolean;
  isHolder: boolean;
  blockedByActiveLease: boolean;
  onClose: () => void;
  /** Fires after a successful POST /api/requests so the parent can reload */
  onRequestSubmitted: () => void;
  onRelease: (requestId: string) => Promise<void>;
}): JSX.Element {
  const lease = record?.currentLease ?? null;
  const countdown = useCountdown(lease?.leaseExpiresAt ?? null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const meId = useAuthStore((s) => s.user?.id);
  const [editing, setEditing] = useState(false);

  // Reset editing state when the selected record changes.
  useEffect(() => { setEditing(false); }, [record?.id]);

  // Inline request form — replaces the old modal. Both fields are required.
  const reasonOptions = useSettings((s) => s.reasonCategories);
  const durationOptions = useSettings((s) => s.durationMinutes);
  const [reason, setReason] = useState<string>('');
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form whenever the selected record changes.
  useEffect(() => {
    setReason('');
    setDurationMin(null);
    setSubmitError(null);
  }, [record?.id]);

  const formValid = reason !== '' && durationMin !== null;

  if (!record) {
    return (
      <aside className="w-[420px] shrink-0 bg-[var(--surface-elevated)] hidden lg:flex items-center justify-center">
        <div className="text-center text-sm text-[var(--text-muted)] px-8">
          <Document20Regular className="mx-auto mb-2 text-[var(--text-subtle)] scale-[1.8]" />
          <div className="mt-3">Select a record to see its lease status.</div>
        </div>
      </aside>
    );
  }

  async function handleRelease(): Promise<void> {
    if (!lease) return;
    setReleasing(true);
    setReleaseError(null);
    try {
      await onRelease(lease.id);
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : 'release failed');
    } finally {
      setReleasing(false);
    }
  }

  async function handleSubmitRequest(): Promise<void> {
    if (!record || !formValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const input: CreateRequestInput = {
        recordId: record.id,
        reason: reason as string,
        requestedDurationMin: durationMin as number,
      };
      await api.createRequest(input);
      onRequestSubmitted();
      // Form reset will happen in the useEffect when the parent reloads + reselects.
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'request failed');
    } finally {
      setSubmitting(false);
    }
  }

  const canRequest = record.status === 'AVAILABLE' && !isOwner;

  return (
    <aside className="w-[420px] shrink-0 bg-[var(--surface-elevated)] flex flex-col overflow-hidden">
      {/* Header — read-only projection, no edit/share/more */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-hover)] text-[var(--text-muted)]">
            <Document20Regular />
          </span>
          <div className="flex items-center gap-1">
            <Tooltip
              content="Read-only projection — managed in Keeper Vault"
              relationship="label"
            >
              <Button appearance="subtle" size="small" icon={<Info20Regular />} />
            </Tooltip>
            {isAdmin && (
              <Tooltip content={editing ? 'Cancel edit' : 'Edit record'} relationship="label">
                <Button
                  appearance={editing ? 'primary' : 'subtle'}
                  size="small"
                  icon={<Edit20Regular />}
                  onClick={() => setEditing((v) => !v)}
                />
              </Tooltip>
            )}
            <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
          </div>
        </div>
        <h2 className="text-[20px] font-extrabold leading-tight truncate">{record.name}</h2>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <span>{envLabel(record.environment)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <EyeOff20Regular style={{ width: 14, height: 14 }} />
            Read-only
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto px-5 py-2 space-y-4">
        <Field label="Status">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2">
              <StatusDot status={record.status} size={16} />
              <span className="text-sm font-semibold">{statusLabel(record.status)}</span>
            </span>
            {countdown !== null && record.status !== 'AVAILABLE' && (
              <span className="text-xs text-[var(--text-muted)]">
                · frees up in ~{formatTimeRemainingShort(countdown)}
              </span>
            )}
          </div>
        </Field>

        {isAdmin && <CopyField label="System name" value={record.systemName} mono />}

        <Field label="Owner">
          <div className="flex items-center justify-between gap-2">
            <TeamsUserPill user={record.owner} size={24} />
            {record.owner.id !== meId && (
              <MessageInTeamsButton
                user={record.owner}
                draftMessage={`About ${record.name}: `}
                label="Message"
              />
            )}
          </div>
        </Field>

        {/* Admin edit panel — replaces the static fields when editing */}
        {editing && isAdmin && (
          <AdminEditPanel
            record={record}
            onSaved={() => { setEditing(false); onRequestSubmitted(); }}
            onCancel={() => setEditing(false)}
          />
        )}

        {lease && (!record.hideBorrower || isAdmin) && (
          <>
            <Field label="Borrower">
              <div className="flex items-center justify-between gap-2">
                <TeamsUserPill user={lease.requester} size={24} />
                {lease.requester && lease.requester.id !== meId && (
                  <MessageInTeamsButton
                    user={lease.requester}
                    draftMessage={`Could you release ${record.name} when you're done?`}
                    label="Message"
                  />
                )}
              </div>
              {record.hideBorrower && isAdmin && (
                <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Borrower is hidden from non-admin users.
                </div>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time remaining">
                <span className={`ks-mono text-[15px] font-bold ${countdown !== null && countdown < 60 ? 'text-red-600' : ''}`}>
                  {countdown !== null ? formatCountdown(countdown) : '—'}
                </span>
              </Field>
              <Field label="Duration">
                <span className="text-sm font-medium">{lease.approvedDurationMin ?? lease.requestedDurationMin} min</span>
              </Field>
            </div>
            {lease.shareLink && isHolder && (
              <CopyField label="One-time share link" value={lease.shareLink} mono />
            )}
            {lease.reason && (
              <Field label="Reason">
                <span className="text-sm whitespace-pre-wrap">{lease.reason}</span>
              </Field>
            )}
          </>
        )}

        {/* Inline request form — replaces the old modal. Both fields required. */}
        {canRequest && (
          <div className="pt-2 space-y-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)] font-bold">
              Request access
            </div>
            {blockedByActiveLease && (
              <div className="rounded-md p-3 text-[12px]" style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}>
                You already hold an active passkey. Return it from the sidebar before requesting another.
              </div>
            )}
            <FluentField label="Reason" required size="small">
              <Dropdown
                value={reason}
                selectedOptions={reason ? [reason] : []}
                placeholder="Select a category"
                onOptionSelect={(_e, d) => setReason(d.optionValue ?? '')}
              >
                {reasonOptions.map((r) => (
                  <Option key={r} value={r} text={r}>{r}</Option>
                ))}
              </Dropdown>
            </FluentField>
            <FluentField label="Duration" required size="small">
              <Dropdown
                value={durationMin !== null ? formatDuration(durationMin) : ''}
                selectedOptions={durationMin !== null ? [String(durationMin)] : []}
                placeholder="Select a duration"
                onOptionSelect={(_e, d) => setDurationMin(d.optionValue ? Number(d.optionValue) : null)}
              >
                {durationOptions.map((m) => (
                  <Option key={m} value={String(m)} text={formatDuration(m)}>{formatDuration(m)}</Option>
                ))}
              </Dropdown>
            </FluentField>
            {submitError && <div className="text-xs text-red-600">{submitError}</div>}
          </div>
        )}

        {/* Admin-only record history */}
        {isAdmin && <AdminHistorySection recordId={record.id} />}
      </div>

      {/* Action footer */}
      <div className="px-5 py-3 bg-[var(--surface-elevated)]">
        {canRequest && (
          <Button
            appearance="primary"
            onClick={handleSubmitRequest}
            disabled={!formValid || submitting || blockedByActiveLease}
            className="!w-full"
            icon={submitting ? <Spinner size="tiny" /> : undefined}
          >
            {submitting
              ? 'Sending...'
              : blockedByActiveLease
                ? 'Return active passkey first'
                : 'Request access via Teams'}
          </Button>
        )}
        {isHolder && !canRequest && (
          <>
            <Button appearance="primary" onClick={handleRelease} disabled={releasing} className="!w-full">
              {releasing ? <Spinner size="tiny" /> : 'Release lease'}
            </Button>
            <div className="mt-2 text-[11px] text-center text-[var(--text-muted)]">
              Releasing revokes the one-time share and notifies in Teams.
            </div>
          </>
        )}
        {!canRequest && !isHolder && (
          <div className="text-xs text-[var(--text-muted)] text-center">
            {record.status === 'LOCKED' && 'This record is locked. Unlock in Keeper Vault.'}
            {record.status === 'LEASED' && 'Currently leased. Wait for release or expiry.'}
            {record.status === 'PENDING_APPROVAL' && 'A request is awaiting approval in Teams.'}
            {isOwner && !isHolder && 'You own this record.'}
          </div>
        )}
      </div>

      {releaseError && (
        <div className="px-5 py-2 bg-red-50 text-xs text-red-800">{releaseError}</div>
      )}
    </aside>
  );
}

/* ------------------------------- Subcomponents ------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="text-[12px] text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-[var(--text)]">{children}</div>
    </div>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }
  return (
    <div>
      <div className="text-[12px] text-[var(--text-muted)] mb-1">{label}</div>
      <div className="flex items-center gap-2 group">
        <div className={`flex-1 min-w-0 text-sm ${mono ? 'ks-mono' : ''} truncate`}>
          {value}
        </div>
        <button
          type="button"
          onClick={copy}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--text)]"
          title={copied ? 'Copied' : 'Copy'}
        >
          {copied ? <Checkmark20Regular /> : <Copy20Regular />}
        </button>
      </div>
    </div>
  );
}

function AdminHistorySection({ recordId }: { recordId: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<AuditEventDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || events !== null) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await api.listAudit({ recordId });
        if (!cancelled) setEvents(data.events);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, events, recordId]);

  return (
    <div className="pt-4 mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <History20Regular className="text-[var(--text-muted)]" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold">Record history</div>
          <div className="text-[11px] text-[var(--text-muted)]">Admin only · all state transitions</div>
        </div>
        {expanded ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
      </button>
      {expanded && (
        <div className="mt-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-3">
              <Spinner size="tiny" /> Loading...
            </div>
          ) : events && events.length > 0 ? (
            <ol className="list-none m-0 p-0 space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-2 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] ks-mono font-semibold">{e.action}</span>
                      <span className="text-[11px] text-[var(--text-subtle)]">
                        {new Date(e.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      <TeamsUserPill user={e.actor} size={16} mutedName />
                    </div>
                    {e.detail && (
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{e.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-sm text-[var(--text-muted)] py-3">No events yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

function envLabel(env: string): string {
  return env.charAt(0) + env.slice(1).toLowerCase();
}

const ALL_RECORD_STATUSES: RecordStatus[] = [
  'AVAILABLE',
  'PENDING_APPROVAL',
  'LEASED',
  'RENEWAL_PENDING',
  'EXPIRED',
  'LOCKED',
];

/**
 * Admin-only inline editor for a record. Lets an admin reassign owner, force
 * a status (e.g. take a record out of circulation by setting LOCKED), and
 * toggle borrower visibility. Persists via PATCH /api/records/:id.
 */
function AdminEditPanel({
  record,
  onSaved,
  onCancel,
}: {
  record: RecordDTO;
  onSaved: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [ownerId, setOwnerId] = useState(record.ownerId);
  const [status, setStatus] = useState<RecordStatus>(record.status);
  const [hideBorrower, setHideBorrower] = useState<boolean>(!!record.hideBorrower);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { users: list } = await api.listUsers();
        if (!cancelled) setUsers(list);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset local state if the record changes underneath us.
  useEffect(() => {
    setOwnerId(record.ownerId);
    setStatus(record.status);
    setHideBorrower(!!record.hideBorrower);
  }, [record.id, record.ownerId, record.status, record.hideBorrower]);

  const dirty =
    ownerId !== record.ownerId
    || status !== record.status
    || hideBorrower !== !!record.hideBorrower;

  async function handleSave(): Promise<void> {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const patch: { ownerId?: string; status?: RecordStatus; hideBorrower?: boolean } = {};
      if (ownerId !== record.ownerId) patch.ownerId = ownerId;
      if (status !== record.status) patch.status = status;
      if (hideBorrower !== !!record.hideBorrower) patch.hideBorrower = hideBorrower;
      await api.updateRecord(record.id, patch);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const ownerLabel = users.find((u) => u.id === ownerId)?.displayName ?? '—';

  return (
    <div className="rounded-md p-3 space-y-3" style={{ background: 'var(--surface-hover)' }}>
      <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)] font-bold">
        Edit record · admin
      </div>

      <FluentField label="Owner" size="small">
        <Dropdown
          value={ownerLabel}
          selectedOptions={[ownerId]}
          onOptionSelect={(_e, d) => d.optionValue && setOwnerId(d.optionValue)}
        >
          {users.map((u) => (
            <Option key={u.id} value={u.id} text={u.displayName}>
              {u.displayName} <span className="text-[11px] text-[var(--text-muted)]">{u.email}</span>
            </Option>
          ))}
        </Dropdown>
      </FluentField>

      <FluentField label="Status" size="small">
        <Dropdown
          value={statusLabel(status)}
          selectedOptions={[status]}
          onOptionSelect={(_e, d) => d.optionValue && setStatus(d.optionValue as RecordStatus)}
        >
          {ALL_RECORD_STATUSES.map((s) => (
            <Option key={s} value={s} text={statusLabel(s)}>
              {statusLabel(s)} <span className="text-[11px] text-[var(--text-muted)]">({s})</span>
            </Option>
          ))}
        </Dropdown>
      </FluentField>

      <label className="flex items-start gap-2 text-[12px] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={hideBorrower}
          onChange={(e) => setHideBorrower(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-semibold">Hide borrower from non-admin users</span>
          <span className="block text-[11px] text-[var(--text-muted)]">
            Disables the Borrower field and the Message button for everyone except admins.
          </span>
        </span>
      </label>

      {error && <div className="text-xs text-red-500">{error}</div>}

      <div className="flex items-center gap-2 pt-1">
        <Button appearance="subtle" size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
        <div className="flex-1" />
        <Button
          appearance="primary"
          size="small"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? <Spinner size="tiny" /> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
