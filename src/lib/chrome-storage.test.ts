import { describe, expect, it } from 'vitest';
import { chromeLocalStorage } from './chrome-storage';
import { chromeLocalStub } from '@/test/setup';

/** Thin coverage of the Zustand StateStorage adapter — the production stores
 *  rely on its semantics (null when absent, string round-trip). */
describe('chromeLocalStorage adapter', () => {
  it('returns null for unknown keys', async () => {
    expect(await chromeLocalStorage.getItem('missing')).toBeNull();
  });

  it('round-trips a string value through chrome.storage.local', async () => {
    await chromeLocalStorage.setItem('greeting', 'hi');
    expect(await chromeLocalStorage.getItem('greeting')).toBe('hi');
    expect(chromeLocalStub._snapshot()).toEqual({ greeting: 'hi' });
  });

  it('returns null when the stored value is not a string (defensive cast)', async () => {
    chromeLocalStub._seed({ weird: 42 });
    expect(await chromeLocalStorage.getItem('weird')).toBeNull();
  });

  it('removeItem deletes the key from chrome.storage.local', async () => {
    await chromeLocalStorage.setItem('to-delete', 'x');
    await chromeLocalStorage.removeItem('to-delete');
    expect(await chromeLocalStorage.getItem('to-delete')).toBeNull();
  });
});
