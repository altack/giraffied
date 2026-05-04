import { beforeEach, describe, expect, it } from 'vitest';
import { laneContextKey, useCollapsedLanes } from './collapsedLanes.store';

const CTX = 'org/proj/team/iter';

function reset() {
  // No public reset action — clear directly via setState.
  useCollapsedLanes.setState({ byContext: {} });
}

describe('collapsedLanes.store', () => {
  beforeEach(reset);

  describe('toggle', () => {
    it('adds the lane key when not collapsed', () => {
      useCollapsedLanes.getState().toggle(CTX, 'lane-1');
      expect(useCollapsedLanes.getState().byContext[CTX]).toEqual(['lane-1']);
    });

    it('removes the lane key when already collapsed', () => {
      useCollapsedLanes.getState().toggle(CTX, 'lane-1');
      useCollapsedLanes.getState().toggle(CTX, 'lane-2');
      useCollapsedLanes.getState().toggle(CTX, 'lane-1');
      expect(useCollapsedLanes.getState().byContext[CTX]).toEqual(['lane-2']);
    });

    it('keeps separate state per context key (so sprints don’t bleed into each other)', () => {
      useCollapsedLanes.getState().toggle('ctx-A', 'lane-1');
      useCollapsedLanes.getState().toggle('ctx-B', 'lane-2');
      const s = useCollapsedLanes.getState().byContext;
      expect(s['ctx-A']).toEqual(['lane-1']);
      expect(s['ctx-B']).toEqual(['lane-2']);
    });
  });

  describe('expandAll', () => {
    it('removes the entry for the context entirely (cleans the bucket)', () => {
      useCollapsedLanes.getState().toggle(CTX, 'lane-1');
      useCollapsedLanes.getState().toggle(CTX, 'lane-2');
      useCollapsedLanes.getState().expandAll(CTX);
      expect(CTX in useCollapsedLanes.getState().byContext).toBe(false);
    });

    it('is a no-op when there is nothing collapsed for the context', () => {
      const before = useCollapsedLanes.getState();
      useCollapsedLanes.getState().expandAll(CTX);
      expect(useCollapsedLanes.getState()).toBe(before);
    });
  });

  describe('expandLanes', () => {
    it('removes only the specified keys', () => {
      useCollapsedLanes.getState().toggle(CTX, 'a');
      useCollapsedLanes.getState().toggle(CTX, 'b');
      useCollapsedLanes.getState().toggle(CTX, 'c');
      useCollapsedLanes.getState().expandLanes(CTX, ['a', 'c']);
      expect(useCollapsedLanes.getState().byContext[CTX]).toEqual(['b']);
    });

    it('cleans the bucket when the result would be empty', () => {
      useCollapsedLanes.getState().toggle(CTX, 'a');
      useCollapsedLanes.getState().expandLanes(CTX, ['a']);
      expect(CTX in useCollapsedLanes.getState().byContext).toBe(false);
    });

    it('returns the same state reference when no key in the list was collapsed', () => {
      useCollapsedLanes.getState().toggle(CTX, 'a');
      const before = useCollapsedLanes.getState();
      useCollapsedLanes.getState().expandLanes(CTX, ['z']);
      expect(useCollapsedLanes.getState()).toBe(before);
    });
  });

  describe('collapseAll', () => {
    it('replaces the bucket with the supplied lane list', () => {
      useCollapsedLanes.getState().toggle(CTX, 'a');
      useCollapsedLanes.getState().collapseAll(CTX, ['x', 'y', 'z']);
      expect(useCollapsedLanes.getState().byContext[CTX]).toEqual(['x', 'y', 'z']);
    });
  });
});

describe('laneContextKey', () => {
  it('returns null when any of org/projectId/teamId/iterationId is missing', () => {
    expect(laneContextKey(null, 'p', 't', 'i')).toBeNull();
    expect(laneContextKey('o', null, 't', 'i')).toBeNull();
    expect(laneContextKey('o', 'p', null, 'i')).toBeNull();
    expect(laneContextKey('o', 'p', 't', null)).toBeNull();
    expect(laneContextKey('o', 'p', 't', undefined)).toBeNull();
  });

  it('joins the four parts with "/"', () => {
    expect(laneContextKey('myorg', 'p1', 't1', 'iter-9')).toBe('myorg/p1/t1/iter-9');
  });
});
