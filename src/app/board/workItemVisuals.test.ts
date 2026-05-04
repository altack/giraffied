import { describe, expect, it } from 'vitest';
import {
  avatarColor,
  contributorBarColor,
  initialsOf,
  laneHueRgb,
  parseTags,
  pointsFieldForType,
  readPoints,
  stateChipTone,
  workItemTypeStyle,
  writePointsFieldFor,
} from './workItemVisuals';

describe('initialsOf', () => {
  it('returns "?" for missing names', () => {
    expect(initialsOf(undefined)).toBe('?');
    expect(initialsOf('')).toBe('?');
  });

  it('returns first+last initial for multi-word names, uppercased', () => {
    expect(initialsOf('Jose Guzman')).toBe('JG');
    expect(initialsOf('jane mary doe')).toBe('JD');
  });

  it('returns first two letters for single-word names', () => {
    expect(initialsOf('Anthropic')).toBe('AN');
    expect(initialsOf('xy')).toBe('XY');
  });
});

describe('avatarColor', () => {
  it('is deterministic for the same input', () => {
    expect(avatarColor('Jose Guzman')).toEqual(avatarColor('Jose Guzman'));
  });

  it('returns the same palette entry across distinct calls', () => {
    const a = avatarColor('alice');
    const b = avatarColor('alice');
    expect(a.bg).toBe(b.bg);
    expect(a.fg).toBe(b.fg);
  });
});

describe('contributorBarColor', () => {
  it('uses the saturated palette for light theme', () => {
    // Light palette is the saturated 500-tier; dark palette is muted.
    const light = contributorBarColor('alice', 'light');
    const dark = contributorBarColor('alice', 'dark');
    expect(light).not.toBe(dark);
  });

  it('uses the muted palette for both classic and dark themes', () => {
    expect(contributorBarColor('alice', 'classic')).toBe(contributorBarColor('alice', 'dark'));
  });

  it('is deterministic for the same name+theme pair', () => {
    expect(contributorBarColor('bob', 'light')).toBe(contributorBarColor('bob', 'light'));
  });
});

describe('workItemTypeStyle', () => {
  it.each([
    ['Task', 'Task'],
    ['Bug', 'Bug'],
    ['Story', 'Story'],
    ['Product Backlog Item', 'PBI'],
    ['Issue', 'Issue'],
    ['Feature', 'Feature'],
    ['Epic', 'Epic'],
    ['Sprint Goal', 'Goal'],
  ])('maps %s to label %s and assigns a non-empty dot color', (type, label) => {
    const v = workItemTypeStyle(type);
    expect(v.label).toBe(label);
    expect(v.dot).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('falls back to the raw type string and a neutral zinc dot for unknown types', () => {
    expect(workItemTypeStyle('Saga')).toEqual({ label: 'Saga', dot: '#71717a' });
  });
});

describe('laneHueRgb', () => {
  it('maps known types to a space-separated RGB triplet', () => {
    expect(laneHueRgb('Task')).toBe('245 158 11');
    expect(laneHueRgb('Bug')).toBe('239 68 68');
  });

  it('treats Story and Product Backlog Item the same way', () => {
    expect(laneHueRgb('Story')).toBe(laneHueRgb('Product Backlog Item'));
  });

  it('returns the theme-aware fallback variable for unknown / undefined types', () => {
    expect(laneHueRgb(undefined)).toBe('var(--lane-hue-default)');
    expect(laneHueRgb('Mystery')).toBe('var(--lane-hue-default)');
  });
});

describe('stateChipTone', () => {
  it('matches case-insensitively (DONE, done, Done all map the same)', () => {
    expect(stateChipTone('Done')).toBe(stateChipTone('done'));
    expect(stateChipTone('DONE')).toBe(stateChipTone('done'));
  });

  it('maps Done/Closed/Completed to the emerald tone', () => {
    expect(stateChipTone('Done')).toContain('emerald');
    expect(stateChipTone('Closed')).toContain('emerald');
    expect(stateChipTone('Completed')).toContain('emerald');
  });

  it('falls back to neutral for unknown / custom states', () => {
    expect(stateChipTone('QA Verified')).toContain('--color-overlay-1');
  });
});

describe('parseTags', () => {
  it('returns an empty array for missing or empty tag strings', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
    expect(parseTags(';;')).toEqual([]);
  });

  it('splits on semicolons and trims whitespace', () => {
    expect(parseTags('a; b ;c')).toEqual(['a', 'b', 'c']);
  });
});

describe('pointsFieldForType', () => {
  it('uses Effort for Product Backlog Item and Bug (Scrum-template default)', () => {
    expect(pointsFieldForType('Product Backlog Item')).toBe('Microsoft.VSTS.Scheduling.Effort');
    expect(pointsFieldForType('Bug')).toBe('Microsoft.VSTS.Scheduling.Effort');
  });

  it('uses Size for Requirement (CMMI template)', () => {
    expect(pointsFieldForType('Requirement')).toBe('Microsoft.VSTS.Scheduling.Size');
  });

  it('defaults to StoryPoints for everything else', () => {
    expect(pointsFieldForType('User Story')).toBe('Microsoft.VSTS.Scheduling.StoryPoints');
    expect(pointsFieldForType('Task')).toBe('Microsoft.VSTS.Scheduling.StoryPoints');
    expect(pointsFieldForType('')).toBe('Microsoft.VSTS.Scheduling.StoryPoints');
  });
});

describe('readPoints', () => {
  it('reads the type-specific field first', () => {
    expect(
      readPoints({
        'System.WorkItemType': 'Task',
        'Microsoft.VSTS.Scheduling.StoryPoints': 5,
        'Microsoft.VSTS.Scheduling.Effort': 8,
      }),
    ).toBe(5);
  });

  it('falls back to the next populated field when the type-specific one is missing', () => {
    expect(
      readPoints({
        'System.WorkItemType': 'Task',
        'Microsoft.VSTS.Scheduling.Effort': 13,
      }),
    ).toBe(13);
  });

  it('returns undefined when no points field is populated', () => {
    expect(readPoints({ 'System.WorkItemType': 'Task' })).toBeUndefined();
  });

  it('handles missing System.WorkItemType (defaults to StoryPoints, then falls back)', () => {
    expect(
      readPoints({
        'Microsoft.VSTS.Scheduling.Size': 21,
      }),
    ).toBe(21);
  });
});

describe('writePointsFieldFor', () => {
  it('prefers the field currently populated on the item', () => {
    expect(
      writePointsFieldFor({
        'System.WorkItemType': 'User Story',
        'Microsoft.VSTS.Scheduling.Effort': 8,
      }),
    ).toBe('Microsoft.VSTS.Scheduling.Effort');
  });

  it('falls back to the type-based default when no points field is populated', () => {
    expect(
      writePointsFieldFor({ 'System.WorkItemType': 'Bug' }),
    ).toBe('Microsoft.VSTS.Scheduling.Effort');
    expect(
      writePointsFieldFor({ 'System.WorkItemType': 'Task' }),
    ).toBe('Microsoft.VSTS.Scheduling.StoryPoints');
  });
});
