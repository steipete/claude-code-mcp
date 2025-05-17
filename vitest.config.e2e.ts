import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // Longer timeout for e2e tests
    hookTimeout: 20000,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/__tests__/utils/**',
      ],
    },
    include: ['src/__tests__/e2e.test.ts', 'src/__tests__/edge-cases.test.ts'],
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
  },
});