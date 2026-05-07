import { defineConfig } from 'tsup'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  async onSuccess() {
    // Bundle the first-party skill markdown library alongside the JS output.
    const src = join(__dirname, 'src', 'skills', 'bundled')
    const dst = join(__dirname, 'dist', 'skills', 'bundled')
    if (existsSync(src)) {
      mkdirSync(dst, { recursive: true })
      cpSync(src, dst, { recursive: true })
    }
  },
})
