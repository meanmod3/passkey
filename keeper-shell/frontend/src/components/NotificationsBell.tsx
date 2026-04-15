import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Badge,
  Body1,
} from '@fluentui/react-components';
import { Alert24Regular } from '@fluentui/react-icons';
import type { NotificationDTO } from '@keeper-shell/shared';
import { api } from '../services/api';

const POLL_MS = 10_000;

export function NotificationsBell(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const navigate = useNavigate();

  async function reload(): Promise<void> {
    try {
      const { notifications } = await api.listNotifications();
      setItems(notifications);
    } catch {
      // Silent — bell shouldn't flash errors.
    }
  }

  useEffect(() => {
    void reload();
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  async function handleClick(n: NotificationDTO): Promise<void> {
    try {
      await api.markNotificationRead(n.id);
    } catch {
      // ignore — we'll refresh soon anyway
    }
    setOpen(false);
    if (n.kind === 'APPROVAL_REQUEST') navigate('/approvals');
    else if (n.kind === 'SHARE_LINK' || n.kind === 'RENEWAL_PROMPT' || n.kind === 'EXPIRY_NOTICE') navigate('/my-requests');
    void reload();
  }

  return (
    <Popover open={open} onOpenChange={(_e, d) => setOpen(d.open)} positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          icon={
            <span className="relative inline-flex">
              <Alert24Regular />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[10px] leading-[14px] text-center text-white bg-red-600 rounded-full">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
          }
          onClick={() => setOpen((o) => !o)}
        />
      </PopoverTrigger>
      <PopoverSurface className="!w-[360px] !max-h-[400px] !overflow-auto !p-0">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && <Badge appearance="filled" color="danger">{unread} new</Badge>}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center">
            <Body1 className="text-neutral-500">Nothing yet.</Body1>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-neutral-50 ${n.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <KindDot kind={n.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{n.title}</div>
                      <div className="text-xs text-neutral-600 line-clamp-2">{n.body}</div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverSurface>
    </Popover>
  );
}

function KindDot({ kind }: { kind: NotificationDTO['kind'] }): JSX.Element {
  const color =
    kind === 'APPROVAL_REQUEST' ? 'bg-amber-500'
    : kind === 'SHARE_LINK' ? 'bg-green-600'
    : kind === 'RENEWAL_PROMPT' ? 'bg-orange-500'
    : 'bg-neutral-500';
  return <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${color}`} />;
}
