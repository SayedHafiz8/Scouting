import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/globalSetup.js',
    setupFiles: ['./tests/setup.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: 'forks',
    fileParallelism: false, // run files sequentially to avoid shared-DB conflicts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['controllers/**', 'middlewares/**', 'models/**', 'utils/**'],
    },
  },
});
