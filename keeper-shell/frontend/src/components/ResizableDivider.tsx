/**
 * Vertical gutter between two panes. Thin, unobtrusive at rest; the hit area
 * is wider than the visible line so the cursor doesn't need pixel precision
 * to grab it. Hover + active states tint the visible line to accent color.
 *
 * Accessibility:
 *   role="separator" + aria-orientation="vertical" announces the resizer.
 *   tabIndex=0 keeps it in tab order; keyboard handlers come from the hook.
 */
export function ResizableDivider({
  onPointerDown,
  onKeyDown,
  ariaLabel,
  ariaValueNow,
  ariaValueMin,
  ariaValueMax,
  isDragging = false,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  ariaLabel: string;
  ariaValueNow: number;
  ariaValueMin: number;
  ariaValueMax: number;
  isDragging?: boolean;
}): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={ariaValueNow}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`
        shrink-0 w-1.5 relative group cursor-col-resize
        outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset
        ${isDragging ? 'is-dragging' : ''}
      `}
      style={{ touchAction: 'none' }}
    >
      {/* Visible hairline, centered in the wider hit area. */}
      <div
        className={`
          absolute inset-y-0 left-1/2 -translate-x-1/2 w-px
          transition-colors duration-150
          ${isDragging
            ? 'bg-[var(--accent)] w-[2px]'
            : 'bg-[var(--border)] group-hover:bg-[var(--accent)]'}
        `}
      />
    </div>
  );
}
