import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins string class names with spaces', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values', () => {
    expect(cn('a', null, undefined, false, '', 'b')).toBe('a b');
  });

  it('flattens arrays and objects via clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });

  it('lets later Tailwind utility classes win on conflict via tailwind-merge', () => {
    // padding conflict — last one wins
    expect(cn('p-2', 'p-4')).toBe('p-4');
    // mixed: keep non-conflicting + drop earlier conflicting
    expect(cn('text-sm', 'p-2', 'text-lg')).toBe('p-2 text-lg');
  });
});
