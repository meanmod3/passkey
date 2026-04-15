import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Body1,
  Button,
  Input,
  Title2,
} from '@fluentui/react-components';
import {
  Add20Regular,
  Delete20Regular,
  ArrowReset20Regular,
  Edit20Regular,
  Checkmark20Regular,
  ReOrderDotsVertical24Regular,
} from '@fluentui/react-icons';
import { StatusDot, statusLabel } from '../components/StatusDot';
import {
  useSettings,
  type StatusKey,
  type SettingsSnapshot,
} from '../stores/settings.store';
import { useTeamsTheme } from '../hooks/useTeamsTheme';

const STATUS_KEYS: StatusKey[] = [
  'AVAILABLE',
  'LEASED',
  'PENDING_APPROVAL',
  'RENEWAL_PENDING',
  'LOCKED',
  'EXPIRED',
  'DOWN',
];

export function SettingsPage(): JSX.Element {
  const saved = useSettings();
  const commit = useSettings((s) => s.commit);
  const theme = useTeamsTheme();

  // Draft state — local until Save is clicked.
  const [draft, setDraft] = useState<SettingsSnapshot>(() => snapshot(saved));

  // Re-snapshot if the store changes underneath (e.g., another tab edits localStorage).
  useEffect(() => { setDraft(snapshot(saved)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const dirty = useMemo(() => !sameSnapshot(draft, saved), [draft, saved]);

  function handleSave(): void {
    commit(draft);
  }
  function handleCancel(): void {
    setDraft(snapshot(saved));
  }
  function handleReset(): void {
    if (window.confirm('Reset all settings to defaults? This will discard your current saved settings.')) {
      saved.resetAll();
      // Pull the freshly-defaulted store into the draft.
      setTimeout(() => setDraft(snapshot(useSettings.getState())), 0);
    }
  }

  return (
    <div className="h-full overflow-auto bg-[var(--surface)] text-[var(--text)] flex flex-col">
      <div className="flex-1 px-8 py-6 max-w-4xl pb-24">
        <header className="flex items-end justify-between mb-6">
          <div>
            <Title2 as="h1" className="block">Settings</Title2>
            <Body1 className="block text-[var(--text-muted)] mt-1">
              Admin · global workspace settings
            </Body1>
          </div>
          <Button appearance="subtle" icon={<ArrowReset20Regular />} onClick={handleReset}>
            Reset to defaults
          </Button>
        </header>

        <div className="space-y-8">
          <Section title="Statuses" subtitle="Click the dot to recolor. Click the pencil to edit the title and subtitle.">
            <StatusesPanel
              draft={draft.statusOverrides}
              onChange={(next) => setDraft({ ...draft, statusOverrides: next })}
            />
          </Section>

          <Section title="Reason categories" subtitle="Drag rows to reorder — the order is reflected in the request form dropdown.">
            <ReorderableList
              items={draft.reasonCategories}
              onChange={(next) => setDraft({ ...draft, reasonCategories: next })}
              placeholder="Add a new reason..."
              emptyMessage="No reason categories. Add at least one."
            />
          </Section>

          <Section title="Lease duration presets" subtitle="Drag to reorder. The 8-hour policy cap still applies.">
            <DurationsPanel
              items={draft.durationMinutes}
              onChange={(next) => setDraft({ ...draft, durationMinutes: next })}
            />
          </Section>

          <Section title="Theme" subtitle="In production the theme follows Teams. Override here for testing.">
            <div className="rounded-md p-4 bg-[var(--surface-elevated)] flex items-center gap-3">
              <span className="text-sm text-[var(--text-muted)]">Current theme:</span>
              <span className="text-sm font-semibold">{theme}</span>
              <div className="flex-1" />
              <a className="text-sm text-[var(--accent)] hover:underline" href="?theme=light">Force light</a>
              <a className="text-sm text-[var(--accent)] hover:underline" href="?theme=dark">Force dark</a>
              <a className="text-sm text-[var(--accent)] hover:underline" href="?theme=highContrast">Force HC</a>
            </div>
          </Section>
        </div>
      </div>

      {/* Footer — only shown when there are unsaved changes */}
      {dirty && (
        <div
          className="sticky bottom-0 inset-x-0 px-8 py-3 flex items-center gap-3"
          style={{ background: 'var(--surface-elevated)', boxShadow: '0 -4px 12px rgba(0,0,0,0.15)' }}
        >
          <span className="text-[12px] text-[var(--text-muted)]">Unsaved changes — these settings are global.</span>
          <div className="flex-1" />
          <Button appearance="subtle" onClick={handleCancel}>Cancel</Button>
          <Button appearance="primary" onClick={handleSave}>Save changes</Button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────  Sections */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section>
      <h2 className="text-[15px] font-bold tracking-tight mb-1">{title}</h2>
      {subtitle && <p className="text-[12px] text-[var(--text-muted)] mb-3 max-w-2xl">{subtitle}</p>}
      {children}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────  Statuses */

function StatusesPanel({
  draft,
  onChange,
}: {
  draft: SettingsSnapshot['statusOverrides'];
  onChange: (next: SettingsSnapshot['statusOverrides']) => void;
}): JSX.Element {
  return (
    <div className="rounded-md bg-[var(--surface-elevated)] overflow-hidden">
      {STATUS_KEYS.map((key) => (
        <StatusRow
          key={key}
          statusKey={key}
          override={draft[key]}
          onPatch={(patch) => onChange({ ...draft, [key]: { ...draft[key], ...patch } })}
          onReset={() => {
            const next = { ...draft };
            delete next[key];
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function StatusRow({
  statusKey,
  override,
  onPatch,
  onReset,
}: {
  statusKey: StatusKey;
  override: { label?: string; description?: string; color?: string } | undefined;
  onPatch: (patch: { label?: string; description?: string; color?: string }) => void;
  onReset: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const colorRef = useRef<HTMLInputElement>(null);

  const customized = !!override?.label || !!override?.description || !!override?.color;
  const defaultLabel = statusLabel(statusKey);
  const label = override?.label ?? defaultLabel;
  const subtitle = override?.description ?? statusKey;

  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--surface-hover)] transition-colors">
      {/* Dot — clickable when editing to open color picker */}
      <button
        type="button"
        onClick={() => editing && colorRef.current?.click()}
        disabled={!editing}
        className={`relative shrink-0 ${editing ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
        title={editing ? 'Click to change color' : ''}
      >
        <StatusDotPreview status={statusKey} color={override?.color} size={16} />
        <input
          ref={colorRef}
          type="color"
          value={normalizeColor(override?.color ?? defaultColorFor(statusKey))}
          onChange={(e) => onPatch({ color: e.target.value })}
          className="absolute w-0 h-0 opacity-0 pointer-events-none"
          aria-label={`${statusKey} color`}
        />
      </button>

      {/* Title + subtitle — click to edit when editing */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <>
            <Input
              size="small"
              value={label}
              onChange={(_e, d) => onPatch({ label: d.value })}
              placeholder={defaultLabel}
              className="!w-full"
            />
            <Input
              size="small"
              value={subtitle}
              onChange={(_e, d) => onPatch({ description: d.value })}
              placeholder={statusKey}
              className="!w-full mt-1"
            />
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-[11px] ks-mono text-[var(--text-muted)]">{subtitle}</div>
          </>
        )}
      </div>

      {customized && !editing && (
        <Button size="small" appearance="subtle" icon={<ArrowReset20Regular />} onClick={onReset} title="Reset" />
      )}
      <Button
        size="small"
        appearance={editing ? 'primary' : 'subtle'}
        icon={editing ? <Checkmark20Regular /> : <Edit20Regular />}
        onClick={() => setEditing((v) => !v)}
        title={editing ? 'Done' : 'Edit'}
      />
    </div>
  );
}

/** Status dot that respects an inline color override (used in Settings draft mode). */
function StatusDotPreview({ status, color, size = 12 }: { status: StatusKey; color?: string; size?: number }): JSX.Element {
  if (!color) return <StatusDot status={status} size={size} />;
  return (
    <span
      className="shrink-0 inline-block rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────  Reorderable list (Reasons) */

function ReorderableList({
  items,
  onChange,
  placeholder,
  emptyMessage,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyMessage: string;
}): JSX.Element {
  const [draft, setDraft] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function move(from: number, to: number): void {
    if (from === to) return;
    const copy = [...items];
    const [m] = copy.splice(from, 1);
    copy.splice(to, 0, m);
    onChange(copy);
  }

  return (
    <div className="rounded-md bg-[var(--surface-elevated)] p-4">
      <ul className="list-none m-0 p-0 space-y-1 mb-3">
        {items.map((value, idx) => (
          <li
            key={value}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragEnter={() => setOverIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={() => {
              if (dragIdx !== null) move(dragIdx, idx);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
              overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? 'bg-[var(--accent-soft)]'
                : 'bg-[var(--surface-hover)]'
            } ${dragIdx === idx ? 'opacity-40' : ''}`}
          >
            <span className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Drag to reorder">
              <ReOrderDotsVertical24Regular style={{ width: 18, height: 18 }} />
            </span>
            <span className="text-sm flex-1">{value}</span>
            <Button
              size="small"
              appearance="subtle"
              icon={<Delete20Regular />}
              onClick={() => onChange(items.filter((x) => x !== value))}
              aria-label={`Remove ${value}`}
            />
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-[var(--text-muted)] py-2">{emptyMessage}</li>
        )}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          size="small"
          className="!flex-1 ks-search"
          placeholder={placeholder}
          value={draft}
          onChange={(_e, d) => setDraft(d.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim() && !items.includes(draft.trim())) {
              onChange([...items, draft.trim()]);
              setDraft('');
            }
          }}
        />
        <Button
          size="small"
          appearance="primary"
          icon={<Add20Regular />}
          disabled={!draft.trim() || items.includes(draft.trim())}
          onClick={() => {
            const trimmed = draft.trim();
            if (!trimmed || items.includes(trimmed)) return;
            onChange([...items, trimmed]);
            setDraft('');
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────  Durations */

function DurationsPanel({
  items,
  onChange,
}: {
  items: number[];
  onChange: (next: number[]) => void;
}): JSX.Element {
  const [draft, setDraft] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function move(from: number, to: number): void {
    if (from === to) return;
    const copy = [...items];
    const [m] = copy.splice(from, 1);
    copy.splice(to, 0, m);
    onChange(copy);
  }

  return (
    <div className="rounded-md bg-[var(--surface-elevated)] p-4">
      <ul className="list-none m-0 p-0 space-y-1 mb-3">
        {items.map((mins, idx) => (
          <li
            key={mins}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragEnter={() => setOverIdx(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) move(dragIdx, idx);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
              overIdx === idx && dragIdx !== null && dragIdx !== idx
                ? 'bg-[var(--accent-soft)]'
                : 'bg-[var(--surface-hover)]'
            } ${dragIdx === idx ? 'opacity-40' : ''}`}
          >
            <span className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text)]">
              <ReOrderDotsVertical24Regular style={{ width: 18, height: 18 }} />
            </span>
            <span className="text-sm flex-1 ks-mono">
              {mins >= 60 && mins % 60 === 0 ? `${mins / 60} hour${mins / 60 === 1 ? '' : 's'}` : `${mins} min`}
            </span>
            <Button
              size="small"
              appearance="subtle"
              icon={<Delete20Regular />}
              onClick={() => onChange(items.filter((x) => x !== mins))}
            />
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-[var(--text-muted)] py-2">No duration presets configured.</li>
        )}
      </ul>
      <div className="flex items-center gap-2 max-w-md">
        <Input
          size="small"
          type="number"
          className="!flex-1 ks-search"
          placeholder="Minutes (1-480)"
          min={1}
          max={480}
          value={draft}
          onChange={(_e, d) => setDraft(d.value)}
        />
        <Button
          size="small"
          appearance="primary"
          icon={<Add20Regular />}
          disabled={(() => { const n = Number(draft); return !Number.isFinite(n) || n <= 0 || items.includes(n); })()}
          onClick={() => {
            const n = Number(draft);
            if (Number.isFinite(n) && n > 0 && !items.includes(n)) {
              onChange([...items, n]);
              setDraft('');
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────  Helpers */

function snapshot(s: SettingsSnapshot): SettingsSnapshot {
  return {
    statusOverrides: JSON.parse(JSON.stringify(s.statusOverrides)),
    reasonCategories: [...s.reasonCategories],
    durationMinutes: [...s.durationMinutes],
  };
}

function sameSnapshot(a: SettingsSnapshot, b: SettingsSnapshot): boolean {
  return JSON.stringify(a.statusOverrides) === JSON.stringify(b.statusOverrides)
    && a.reasonCategories.length === b.reasonCategories.length
    && a.reasonCategories.every((v, i) => v === b.reasonCategories[i])
    && a.durationMinutes.length === b.durationMinutes.length
    && a.durationMinutes.every((v, i) => v === b.durationMinutes[i]);
}

function normalizeColor(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (c.startsWith('var(')) {
    const name = c.slice(4, -1).trim();
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  }
  return '#888888';
}

function defaultColorFor(key: StatusKey): string {
  const map: Record<string, string> = {
    AVAILABLE: 'var(--status-available)',
    LEASED: 'var(--status-dnd)',
    PENDING_APPROVAL: 'var(--status-warning)',
    RENEWAL_PENDING: 'var(--status-warning)',
    LOCKED: 'var(--status-offline)',
    EXPIRED: 'var(--status-offline)',
    DOWN: 'var(--status-busy)',
    PENDING: 'var(--status-warning)',
    APPROVED: 'var(--status-dnd)',
    DENIED: 'var(--status-offline)',
    RELEASED: 'var(--status-offline)',
  };
  return map[key] ?? 'var(--status-offline)';
}
