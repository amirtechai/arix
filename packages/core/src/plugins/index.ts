/**
 * Plugin System — in-process registry AND disk-based dynamic loader.
 *
 * In-process: plugins register via PluginRegistry.register().
 * Disk-based: PluginLoader discovers ~/.arix/plugins/ at startup.
 *
 * Disk plugin structure:
 *   ~/.arix/plugins/my-tool/
 *     plugin.json    — { name, version, description }
 *     index.js       — default export: { tools: Tool[] }
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import type { Tool } from '../types.js'
import { logger } from '../logger/index.js'

// ── In-process registry ───────────────────────────────────────────────────

/** Minimal tool registry interface required by plugins */
export interface PluginToolRegistry {
  register(tool: Tool): void
}

/** A plugin extends Arix with additional tools */
export interface ArixPlugin {
  name: string
  setup(registry: PluginToolRegistry): void
}

export class PluginRegistry {
  private readonly plugins: Map<string, ArixPlugin> = new Map()

  register(plugin: ArixPlugin): void {
    this.plugins.set(plugin.name, plugin)
  }

  get(name: string): ArixPlugin | undefined {
    return this.plugins.get(name)
  }

  list(): ArixPlugin[] {
    return [...this.plugins.values()]
  }

  setupAll(toolRegistry: PluginToolRegistry): void {
    for (const plugin of this.plugins.values()) {
      plugin.setup(toolRegistry)
    }
  }
}

// ── Disk-based loader ─────────────────────────────────────────────────────

export interface PluginManifest {
  name: string
  version: string
  description: string
  /** Entry point relative to plugin dir. Default: index.js */
  main?: string
}

export interface DiskPluginModule {
  tools: Tool[]
}

export interface LoadedPlugin {
  manifest: PluginManifest
  tools: Tool[]
  path: string
}

export class PluginLoader {
  private readonly pluginDir: string
  private loaded: Map<string, LoadedPlugin> = new Map()

  constructor(pluginDir?: string) {
    this.pluginDir = pluginDir ?? join(homedir(), '.arix', 'plugins')
  }

  /** Load (or reload) all plugins from the plugins directory. */
  async loadAll(): Promise<LoadedPlugin[]> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(this.pluginDir, { withFileTypes: true }) as import('node:fs').Dirent[]
    } catch {
      return []   // plugin dir doesn't exist — fine
    }

    const plugins: LoadedPlugin[] = []
    for (const entry of entries) {
      const name = entry.name as string
      if (!entry.isDirectory() && !name.endsWith('.js')) continue
      const pluginPath = join(this.pluginDir, name)
      try {
        const plugin = await this.loadOne(pluginPath)
        if (plugin) {
          this.loaded.set(plugin.manifest.name, plugin)
          plugins.push(plugin)
          logger.debug(`[plugins] loaded "${plugin.manifest.name}" (${plugin.tools.length} tools)`)
        }
      } catch (err) {
        logger.debug(`[plugins] failed to load ${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return plugins
  }

  /** All tools from all loaded plugins. */
  allTools(): Tool[] {
    return [...this.loaded.values()].flatMap((p) => p.tools)
  }

  allPlugins(): LoadedPlugin[] {
    return [...this.loaded.values()]
  }

  private async loadOne(pluginPath: string): Promise<LoadedPlugin | null> {
    let manifest: PluginManifest
    try {
      const raw = await readFile(join(pluginPath, 'plugin.json'), 'utf8')
      manifest = JSON.parse(raw) as PluginManifest
    } catch {
      const name = pluginPath.split('/').pop() ?? 'unknown'
      manifest = { name, version: '0.0.0', description: '' }
    }

    const entryRelative = manifest.main ?? 'index.js'
    const entryPath = resolve(pluginPath, entryRelative)
    // Cache-bust for hot reload
    const entryUrl = `${pathToFileURL(entryPath).href}?t=${Date.now()}`
    const mod = await import(entryUrl) as { default?: DiskPluginModule } | DiskPluginModule
    const pluginModule: DiskPluginModule | undefined =
      'default' in mod && mod.default ? mod.default : (mod as DiskPluginModule)

    if (!pluginModule?.tools || !Array.isArray(pluginModule.tools)) return null
    return { manifest, tools: pluginModule.tools, path: pluginPath }
  }
}
