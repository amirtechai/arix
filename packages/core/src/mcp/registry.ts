import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { McpClient } from './client.js'
import type { McpServerConfig } from './types.js'
import type { Tool } from '../types.js'
import { McpToolAdapter } from './tool-adapter.js'

interface McpRegistryData {
  servers: McpServerConfig[]
}

export class McpRegistry {
  private readonly configPath: string
  private clients = new Map<string, McpClient>()
  private data: McpRegistryData = { servers: [] }

  constructor(configDir: string) {
    this.configPath = join(resolve(configDir), 'mcp.json')
  }

  async load(): Promise<void> {
    if (!existsSync(this.configPath)) return
    const content = await readFile(this.configPath, 'utf-8')
    this.data = JSON.parse(content) as McpRegistryData
  }

  async save(): Promise<void> {
    await mkdir(resolve(this.configPath, '..'), { recursive: true })
    await writeFile(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  async addServer(config: McpServerConfig): Promise<void> {
    const existing = this.data.servers.findIndex((s) => s.name === config.name)
    if (existing >= 0) {
      this.data.servers[existing] = config
    } else {
      this.data.servers.push(config)
    }
    await this.save()
  }

  async removeServer(name: string): Promise<boolean> {
    const idx = this.data.servers.findIndex((s) => s.name === name)
    if (idx < 0) return false
    this.data.servers.splice(idx, 1)
    const client = this.clients.get(name)
    client?.disconnect()
    this.clients.delete(name)
    await this.save()
    return true
  }

  getServers(): McpServerConfig[] {
    return [...this.data.servers]
  }

  /** Connect to all enabled servers and return their tools. */
  async connectAll(): Promise<Tool[]> {
    const tools: Tool[] = []
    const enabled = this.data.servers.filter((s) => s.enabled !== false)

    await Promise.allSettled(
      enabled.map(async (cfg) => {
        try {
          const client = new McpClient(cfg)
          await client.connect()
          this.clients.set(cfg.name, client)
          for (const tool of client.tools) {
            tools.push(new McpToolAdapter(client, tool))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          process.stderr.write(`[mcp] Failed to connect "${cfg.name}": ${msg}\n`)
        }
      }),
    )

    return tools
  }

  /** Connect to a specific server by name and return its tools. */
  async connectOne(name: string): Promise<Tool[]> {
    const cfg = this.data.servers.find((s) => s.name === name)
    if (!cfg) throw new Error(`MCP server not found: ${name}`)
    const client = new McpClient(cfg)
    await client.connect()
    this.clients.set(name, client)
    return client.tools.map((t) => new McpToolAdapter(client, t))
  }

  getClient(name: string): McpClient | undefined {
    return this.clients.get(name)
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect()
    }
    this.clients.clear()
  }
}
