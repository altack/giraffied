import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { chromeLocalStorage } from '@/lib/chrome-storage';

export interface SettingsState {
  org: string | null;
  pat: string | null;
  projectId: string | null;
  projectName: string | null;
  teamId: string | null;
  teamName: string | null;
  setCredentials: (org: string, pat: string) => void;
  setProject: (id: string, name: string) => void;
  setTeam: (id: string, name: string) => void;
  setProjectAndTeam: (
    projectId: string,
    projectName: string,
    teamId: string,
    teamName: string,
  ) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      org: null,
      pat: null,
      projectId: null,
      projectName: null,
      teamId: null,
      teamName: null,
      setCredentials: (org, pat) => set({ org, pat }),
      setProject: (projectId, projectName) =>
        set({ projectId, projectName, teamId: null, teamName: null }),
      setTeam: (teamId, teamName) => set({ teamId, teamName }),
      setProjectAndTeam: (projectId, projectName, teamId, teamName) =>
        set({ projectId, projectName, teamId, teamName }),
      reset: () =>
        set({
          org: null,
          pat: null,
          projectId: null,
          projectName: null,
          teamId: null,
          teamName: null,
        }),
    }),
    {
      name: 'giraffied-settings',
      storage: createJSONStorage(() => chromeLocalStorage),
    },
  ),
);

export function isOnboarded(s: SettingsState): boolean {
  return !!(s.org && s.pat && s.projectId && s.teamId);
}

export function getOrgUrl(s: SettingsState): string | null {
  return s.org ? `https://dev.azure.com/${encodeURIComponent(s.org)}` : null;
}
