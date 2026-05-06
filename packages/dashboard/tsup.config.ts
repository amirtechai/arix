import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['server/index.ts', 'server/run.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: false,
  target: 'node18',
})
