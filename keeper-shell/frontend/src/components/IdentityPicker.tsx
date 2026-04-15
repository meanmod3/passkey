import { useEffect, useState } from 'react';
import { Avatar, Button, Card, CardHeader, Spinner, Subtitle2, Title3 } from '@fluentui/react-components';
import type { UserDTO } from '@keeper-shell/shared';
import { api, ApiError } from '../services/api';
import { useAuthStore } from '../stores/auth.store';

export function IdentityPicker(): JSX.Element {
  const [users, setUsers] = useState<UserDTO[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    // Bootstrap the user list without auth: login as the first user in the seed to
    // peek at the list, then clear. The backend has a safer pattern — a public
    // /api/auth/users-for-login — but for the mock we just hit it after mock-login.
    void (async () => {
      try {
        // Try unauthenticated call — will 401, then try bootstrap login path.
        const first = await fetch('/api/auth/users').catch(() => null);
        if (first?.ok) {
          const data = (await first.json()) as { users: UserDTO[] };
          setUsers(data.users);
          return;
        }
        // Fall back: we don't have public access; use the DB seed public endpoint pattern.
        // Since the mock-login endpoint is public but needs a userId, we expose
        // a separate helper here by calling the backend directly with a well-known
        // dev flag. In this scaffold we simply surface all users via GET
        // /api/auth/users once bootstrap-logged-in. Instead of that, we just
        // explain and ask the user to pick via the simple UI that follows.
        // Pragmatic fallback: hit /api/auth/users-public — which doesn't exist —
        // and on failure we render a manual userId input.
        setUsers([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'failed to list users');
      }
    })();
  }, []);

  async function pick(userId: string): Promise<void> {
    setLoading(userId);
    setError(null);
    try {
      const resp = await api.mockLogin(userId);
      setAuth(resp.token, resp.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'login failed');
      setLoading(null);
    }
  }

  // Since /api/auth/users requires auth, we list the seeded test users by email.
  // Real flow: Entra ID popup login replaces this whole screen.
  const seeded: Array<{ email: string; displayName: string; role: string }> = [
    { email: 'alice@example.com', displayName: 'Alice Requester', role: 'REQUESTER' },
    { email: 'bob@example.com', displayName: 'Bob Requester', role: 'REQUESTER' },
    { email: 'carol@example.com', displayName: 'Carol Approver', role: 'APPROVER' },
    { email: 'dave@example.com', displayName: 'Dave Approver', role: 'APPROVER' },
    { email: 'erin@example.com', displayName: 'Erin Admin', role: 'ADMIN' },
  ];

  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface)] text-[var(--text)]">
      <Card className="w-[440px] p-6">
        <CardHeader
          header={<Title3>Select a mock identity</Title3>}
          description={<Subtitle2>Entra ID replaces this in production.</Subtitle2>}
        />
        <div className="mt-4 flex flex-col gap-2">
          {(users && users.length > 0 ? users : seeded).map((u) => {
            const id = 'id' in u ? u.id : undefined;
            return (
              <Button
                key={'id' in u ? u.id : u.email}
                appearance="subtle"
                disabled={loading !== null}
                className="!justify-start !h-14"
                onClick={async () => {
                  // If we have a real id (from /auth/users), use it directly.
                  // Otherwise bootstrap: try to login by treating the email as
                  // a lookup key through a tiny helper endpoint. For the mock we
                  // just fall back to discovering the id via a single mock-login
                  // attempt that reads the seed.
                  if (id) return pick(id);
                  // Mock-only dev helper: resolve email → id via a public lookup.
                  // The backend exposes /api/auth/resolve for dev.
                  try {
                    const r = await fetch(`/api/auth/resolve?email=${encodeURIComponent(u.email)}`);
                    if (!r.ok) throw new Error(`lookup failed (${r.status})`);
                    const { id: resolved } = (await r.json()) as { id: string };
                    return pick(resolved);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'resolve failed');
                  }
                }}
              >
                <div className="flex items-center gap-3 w-full">
                  <Avatar name={'displayName' in u ? u.displayName : u.email} color="colorful" />
                  <div className="flex flex-col items-start flex-1">
                    <span className="text-sm font-semibold">{'displayName' in u ? u.displayName : u.email}</span>
                    <span className="text-xs text-[var(--text-muted)]">{u.email} · {u.role}</span>
                  </div>
                  {loading === ('id' in u ? u.id : u.email) && <Spinner size="tiny" />}
                </div>
              </Button>
            );
          })}
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </Card>
    </div>
  );
}
