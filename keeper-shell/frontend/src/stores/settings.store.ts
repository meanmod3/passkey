import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RecordStatus, RequestStatus } from '@keeper-shell/shared';

export type StatusKey = RecordStatus | RequestStatus | 'DOWN';

/**
 * Per-status display override. The backend still owns the enum values; this
 * layer is purely cosmetic — admins can relabel and recolor existing statuses
 * so the surface vocabulary matches their organization's language.
 */
export interface StatusOverride {
  label?: string;
  description?: string;
  color?: string; // any CSS color
}

export const DEFAULT_REASON_CATEGORIES = ['Email', 'Imaging', 'Statements', 'ERP'] as const;
export const DEFAULT_DURATION_MINUTES = [15, 30, 60, 120, 240] as const;

export interface SettingsSnapshot {
  statusOverrides: Partial<Record<StatusKey, StatusOverride>>;
  reasonCategories: string[];
  durationMinutes: number[];
}

interface SettingsState extends SettingsSnapshot {
  setStatusLabel: (key: StatusKey, label: string) => void;
  setStatusColor: (key: StatusKey, color: string) => void;
  setStatusOverride: (key: StatusKey, patch: Partial<StatusOverride>) => void;
  resetStatus: (key: StatusKey) => void;

  addReason: (label: string) => void;
  removeReason: (label: string) => void;
  setReasons: (list: string[]) => void;

  addDuration: (mins: number) => void;
  removeDuration: (mins: number) => void;

  /** Commit a draft snapshot — used by SettingsPage's Save button. */
  commit: (next: SettingsSnapshot) => void;

  resetAll: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      statusOverrides: {},
      reasonCategories: [...DEFAULT_REASON_CATEGORIES],
      durationMinutes: [...DEFAULT_DURATION_MINUTES],

      setStatusLabel: (key, label) =>
        set((s) => ({
          statusOverrides: {
            ...s.statusOverrides,
            [key]: { ...s.statusOverrides[key], label },
          },
        })),
      setStatusColor: (key, color) =>
        set((s) => ({
          statusOverrides: {
            ...s.statusOverrides,
            [key]: { ...s.statusOverrides[key], color },
          },
        })),
      setStatusOverride: (key, patch) =>
        set((s) => ({
          statusOverrides: {
            ...s.statusOverrides,
            [key]: { ...s.statusOverrides[key], ...patch },
          },
        })),
      resetStatus: (key) =>
        set((s) => {
          const next = { ...s.statusOverrides };
          delete next[key];
          return { statusOverrides: next };
        }),

      addReason: (label) =>
        set((s) => {
          const trimmed = label.trim();
          if (!trimmed || s.reasonCategories.includes(trimmed)) return s;
          return { reasonCategories: [...s.reasonCategories, trimmed] };
        }),
      removeReason: (label) =>
        set((s) => ({ reasonCategories: s.reasonCategories.filter((r) => r !== label) })),
      setReasons: (list) => set({ reasonCategories: list }),

      addDuration: (mins) =>
        set((s) => {
          if (!Number.isFinite(mins) || mins <= 0 || s.durationMinutes.includes(mins)) return s;
          return { durationMinutes: [...s.durationMinutes, mins].sort((a, b) => a - b) };
        }),
      removeDuration: (mins) =>
        set((s) => ({ durationMinutes: s.durationMinutes.filter((d) => d !== mins) })),

      commit: (next) =>
        set({
          statusOverrides: next.statusOverrides,
          reasonCategories: next.reasonCategories,
          durationMinutes: next.durationMinutes,
        }),

      resetAll: () =>
        set({
          statusOverrides: {},
          reasonCategories: [...DEFAULT_REASON_CATEGORIES],
          durationMinutes: [...DEFAULT_DURATION_MINUTES],
        }),
    }),
    { name: 'keeper-shell-settings' },
  ),
);
