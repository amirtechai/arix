import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// ── FeatureFlagManager (W9) ───────────────────────────────────────────────────

export interface FeatureFlags {
  [flag: string]: boolean
}

export class FeatureFlagManager {
  private flags: FeatureFlags = {}

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      this.flags = JSON.parse(raw) as FeatureFlags
    } catch { /* ignore parse errors */ }
  }

  async save(): Promise<void> {
    await mkdir(join(this.filePath, '..'), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(this.flags, null, 2), 'utf-8')
  }

  enable(flag: string): void { this.flags[flag] = true }
  disable(flag: string): void { this.flags[flag] = false }
  isEnabled(flag: string): boolean { return this.flags[flag] === true }

  list(): Array<{ flag: string; enabled: boolean }> {
    return Object.entries(this.flags).map(([flag, enabled]) => ({ flag, enabled }))
  }
}
