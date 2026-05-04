import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Standalone config — intentionally does NOT extend vite.config.ts. The crxjs
// plugin in the build config requires a manifest and adds MV3-only behavior
// that isn't relevant for unit tests of pure modules. Keeping the test config
// lean (no plugins) means tests run in node without bundling the extension.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/test/**',
        'src/manifest.config.ts',
        'src/background/**',
        'src/app/**/*.tsx',
        'src/components/**/*.tsx',
      ],
    },
  },
});
