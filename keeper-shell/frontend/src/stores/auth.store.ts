import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserDTO } from '@keeper-shell/shared';

interface AuthState {
  token: string | null;
  user: UserDTO | null;
  setAuth: (token: string, user: UserDTO) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    { name: 'keeper-shell-auth' },
  ),
);
