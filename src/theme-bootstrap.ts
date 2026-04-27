// Pre-paint theme applier. Loaded as a separate <script src> in <head> before
// the main module bundle so the data-theme attribute is set on <html> before
// any CSS resolves. MV3's default extension-page CSP blocks inline scripts, so
// this has to live in its own file.
//
// Reads from localStorage to stay synchronous. The Zustand persist key is
// `giraffied-theme` and stores `{ state: { theme: 'classic'|'dark'|'light' }, version: 0 }`.
// Falls back to 'classic' (today's near-black look) if anything goes wrong, so
// new users — and anyone whose storage is wiped — see the original aesthetic.

(() => {
  try {
    const raw = localStorage.getItem('giraffied-theme');
    let theme = 'classic';
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: string } };
      const t = parsed?.state?.theme;
      if (t === 'classic' || t === 'dark' || t === 'light') theme = t;
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  } catch {
    document.documentElement.dataset.theme = 'classic';
    document.documentElement.style.colorScheme = 'dark';
  }
})();
