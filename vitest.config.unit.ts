import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setupTests.ts'],
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
      'dist/**',
      'src/__tests__/e2e.test.ts',
      'src/__tests__/edge-cases.test.ts',
    ],
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    // Additional configuration for module resolution
    pool: 'forks', // Use forks to ensure clean module state
    poolOptions: {
      forks: {
        isolate: true, // Isolate test files from each other
      }
    },
  },
  resolve: {
    alias: {
      // This ensures that .js extensions in imports work correctly
      '@': resolve(__dirname, './src'),
    },
  },
});