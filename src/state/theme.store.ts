import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'classic' | 'dark' | 'light';

export const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: 'classic', label: 'Classic', description: 'Near-black, high contrast' },
  { id: 'dark', label: 'Dark', description: 'Softer dark, lower contrast' },
  { id: 'light', label: 'Light', description: 'Clean white surface' },
];

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const STORAGE_KEY = 'giraffied-theme';

// localStorage (not chrome.storage) so the inline-blocked / pre-paint bootstrap
// in `theme-bootstrap.ts` can read synchronously and apply the data-theme
// attribute before first paint. Theme is a UI preference, not credentials —
// no need for chrome.storage.local here.
export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'classic',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);

export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}
