import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardTaskListLtr24Regular,
  CheckmarkCircle24Regular,
  History24Regular,
  Alert24Regular,
  Settings24Regular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../stores/auth.store';
import { useRightPanel } from '../stores/rightPanel.store';
import { api } from '../services/api';
import { useMyActiveLease } from '../hooks/useMyActiveLease';
import { ActiveLeaseWidget, ActiveLeaseEmptyWidget } from './ActiveLeaseWidget';
import { PasskeyBrandIcon } from './PasskeyBrandIcon';

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

  if (!user) return <>{children}</>;

  // Sidebar actions: My Requests + Notifications + Approvals all open in the
  // right panel. Audit + Terminal are still separate routes (different layouts).
  const nav: NavItem[] = [
    {
      label: 'My Requests',
      icon: <ClipboardTaskListLtr24Regular />,
      onClick: () => { navigate('/'); showMyRequests(); },
    },
    {
      label: 'Notifications',
      icon: <Alert24Regular />,
      onClick: () => { navigate('/'); showNotifications(); },
      badge: unread,
    },
    {
      label: 'Approvals',
      icon: <CheckmarkCircle24Regular />,
      onClick: () => { navigate('/'); showApprovals(); },
      requiresRole: ['APPROVER', 'ADMIN'],
    },
    {
      label: 'Audit Log',
      icon: <History24Regular />,
      onClick: () => navigate('/audit'),
      requiresRole: ['ADMIN'],
    },
    {
      label: 'Terminal',
      icon: <PasskeyBrandIcon className="w-6 h-6" iconSize={18} />,
      onClick: () => navigate('/terminal'),
      requiresRole: ['ADMIN'],
    },
    {
      label: 'Settings',
      icon: <Settings24Regular />,
      onClick: () => navigate('/settings'),
      requiresRole: ['ADMIN'],
    },
  ];

  return (
    <div className="flex h-full bg-[var(--surface)] text-[var(--text)]">
      <aside className="w-52 shrink-0 bg-[var(--surface-elevated)] flex flex-col">
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
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors no-underline"
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
