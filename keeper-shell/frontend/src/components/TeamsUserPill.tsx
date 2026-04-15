import { Avatar } from '@fluentui/react-components';
import type { UserDTO } from '@keeper-shell/shared';

interface Partial {
  id?: string;
  displayName?: string;
  email?: string;
  role?: string;
}

/**
 * Teams-style user pill: colored avatar with initials + display name.
 * Size controls the avatar pixel diameter; text sizing follows sensibly.
 */
export function TeamsUserPill({
  user,
  size = 20,
  showName = true,
  mutedName = false,
}: {
  user: UserDTO | Partial | null | undefined;
  size?: 16 | 20 | 24 | 28 | 32;
  showName?: boolean;
  mutedName?: boolean;
}): JSX.Element {
  if (!user) {
    return <span className="text-xs text-[var(--text-subtle)]">—</span>;
  }
  const name = user.displayName ?? user.email ?? 'Unknown';
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar
        size={size}
        name={name}
        color="colorful"
        aria-label={name}
      />
      {showName && (
        <span className={`truncate text-sm ${mutedName ? 'text-[var(--text-muted)]' : ''}`}>
          {name}
        </span>
      )}
    </span>
  );
}
