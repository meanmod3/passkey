import {
  Avatar,
  Popover,
  PopoverSurface,
  PopoverTrigger,
} from '@fluentui/react-components';
import type { UserDTO } from '@keeper-shell/shared';
import { teamsService } from '../services/teamsService';

interface Partial {
  id?: string;
  displayName?: string;
  email?: string;
  role?: string;
}

/**
 * Teams-style user pill: colored avatar with initials + display name.
 * Size controls the avatar pixel diameter; text sizing follows sensibly.
 *
 * Hover (or keyboard focus) opens a Teams-native persona card matching the
 * Fluent UI / Microsoft Teams contact popup pattern — larger avatar, display
 * name, quick action icons (chat, video, call, LinkedIn), and a Contact
 * section. Inside Teams the chat glyph deep-links via teamsService; outside
 * Teams it's rendered but non-functional (visual parity, not functional SDK).
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
    <Popover openOnHover mouseLeaveDelay={150} positioning="below-start" withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <span
          className="inline-flex items-center gap-2 min-w-0 cursor-default"
          tabIndex={0}
        >
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
      </PopoverTrigger>
      <PopoverSurface style={{ padding: 0, minWidth: 260, maxWidth: 320 }}>
        <TeamsPersonaCard user={user} name={name} />
      </PopoverSurface>
    </Popover>
  );
}

/**
 * Teams-native persona card layout. Mirrors the native Teams hover card:
 *
 *   ┌──────────────────────────────────┐
 *   │ ⬤  Display Name                  │
 *   │ 💬  📹  📞  in                   │
 *   ├──────────────────────────────────┤
 *   │ Contact                          │
 *   │ email@domain                     │
 *   └──────────────────────────────────┘
 */
function TeamsPersonaCard({
  user,
  name,
}: {
  user: UserDTO | Partial;
  name: string;
}): JSX.Element {
  const email = 'email' in user ? user.email : undefined;
  const role = 'role' in user ? user.role : undefined;
  const inTeams = teamsService.isInTeams();

  function openChat(e: React.MouseEvent): void {
    e.stopPropagation();
    if (!user.id || !inTeams) return;
    teamsService.openChatWithUser(user.id, name);
  }

  return (
    <div>
      {/* Header: avatar + name */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Avatar size={48} name={name} color="colorful" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold truncate">{name}</div>
          {role && (
            <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
              {role}
            </div>
          )}
        </div>
      </div>

      {/* Action row: chat / video / call / linkedin */}
      <div className="flex items-center gap-1 px-4 pb-3">
        <PersonaAction
          label="Chat"
          onClick={openChat}
          disabled={!inTeams || !user.id}
          glyph={<ChatGlyph />}
        />
        <PersonaAction
          label="Video call"
          disabled
          glyph={<VideoGlyph />}
        />
        <PersonaAction
          label="Audio call"
          disabled
          glyph={<PhoneGlyph />}
        />
        <PersonaAction
          label="LinkedIn"
          disabled
          glyph={<LinkedInGlyph />}
        />
      </div>

      {/* Contact section */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
          Contact
        </div>
        {email ? (
          <a
            href={`mailto:${email}`}
            className="text-[13px] text-[var(--accent)] hover:underline break-all"
          >
            {email}
          </a>
        ) : (
          <div className="text-[12px] text-[var(--text-muted)]">
            {name}'s contact details are hidden in Teams.
          </div>
        )}
      </div>
    </div>
  );
}

function PersonaAction({
  label,
  onClick,
  disabled,
  glyph,
}: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  glyph: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="
        w-8 h-8 rounded flex items-center justify-center
        text-[var(--text-muted)]
        hover:bg-[var(--surface-hover)] hover:text-[var(--text)]
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
        transition-colors
      "
    >
      {glyph}
    </button>
  );
}

/* Inline SVG glyphs — match the Teams native icon row in size (18px). */

function ChatGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v7A1.5 1.5 0 0 1 15.5 14H8.5l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5v-7Z" />
    </svg>
  );
}

function VideoGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="6" width="11" height="8" rx="1.5" />
      <path d="M13.5 9 17 7v6l-3.5-2" />
    </svg>
  );
}

function PhoneGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5c0-.8.7-1.5 1.5-1.5h1.8a1 1 0 0 1 1 .8l.6 2.4a1 1 0 0 1-.3 1L7.5 8.3a9 9 0 0 0 4.2 4.2l1.1-1.1a1 1 0 0 1 1-.3l2.4.6a1 1 0 0 1 .8 1v1.8c0 .8-.7 1.5-1.5 1.5C9.3 16 4 10.7 4 4.5Z" />
    </svg>
  );
}

function LinkedInGlyph(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5 7.5h2v7H5v-7Zm1-3a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM8.5 7.5h2v1h.03c.28-.5.96-1.03 1.97-1.03 2.1 0 2.5 1.3 2.5 3v4.53h-2V11c0-.9-.02-2-1.3-2s-1.5.94-1.5 1.93v3.57h-2v-7Z" />
    </svg>
  );
}
