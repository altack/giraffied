/**
 * Test environment setup. Stubs the `chrome` global with an in-memory
 * `chrome.storage.local` so Zustand stores backed by `chromeLocalStorage`
 * can be exercised in node tests without a real extension host.
 *
 * The stub is deliberately minimal — only the methods our adapter uses
 * (get / set / remove). Tests that need to inspect or seed storage can do
 * so via `globalThis.chrome.storage.local` directly.
 */
import { beforeEach, vi } from 'vitest';

interface StorageRecord {
  [key: string]: unknown;
}

function createLocalStorageStub() {
  let store: StorageRecord = {};
  return {
    _reset() {
      store = {};
    },
    _seed(values: StorageRecord) {
      store = { ...store, ...values };
    },
    _snapshot(): StorageRecord {
      return { ...store };
    },
    get: vi.fn(async (keys?: string | string[] | StorageRecord) => {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out: StorageRecord = {};
        for (const k of keys) if (k in store) out[k] = store[k];
        return out;
      }
      const out: StorageRecord = { ...keys };
      for (const k of Object.keys(keys)) if (k in store) out[k] = store[k];
      return out;
    }),
    set: vi.fn(async (values: StorageRecord) => {
      Object.assign(store, values);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete store[k];
    }),
    clear: vi.fn(async () => {
      store = {};
    }),
  };
}

const localStub = createLocalStorageStub();

// Cast: matches the subset of chrome.storage.local our adapter calls. Tests
// that need richer Chrome APIs can extend this stub on demand.
(globalThis as unknown as { chrome: { storage: { local: unknown } } }).chrome = {
  storage: { local: localStub },
};

beforeEach(() => {
  localStub._reset();
});

export { localStub as chromeLocalStub };
