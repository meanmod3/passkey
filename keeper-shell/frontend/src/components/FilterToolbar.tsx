import {
  Button,
  Menu,
  MenuButton,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from '@fluentui/react-components';
import { AddCircle20Regular, ChevronDown20Regular } from '@fluentui/react-icons';
import type { Environment, RecordStatus } from '@keeper-shell/shared';

export type EnvFilter = 'ALL' | Environment;
export type StatusFilter = 'ALL' | RecordStatus;

const ENV_OPTIONS: Array<{ value: EnvFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'SHARED', label: 'Shared' },
  { value: 'POD', label: 'Pod' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'WIKI', label: 'Wiki' },
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'LEASED', label: 'Leased' },
  { value: 'PENDING_APPROVAL', label: 'Pending approval' },
  { value: 'RENEWAL_PENDING', label: 'Renewal pending' },
  { value: 'LOCKED', label: 'Locked' },
];

export function FilterToolbar({
  env,
  onEnvChange,
  status,
  onStatusChange,
  onReset,
  onClose,
  anyActive,
}: {
  env: EnvFilter;
  onEnvChange: (v: EnvFilter) => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  onReset: () => void;
  onClose: () => void;
  anyActive: boolean;
}): JSX.Element {
  return (
    <div className="px-6 py-3 flex items-center gap-2 flex-wrap bg-[var(--surface)]">
      <FilterChip
        label="Record Types"
        active={env !== 'ALL'}
        badge={env !== 'ALL' ? ENV_OPTIONS.find((o) => o.value === env)?.label : undefined}
      >
        <MenuList>
          {ENV_OPTIONS.map((o) => (
            <MenuItemRadio
              key={o.value}
              name="env"
              value={o.value}
              checked={env === o.value}
              onClick={() => onEnvChange(o.value)}
            >
              {o.label}
            </MenuItemRadio>
          ))}
        </MenuList>
      </FilterChip>

      <StaticChip label="Date Modified" />
      <StaticChip label="Shared" />
      <StaticChip label="Two-Factor Codes" />
      <StaticChip label="Favorites" />

      <FilterChip
        label="More Filters"
        icon={<AddCircle20Regular />}
        active={status !== 'ALL'}
        badge={status !== 'ALL' ? STATUS_OPTIONS.find((o) => o.value === status)?.label : undefined}
      >
        <MenuList>
          {STATUS_OPTIONS.map((o) => (
            <MenuItemRadio
              key={o.value}
              name="status"
              value={o.value}
              checked={status === o.value}
              onClick={() => onStatusChange(o.value)}
            >
              {o.label}
            </MenuItemRadio>
          ))}
        </MenuList>
      </FilterChip>

      <button
        type="button"
        onClick={onReset}
        disabled={!anyActive}
        className={`ml-2 text-sm font-medium ${anyActive ? 'text-[var(--accent)] hover:underline' : 'text-[var(--text-subtle)] cursor-default'}`}
      >
        Reset All
      </button>

      <button
        type="button"
        onClick={onClose}
        className="text-sm font-medium text-[var(--accent)] hover:underline"
      >
        Close
      </button>
    </div>
  );
}

function FilterChip({
  label,
  icon,
  active,
  badge,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  badge?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <MenuButton
          appearance={active ? 'primary' : 'outline'}
          icon={icon}
          menuIcon={<ChevronDown20Regular />}
          className="!rounded-full"
        >
          <span className="inline-flex items-center gap-1.5">
            <span>{label}</span>
            {badge && (
              <span className="text-[11px] font-bold bg-white/20 rounded-full px-1.5 py-0.5">
                {badge}
              </span>
            )}
          </span>
        </MenuButton>
      </MenuTrigger>
      <MenuPopover>{children}</MenuPopover>
    </Menu>
  );
}

function StaticChip({ label }: { label: string }): JSX.Element {
  return (
    <Button
      appearance="outline"
      disabled
      className="!rounded-full !cursor-default"
    >
      {label}
    </Button>
  );
}
