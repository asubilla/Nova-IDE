import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'tests'],
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
    },
    testTimeout: 30000,
    hookTimeout: 10000,
  },
});
