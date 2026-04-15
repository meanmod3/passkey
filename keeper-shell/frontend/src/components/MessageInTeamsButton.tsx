import { Button } from '@fluentui/react-components';
import type { UserDTO } from '@keeper-shell/shared';
import { teamsService } from '../services/teamsService';

/**
 * Deep-link button that opens (or focuses) a 1:1 Teams chat with `user`,
 * pre-filling `draftMessage`. Renders only when `teamsService.isInTeams()` —
 * in a standalone browser this returns null so the UI doesn't dangle a
 * non-functional button.
 */
export function MessageInTeamsButton({
  user,
  draftMessage,
  label = 'Message in Teams',
  appearance = 'subtle',
}: {
  user: { id: string; displayName: string } | UserDTO | null | undefined;
  draftMessage?: string;
  label?: string;
  appearance?: 'subtle' | 'outline' | 'primary' | 'secondary';
}): JSX.Element | null {
  if (!user || !teamsService.isInTeams()) return null;
  return (
    <Button
      size="small"
      appearance={appearance}
      icon={<TeamsChatGlyph />}
      onClick={(e) => {
        e.stopPropagation();
        teamsService.openChatWithUser(user.id, user.displayName, draftMessage);
      }}
    >
      {label}
    </Button>
  );
}

function TeamsChatGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v6A1.5 1.5 0 0 1 12.5 12H6.5l-3 2.5V12H3.5A1.5 1.5 0 0 1 2 10.5v-6Z" />
    </svg>
  );
}
