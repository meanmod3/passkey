import { useCallback, useEffect, useState } from 'react';
import { Body1, Button, Spinner } from '@fluentui/react-components';
import { ArrowClockwise20Regular } from '@fluentui/react-icons';
import type { NotificationDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { useRightPanel } from '../stores/rightPanel.store';
import { PanelHeader } from './MyRequestsPanel';

export function NotificationsPanel(): JSX.Element {
  const close = useRightPanel((s) => s.close);
  const showRequest = useRightPanel((s) => s.showRequest);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  useEffect(() => {
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);

  async function handleClick(n: NotificationDTO): Promise<void> {
    try { await api.markNotificationRead(n.id); } catch { /* ignore */ }
    if (n.requestId) showRequest(n.requestId);
    reload();
  }

  return (
    <aside className="w-full bg-[var(--surface-elevated)] flex flex-col overflow-hidden">
      <PanelHeader
        title="Notifications"
        subtitle={`${items.length} total · ${items.filter((n) => !n.read).length} unread`}
        onClose={close}
      >
        <Button appearance="subtle" size="small" icon={<ArrowClockwise20Regular />} onClick={reload} />
      </PanelHeader>

      <div className="flex-1 overflow-auto px-3 py-2">
        {error && <div className="m-2 p-3 bg-red-50 text-sm text-red-800 rounded">{error}</div>}
        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 justify-center text-[var(--text-muted)] py-12">
            <Spinner size="small" /> Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-muted)] text-sm">Nothing yet.</div>
        ) : (
          <ul className="list-none m-0 p-0 space-y-1">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full text-left p-3 rounded-md hover:bg-[var(--surface-hover)] transition-colors ${n.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <KindDot kind={n.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold truncate">{n.title}</div>
                      <div className="text-[12px] text-[var(--text-muted)] truncate">{n.body}</div>
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
    </aside>
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
