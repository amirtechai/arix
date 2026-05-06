import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@arix/core': resolve(__dirname, '../core/src/index.ts'),
      '@arix/providers': resolve(__dirname, '../providers/src/index.ts'),
      '@arix/tools': resolve(__dirname, '../tools/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/index.ts'],
      // Thresholds reflect current baseline; raise as more commands get tested
      thresholds: { lines: 8, functions: 15, branches: 28, statements: 8 },
    },
  },
})
