import { useCallback, useEffect, useState } from 'react';
import { Body1, Button, Spinner, Title2 } from '@fluentui/react-components';
import { ArrowClockwise24Regular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';
import type { NotificationDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';

export function NotificationsPage(): JSX.Element {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { notifications } = await api.listNotifications();
        if (!cancelled) setItems(notifications);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Auto-poll every 15s.
  useEffect(() => {
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);

  async function handleClick(n: NotificationDTO): Promise<void> {
    try { await api.markNotificationRead(n.id); } catch { /* ignore */ }
    if (n.kind === 'APPROVAL_REQUEST') navigate('/approvals');
    else navigate('/my-requests');
    reload();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto h-full overflow-auto">
      <header className="flex items-end justify-between mb-4">
        <div>
          <Title2 as="h1" className="block">Notifications</Title2>
          <Body1 className="block text-[var(--text-muted)] mt-1">
            {items.length} total · {items.filter((i) => !i.read).length} unread
          </Body1>
        </div>
        <Button appearance="subtle" icon={<ArrowClockwise24Regular />} onClick={reload}>Refresh</Button>
      </header>

      {error && <div className="mb-4 p-3 bg-red-50 text-sm text-red-800 rounded">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-3 py-12 justify-center text-[var(--text-muted)]">
          <Spinner size="small" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-[var(--text-muted)] text-sm">No notifications yet.</div>
      ) : (
        <ul className="list-none m-0 p-0">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleClick(n)}
                className={`w-full text-left p-4 rounded-md hover:bg-[var(--surface-hover)] transition-colors ${n.read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <KindDot kind={n.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{n.title}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">{n.body}</div>
                    <div className="text-[11px] text-[var(--text-subtle)] mt-1">
                      {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KindDot({ kind }: { kind: NotificationDTO['kind'] }): JSX.Element {
  const color =
    kind === 'APPROVAL_REQUEST' ? 'var(--status-busy)'
    : kind === 'SHARE_LINK' ? 'var(--status-available)'
    : kind === 'RENEWAL_PROMPT' ? 'var(--status-warning)'
    : 'var(--status-offline)';
  return (
    <span
      className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: color }}
    />
  );
}
