import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'dist/**'],
    setupFiles: ['./test/matchers.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
