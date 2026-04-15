import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseResizableWidthOptions {
  /** localStorage key for persistence across reloads. */
  storageKey: string;
  /** Initial/default width in pixels (when nothing is persisted). */
  defaultWidth: number;
  /** Minimum allowed width in pixels. */
  minWidth: number;
  /** Maximum allowed width in pixels. */
  maxWidth: number;
  /**
   * Which edge of the resizable element the drag handle lives on.
   * - 'right' — handle on the right edge. Dragging right grows the element
   *   (used for a LEFT sidebar — grow = push to the right).
   * - 'left'  — handle on the left edge. Dragging left grows the element
   *   (used for a RIGHT panel — grow = expand leftward).
   */
  edge: 'left' | 'right';
  /** Keyboard step in pixels for ArrowLeft/ArrowRight. Default 16. */
  keyboardStep?: number;
}

/**
 * Drag-to-resize width hook. Returns the current width, a pointer handler to
 * start a drag, and a keyboard handler to nudge width via arrow keys.
 *
 * Width is persisted to localStorage under `storageKey` and clamped to
 * [minWidth, maxWidth]. A corrupt / out-of-range persisted value falls back
 * to `defaultWidth`.
 *
 * Drag state is tracked on the window, so the drag continues smoothly even
 * if the cursor leaves the handle element (classic gutter-drag pattern).
 * During drag: body cursor = col-resize, body user-select = none, so text
 * selection doesn't interfere and the cursor is consistent everywhere.
 */
export function useResizableWidth({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  edge,
  keyboardStep = 16,
}: UseResizableWidthOptions): {
  width: number;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  setWidth: (w: number) => void;
  isDragging: boolean;
} {
  const [width, setWidthState] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= minWidth && n <= maxWidth) return n;
      }
    } catch {
      /* ignore — fall through to default */
    }
    return defaultWidth;
  });

  const [isDragging, setIsDragging] = useState(false);

  const clamp = useCallback(
    (n: number): number => Math.max(minWidth, Math.min(maxWidth, n)),
    [minWidth, maxWidth],
  );

  const setWidth = useCallback(
    (next: number) => setWidthState(clamp(Math.round(next))),
    [clamp],
  );

  // Persist width whenever it settles.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(width));
    } catch {
      /* private mode / quota errors — silently skip */
    }
  }, [storageKey, width]);

  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>): void => {
      // Only primary button.
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMove = (ev: PointerEvent): void => {
        if (!dragStateRef.current) return;
        const dx = ev.clientX - dragStateRef.current.startX;
        // edge='right' (handle on right of LEFT sidebar): drag right → width grows
        // edge='left'  (handle on left of RIGHT panel):  drag left  → width grows
        const delta = edge === 'right' ? dx : -dx;
        setWidthState(clamp(dragStateRef.current.startWidth + delta));
      };

      const handleUp = (): void => {
        dragStateRef.current = null;
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [width, edge, clamp],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): void => {
      // Arrow keys nudge width. Home/End jump to min/max.
      // For edge='right' (left sidebar): ArrowRight grows, ArrowLeft shrinks.
      // For edge='left'  (right panel): ArrowLeft grows, ArrowRight shrinks.
      let handled = true;
      if (e.key === 'ArrowRight') {
        setWidthState((w) => clamp(w + (edge === 'right' ? keyboardStep : -keyboardStep)));
      } else if (e.key === 'ArrowLeft') {
        setWidthState((w) => clamp(w + (edge === 'right' ? -keyboardStep : keyboardStep)));
      } else if (e.key === 'Home') {
        setWidthState(minWidth);
      } else if (e.key === 'End') {
        setWidthState(maxWidth);
      } else {
        handled = false;
      }
      if (handled) e.preventDefault();
    },
    [edge, keyboardStep, clamp, minWidth, maxWidth],
  );

  return { width, onPointerDown, onKeyDown, setWidth, isDragging };
}
