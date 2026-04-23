import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { chromeLocalStorage } from '@/lib/chrome-storage';

/** Per-work-item-type pin state. `added` holds user-chosen field refs that aren't
 *  in the default set; `hidden` holds default refs the user has explicitly unpinned.
 *  Effective pins = (defaults ∪ added) \ hidden — computed in the selector below. */
interface PinEntry {
  added: string[];
  hidden: string[];
}

interface PinnedFieldsState {
  byType: Record<string, PinEntry>;
  pin: (wiType: string, ref: string) => void;
  unpin: (wiType: string, ref: string) => void;
}

function getEntry(state: PinnedFieldsState, wiType: string): PinEntry {
  return state.byType[wiType] ?? { added: [], hidden: [] };
}

export const usePinnedFields = create<PinnedFieldsState>()(
  persist(
    (set) => ({
      byType: {},
      pin: (wiType, ref) =>
        set((state) => {
          const cur = getEntry(state, wiType);
          const added = cur.added.includes(ref) ? cur.added : [...cur.added, ref];
          const hidden = cur.hidden.filter((r) => r !== ref);
          return {
            byType: { ...state.byType, [wiType]: { added, hidden } },
          };
        }),
      unpin: (wiType, ref) =>
        set((state) => {
          const cur = getEntry(state, wiType);
          const added = cur.added.filter((r) => r !== ref);
          const hidden = cur.hidden.includes(ref) ? cur.hidden : [...cur.hidden, ref];
          return {
            byType: { ...state.byType, [wiType]: { added, hidden } },
          };
        }),
    }),
    {
      name: 'jirafied-pinned-fields',
      storage: createJSONStorage(() => chromeLocalStorage),
    },
  ),
);

/** Compute the effective pinned set from the defaults + user overlay. Returns a
 *  Set for O(1) membership checks in the render. Call from within a component
 *  that has already subscribed to usePinnedFields — pure utility, no hooks. */
export function effectivePins(
  wiType: string,
  defaults: string[],
  entry: PinEntry | undefined,
): Set<string> {
  const out = new Set<string>(defaults);
  if (entry) {
    for (const r of entry.added) out.add(r);
    for (const r of entry.hidden) out.delete(r);
  }
  // Prevent null-fallthrough; `wiType` is used only to document intent here.
  void wiType;
  return out;
}
