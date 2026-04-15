import type { TeamsContext } from '@keeper-shell/shared';
import { useAuthStore } from '../stores/auth.store';

/**
 * Teams composition seam.
 *
 * Production: imports `@microsoft/teams-js` and routes to real APIs (deep
 * links open Teams chat in the host, Stageview opens a side panel, context
 * comes from the SDK, theme handler is registered).
 *
 * Dev / standalone browser: this mock logs to the console and to an in-memory
 * event log that the UI can surface ("[Mock] Would open chat with Carol"),
 * so designers can see the flow without Teams running.
 *
 * `isInTeams()` is the gate: anywhere we render a Teams-only affordance, we
 * also render a sensible fallback in the standalone browser (a tooltip or
 * disabled button), so the UI degrades gracefully.
 */
export interface ITeamsService {
  isInTeams(): boolean;
  getContext(): TeamsContext | null;
  /** Open a 1:1 chat with the given user, optionally pre-filling a draft message */
  openChatWithUser(userId: string, displayName: string, draftMessage?: string): void;
  /** Open the Teams chat home (no specific user) */
  openChatHome(): void;
  /** Open a tab/page in Teams Stageview side panel (dual-surface) */
  openStageview(pageId: 'records' | 'approvals' | 'my-requests' | 'audit'): void;
  /** Surface a transient toast in the Teams shell (or browser console) */
  notify(title: string, message: string): void;
  /** Subscribe to Teams theme changes (returns unsubscribe) */
  onThemeChange(handler: (theme: 'light' | 'dark' | 'highContrast') => void): () => void;
}

const MOCK_TEAMS_FLAG = 'VITE_MOCK_TEAMS';

/* ────────────────────────────────────────────────────────────── Mock impl */

/**
 * Lightweight pub/sub so multiple components can render the recent action log
 * (e.g. a debug bar, or in our case a toast) without prop-drilling.
 */
type MockEvent = { ts: number; kind: 'chat' | 'stageview' | 'notify'; detail: string };
const listeners = new Set<(e: MockEvent) => void>();
const recent: MockEvent[] = [];

function emit(e: MockEvent): void {
  recent.unshift(e);
  if (recent.length > 50) recent.pop();
  listeners.forEach((l) => l(e));
}

export function subscribeToMockTeamsEvents(handler: (e: MockEvent) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}
export function getRecentMockTeamsEvents(): readonly MockEvent[] { return recent; }

class MockTeamsService implements ITeamsService {
  isInTeams(): boolean {
    // Treat the mock as always "in teams" so deep-link buttons render in dev.
    // Production swap will return !!microsoftTeams.app.
    return import.meta.env[MOCK_TEAMS_FLAG] !== 'false';
  }

  getContext(): TeamsContext | null {
    const u = useAuthStore.getState().user;
    if (!u) return null;
    return {
      userId: u.id,
      displayName: u.displayName,
      email: u.email,
      isInTeams: this.isInTeams(),
    };
  }

  openChatWithUser(userId: string, displayName: string, draftMessage?: string): void {
    const url = `https://teams.microsoft.com/l/chat/0/compose?users=${encodeURIComponent(userId)}&message=${encodeURIComponent(draftMessage ?? '')}`;
    const detail = draftMessage
      ? `→ ${displayName}: "${draftMessage}"`
      : `→ ${displayName}`;
    emit({ ts: Date.now(), kind: 'chat', detail });
    console.log(`[mock-teams] openChatWithUser ${detail}\n  ${url}`);
    // In Teams the SDK does this for us:
    //   await microsoftTeams.chat.openChat({ user: userId, message: draftMessage });
  }

  openChatHome(): void {
    const url = 'https://teams.microsoft.com/l/chat/';
    emit({ ts: Date.now(), kind: 'chat', detail: '→ Teams chat home' });
    console.log(`[mock-teams] openChatHome\n  ${url}`);
    // In Teams: microsoftTeams.app.openLink(url) or microsoftTeams.chat.openChat({});
  }

  openStageview(pageId: 'records' | 'approvals' | 'my-requests' | 'audit'): void {
    emit({ ts: Date.now(), kind: 'stageview', detail: `→ /${pageId}` });
    console.log(`[mock-teams] openStageview /${pageId}`);
    // In Teams:
    //   microsoftTeams.pages.appBar.navigateToTab({ pageId });
  }

  notify(title: string, message: string): void {
    emit({ ts: Date.now(), kind: 'notify', detail: `${title} — ${message}` });
    console.log(`[mock-teams] notify "${title}": ${message}`);
  }

  onThemeChange(handler: (theme: 'light' | 'dark' | 'highContrast') => void): () => void {
    // In Teams: microsoftTeams.app.registerOnThemeChangeHandler(handler);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (): void => handler(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }
}

export const teamsService: ITeamsService = new MockTeamsService();
