import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude compiled tests in dist/ to avoid running CommonJS bundles in Vitest.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
});
