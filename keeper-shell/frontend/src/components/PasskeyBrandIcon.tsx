export function PasskeyBrandIcon({
  className = 'w-7 h-7',
  iconSize = 16,
}: {
  className?: string;
  iconSize?: number;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`${className} flex items-center justify-center text-current shrink-0`}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <rect x="9" y="3" width="6" height="3.6" rx="1" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M7.5 18 c1-2.4 2.8-3 4.5-3 s3.5 0.6 4.5 3" />
      </svg>
    </span>
  );
}
