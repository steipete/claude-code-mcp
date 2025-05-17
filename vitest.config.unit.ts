import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    exclude: [
      'node_modules/**',
      'src/__tests__/e2e.test.ts',
      'src/__tests__/edge-cases.test.ts',
    ],
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
  },
});