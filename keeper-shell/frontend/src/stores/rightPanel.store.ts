import { create } from 'zustand';

export type RightPanelMode = 'empty' | 'record' | 'my-requests' | 'notifications' | 'request' | 'approvals';

interface RightPanelState {
  mode: RightPanelMode;
  recordId?: string;
  requestId?: string;
  showRecord: (recordId: string) => void;
  showMyRequests: () => void;
  showNotifications: () => void;
  showApprovals: () => void;
  showRequest: (requestId: string) => void;
  close: () => void;
}

/**
 * The right-side panel hosts every secondary surface in the app:
 *   - record detail (selected from the vault list)
 *   - my requests list (sidebar nav)
 *   - notifications list (sidebar nav)
 *   - approvals queue (sidebar nav, approver/admin)
 *   - single request detail (clicked from my-requests / notifications)
 *
 * The vault list on the left is always visible. Switching panel mode never
 * unmounts the vault — only the right panel content swaps.
 */
export const useRightPanel = create<RightPanelState>((set) => ({
  mode: 'empty',
  showRecord: (recordId) => set({ mode: 'record', recordId, requestId: undefined }),
  showMyRequests: () => set({ mode: 'my-requests', recordId: undefined, requestId: undefined }),
  showNotifications: () => set({ mode: 'notifications', recordId: undefined, requestId: undefined }),
  showApprovals: () => set({ mode: 'approvals', recordId: undefined, requestId: undefined }),
  showRequest: (requestId) => set({ mode: 'request', requestId, recordId: undefined }),
  close: () => set({ mode: 'empty', recordId: undefined, requestId: undefined }),
}));
