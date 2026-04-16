import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardTaskListLtr20Regular,
  CheckmarkCircle20Regular,
  History20Regular,
  Alert20Regular,
  Settings20Regular,
  DatabaseSearch20Regular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../stores/auth.store';
import { useRightPanel } from '../stores/rightPanel.store';
import { api } from '../services/api';
import { useMyActiveLease } from '../hooks/useMyActiveLease';
import { useResizableWidth } from '../hooks/useResizableWidth';
import { ActiveLeaseWidget, ActiveLeaseEmptyWidget } from './ActiveLeaseWidget';
import { PasskeyBrandIcon } from './PasskeyBrandIcon';
import { ResizableDivider } from './ResizableDivider';

// Sidebar resize bounds: 180 = nav label still readable, 360 = keeps the
// records center usable on a 1280px viewport. Default 208 = legacy w-52.
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 208;

type Role = 'REQUESTER' | 'APPROVER' | 'ADMIN';

interface NavItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  requiresRole?: Role[];
  badge?: number;
}

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const unread = useUnreadNotifications(user?.id);
  const { lease, reload: reloadLease } = useMyActiveLease();
  const { showMyRequests, showNotifications, showApprovals } = useRightPanel();
  const navigate = useNavigate();

  // Sidebar resize — width persisted under ks:sidebarWidth.
  const sidebar = useResizableWidth({
    storageKey: 'ks:sidebarWidth',
    defaultWidth: SIDEBAR_DEFAULT,
    minWidth: SIDEBAR_MIN,
    maxWidth: SIDEBAR_MAX,
    edge: 'right',
  });

  if (!user) return <>{children}</>;

  // Sidebar actions: My Requests + Notifications + Approvals all open in the
  // right panel. Audit + Terminal are still separate routes (different layouts).
  const nav: NavItem[] = [
    {
      label: 'My Requests',
      icon: <ClipboardTaskListLtr20Regular />,
      onClick: () => { navigate('/'); showMyRequests(); },
    },
    {
      label: 'Notifications',
      icon: <Alert20Regular />,
      onClick: () => { navigate('/'); showNotifications(); },
      badge: unread,
    },
    {
      label: 'Approvals',
      icon: <CheckmarkCircle20Regular />,
      onClick: () => { navigate('/'); showApprovals(); },
      requiresRole: ['APPROVER', 'ADMIN'],
    },
    {
      label: 'Audit Log',
      icon: <History20Regular />,
      onClick: () => navigate('/audit'),
      requiresRole: ['ADMIN'],
    },
    {
      label: 'Vault sync',
      icon: <DatabaseSearch20Regular />,
      onClick: () => navigate('/admin/vault-sync'),
      requiresRole: ['ADMIN'],
    },
    {
      label: 'Terminal',
      icon: <PasskeyBrandIcon className="w-5 h-5" iconSize={16} />,
      onClick: () => navigate('/terminal'),
      requiresRole: ['ADMIN'],
    },
    {
      label: 'Settings',
      icon: <Settings20Regular />,
      onClick: () => navigate('/settings'),
      requiresRole: ['ADMIN'],
    },
  ];

  return (
    <div className="flex h-full bg-[var(--surface)] text-[var(--text)]">
      <aside
        style={{ width: sidebar.width }}
        className="shrink-0 bg-[var(--surface-elevated)] flex flex-col"
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4">
          <span className="font-extrabold tracking-wide text-[14px]">PASSKEY</span>
        </div>

        {/* Nav — no Records (always shown), no Messages, no underlines */}
        <nav className="flex-1 py-3 overflow-auto flex flex-col gap-2">
          {nav.filter((n) => !n.requiresRole || n.requiresRole.includes(user.role)).map((n) => (
            <button
              key={n.label}
              type="button"
              onClick={n.onClick}
              className="w-full flex items-center gap-2.5 px-5 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors no-underline"
            >
              {n.icon}
              <span>{n.label}</span>
              {n.badge !== undefined && n.badge > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-600 text-white rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">
                  {n.badge > 9 ? '9+' : n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Active passkey widget - always pinned at bottom; shows empty state when no lease. */}
        {lease ? <ActiveLeaseWidget lease={lease} onReturned={reloadLease} /> : <ActiveLeaseEmptyWidget />}
      </aside>

      {/* Draggable gutter between sidebar and main content. */}
      <ResizableDivider
        ariaLabel="Resize sidebar"
        ariaValueNow={sidebar.width}
        ariaValueMin={SIDEBAR_MIN}
        ariaValueMax={SIDEBAR_MAX}
        isDragging={sidebar.isDragging}
        onPointerDown={sidebar.onPointerDown}
        onKeyDown={sidebar.onKeyDown}
      />

      <main className="flex-1 overflow-hidden bg-[var(--surface)] min-h-0">{children}</main>
    </div>
  );
}

function useUnreadNotifications(userId: string | undefined): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const { notifications } = await api.listNotifications();
        if (!cancelled) setCount(notifications.filter((n) => !n.read).length);
      } catch { /* ignore */ }
    }
    void load();
    const id = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [userId]);
  return count;
}
