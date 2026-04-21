import type { StateStorage } from 'zustand/middleware';

export const chromeLocalStorage: StateStorage = {
  getItem: async (name) => {
    const result = await chrome.storage.local.get(name);
    const value = result[name];
    return typeof value === 'string' ? value : null;
  },
  setItem: async (name, value) => {
    await chrome.storage.local.set({ [name]: value });
  },
  removeItem: async (name) => {
    await chrome.storage.local.remove(name);
  },
};
