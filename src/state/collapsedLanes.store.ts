import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { chromeLocalStorage } from '@/lib/chrome-storage';

/**
 * Persist which swimlanes are collapsed per (org, project, team, iteration).
 * Keyed so a collapse in sprint N doesn't affect sprint N+1.
 */
interface CollapsedLanesState {
  byContext: Record<string, string[]>;
  toggle: (contextKey: string, laneKey: string) => void;
  expandAll: (contextKey: string) => void;
}

export const useCollapsedLanes = create<CollapsedLanesState>()(
  persist(
    (set) => ({
      byContext: {},
      toggle: (contextKey, laneKey) =>
        set((state) => {
          const current = state.byContext[contextKey] ?? [];
          const next = current.includes(laneKey)
            ? current.filter((k) => k !== laneKey)
            : [...current, laneKey];
          return {
            byContext: { ...state.byContext, [contextKey]: next },
          };
        }),
      expandAll: (contextKey) =>
        set((state) => {
          if (!state.byContext[contextKey]) return state;
          const { [contextKey]: _, ...rest } = state.byContext;
          return { byContext: rest };
        }),
    }),
    {
      name: 'jirafied-collapsed-lanes',
      storage: createJSONStorage(() => chromeLocalStorage),
    },
  ),
);

export function laneContextKey(
  org: string | null,
  projectId: string | null,
  teamId: string | null,
  iterationId: string | null | undefined,
): string | null {
  if (!org || !projectId || !teamId || !iterationId) return null;
  return `${org}/${projectId}/${teamId}/${iterationId}`;
}
