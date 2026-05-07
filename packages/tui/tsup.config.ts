import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
  external: ['react', 'ink', 'ink-text-input', '@arix-code/core'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
})
