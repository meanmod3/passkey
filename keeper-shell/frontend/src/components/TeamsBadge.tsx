/**
 * Small pill conveying "this flows through Microsoft Teams adaptive cards".
 * Used on the Request Access modal, drawer footer, and approvals copy to make
 * explicit that every request / approval / renewal traverses Teams — not this UI.
 */
export function TeamsBadge({ label = 'via Microsoft Teams' }: { label?: string }): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: 'var(--teams-purple-soft)', color: 'var(--teams-purple)' }}
    >
      <TeamsGlyph />
      {label}
    </span>
  );
}

function TeamsGlyph(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M21 10.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM3 9h12v3h-4.5v10H8V12H3V9Zm19 3.5h8c.5 0 1 .5 1 1V22c0 2.8-2.2 5-5 5h-1.3c-.3 1.7-1.8 3-3.7 3h-4c-2.2 0-4-1.8-4-4v-5c0-.5.5-1 1-1H21c.5 0 1 .5 1 1v4.5h2.5c1.4 0 2.5-1.1 2.5-2.5v-6H22v-1.5Z" />
    </svg>
  );
}
