import { useEffect, useState } from 'react';

export type TeamsTheme = 'light' | 'dark' | 'highContrast';

/**
 * When running inside Microsoft Teams, read the theme from the Teams JS SDK:
 *   microsoftTeams.app.initialize().then(() => microsoftTeams.app.getContext().then(ctx => ctx.app.theme));
 *   microsoftTeams.app.registerOnThemeChangeHandler(setTheme);
 *
 * In standalone dev we don't have the SDK yet, so we proxy Teams' theme via the
 * system `prefers-color-scheme` preference. This is wired to the same variable
 * the Teams SDK would set, so swapping in TeamsJS later is a one-line change.
 */
export function useTeamsTheme(): TeamsTheme {
  const [theme, setTheme] = useState<TeamsTheme>(() => read());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (): void => setTheme(read());
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return theme;
}

function read(): TeamsTheme {
  if (typeof window === 'undefined') return 'light';
  // Allow a manual override via ?theme=dark for quick testing.
  const override = new URLSearchParams(window.location.search).get('theme');
  if (override === 'dark' || override === 'light' || override === 'highContrast') return override;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
