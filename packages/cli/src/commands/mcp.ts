/**
 * arix mcp — manage MCP (Model Context Protocol) servers
 *
 *   arix mcp list                        # list configured servers + status
 *   arix mcp add <name> --stdio <cmd>    # add stdio server
 *   arix mcp add <name> --http <url>     # add http server
 *   arix mcp remove <name>               # remove server
 *   arix mcp tools [name]                # list tools from server(s)
 *   arix mcp test <name>                 # connect and verify
 */

import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { McpRegistry, McpClient, MCP_CATALOG, findMcpEntry, materialiseMcpEntry } from '@arix-code/core'
import type { McpServerConfig } from '@arix-code/core'

const configDir = join(homedir(), '.arix')

function makeRegistry(): McpRegistry {
  return new McpRegistry(configDir)
}

export function registerMcp(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Manage MCP (Model Context Protocol) servers')

  // ── mcp list ──────────────────────────────────────────────────────────────

  mcp
    .command('list')
    .alias('ls')
    .description('List configured MCP servers')
    .action(async () => {
      const reg = makeRegistry()
      await reg.load()
      const servers = reg.getServers()

      if (servers.length === 0) {
        process.stdout.write('No MCP servers configured.\nUse: arix mcp add <name> --stdio <command> [args...]\n')
        return
      }

      process.stdout.write(`\nConfigured MCP servers (${servers.length}):\n\n`)
      for (const s of servers) {
        const status = s.enabled === false ? '○ disabled' : '● enabled'
        const transport = s.transport === 'stdio'
          ? `stdio: ${s.command} ${(s.args ?? []).join(' ')}`
          : `http: ${s.url}`
        process.stdout.write(`  ${status}  ${s.name}\n`)
        process.stdout.write(`           ${transport}\n`)
      }
      process.stdout.write('\n')
    })

  // ── mcp add ───────────────────────────────────────────────────────────────

  mcp
    .command('add <name>')
    .description('Add an MCP server')
    .option('--stdio <command>', 'Command to spawn (stdio transport)')
    .option('--args <args...>', 'Additional arguments for stdio command')
    .option('--http <url>', 'Server URL (http transport)')
    .option('--header <headers...>', 'HTTP headers in key=value format')
    .option('--env <vars...>', 'Environment variables in KEY=VALUE format')
    .option('--disabled', 'Add server but keep it disabled')
    .action(async (name: string, opts: Record<string, unknown>) => {
      const reg = makeRegistry()
      await reg.load()

      const stdioCmd = opts['stdio'] as string | undefined
      const httpUrl = opts['http'] as string | undefined

      if (!stdioCmd && !httpUrl) {
        process.stderr.write('Error: specify --stdio <command> or --http <url>\n')
        process.exitCode = 1
        return
      }

      const args = opts['args'] as string[] | undefined
      const env = parseKv(opts['env'] as string[] | undefined)
      const headers = parseKv(opts['header'] as string[] | undefined)
      const enabled = opts['disabled'] ? false : true
      const config: McpServerConfig = stdioCmd
        ? {
            name,
            transport: 'stdio',
            command: stdioCmd,
            ...(args !== undefined ? { args } : {}),
            ...(env !== undefined ? { env } : {}),
            enabled,
          }
        : {
            name,
            transport: 'http',
            url: httpUrl!,
            ...(headers !== undefined ? { headers } : {}),
            enabled,
          }

      await reg.addServer(config)
      process.stdout.write(`MCP server "${name}" added.\n`)

      // Optionally test connectivity
      if (config.enabled !== false) {
        process.stdout.write('Testing connection...\n')
        try {
          const client = new McpClient(config)
          await client.connect()
          process.stdout.write(`Connected. ${client.tools.length} tool(s) available: ${client.tools.map((t) => t.name).join(', ') || '(none)'}\n`)
          client.disconnect()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          process.stderr.write(`Warning: could not connect (${msg}). Server saved but may not work.\n`)
        }
      }
    })

  // ── mcp remove ───────────────────────────────────────────────────────────

  mcp
    .command('remove <name>')
    .alias('rm')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      const reg = makeRegistry()
      await reg.load()
      const removed = await reg.removeServer(name)
      if (removed) {
        process.stdout.write(`MCP server "${name}" removed.\n`)
      } else {
        process.stderr.write(`MCP server "${name}" not found.\n`)
        process.exitCode = 1
      }
    })

  // ── mcp tools ────────────────────────────────────────────────────────────

  mcp
    .command('tools [name]')
    .description('List tools from MCP server(s)')
    .action(async (name: string | undefined) => {
      const reg = makeRegistry()
      await reg.load()

      const servers = name
        ? reg.getServers().filter((s) => s.name === name)
        : reg.getServers().filter((s) => s.enabled !== false)

      if (servers.length === 0) {
        process.stderr.write(name ? `MCP server "${name}" not found.\n` : 'No enabled MCP servers.\n')
        process.exitCode = 1
        return
      }

      for (const cfg of servers) {
        process.stdout.write(`\n${cfg.name}:\n`)
        try {
          const client = new McpClient(cfg)
          await client.connect()
          if (client.tools.length === 0) {
            process.stdout.write('  (no tools)\n')
          }
          for (const tool of client.tools) {
            process.stdout.write(`  ${tool.name}`)
            if (tool.description) process.stdout.write(` — ${tool.description}`)
            process.stdout.write('\n')
          }
          client.disconnect()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          process.stdout.write(`  Error: ${msg}\n`)
        }
      }
      process.stdout.write('\n')
    })

  // ── mcp test ─────────────────────────────────────────────────────────────

  mcp
    .command('test <name>')
    .description('Test connectivity to an MCP server')
    .action(async (name: string) => {
      const reg = makeRegistry()
      await reg.load()
      const cfg = reg.getServers().find((s) => s.name === name)
      if (!cfg) {
        process.stderr.write(`MCP server "${name}" not found.\n`)
        process.exitCode = 1
        return
      }

      process.stdout.write(`Testing "${name}"...\n`)
      const start = Date.now()
      try {
        const client = new McpClient(cfg)
        await client.connect()
        const ms = Date.now() - start
        process.stdout.write(`✓ Connected in ${ms}ms — ${client.tools.length} tool(s)\n`)
        client.disconnect()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`✗ Failed: ${msg}\n`)
        process.exitCode = 1
      }
    })

  // ── mcp enable / disable ─────────────────────────────────────────────────

  // ── mcp status (O7) ──────────────────────────────────────────────────────

  mcp
    .command('status')
    .description('Ping every enabled MCP server and report tool count + latency')
    .action(async () => {
      const reg = makeRegistry()
      await reg.load()
      const servers = reg.getServers().filter((s) => s.enabled !== false)
      if (servers.length === 0) {
        process.stdout.write('No enabled MCP servers.\n')
        return
      }
      const results = await Promise.all(servers.map(async (cfg) => {
        const start = Date.now()
        try {
          const client = new McpClient(cfg)
          await client.connect()
          const ms = Date.now() - start
          const count = client.tools.length
          client.disconnect()
          return { name: cfg.name, ok: true, ms, count, error: null as string | null }
        } catch (err) {
          return { name: cfg.name, ok: false, ms: Date.now() - start, count: 0, error: err instanceof Error ? err.message : String(err) }
        }
      }))
      process.stdout.write('\nMCP server status:\n\n')
      for (const r of results) {
        const icon = r.ok ? '●' : '○'
        process.stdout.write(`  ${icon} ${r.name.padEnd(22)} ${r.ok ? `${r.count} tool${r.count === 1 ? '' : 's'}, ${r.ms}ms` : `error: ${r.error}`}\n`)
      }
      process.stdout.write('\n')
    })

  // ── mcp catalog ──────────────────────────────────────────────────────────

  mcp
    .command('catalog')
    .description('List recommended MCP servers (installable via "arix mcp install <id>")')
    .action(() => {
      process.stdout.write(`\nAvailable MCP servers (${MCP_CATALOG.length}):\n\n`)
      for (const e of MCP_CATALOG) {
        process.stdout.write(`  ${e.id.padEnd(22)} ${e.description}\n`)
        if (e.requiredEnv?.length) {
          process.stdout.write(`  ${' '.repeat(22)} requires: ${e.requiredEnv.join(', ')}\n`)
        }
      }
      process.stdout.write('\nInstall with: arix mcp install <id> [--env KEY=VALUE ...]\n\n')
    })

  // ── mcp install ──────────────────────────────────────────────────────────

  mcp
    .command('install <ids...>')
    .description('Install one or more MCP servers from the curated catalog')
    .option('--env <vars...>', 'Environment variables in KEY=VALUE format (applies to all)')
    .action(async (ids: string[], opts: Record<string, unknown>) => {
      const reg = makeRegistry()
      await reg.load()
      const env = parseKv(opts['env'] as string[] | undefined) ?? {}

      for (const id of ids) {
        const entry = findMcpEntry(id)
        if (!entry) {
          process.stderr.write(`✗ Unknown MCP id "${id}". Run "arix mcp catalog" to list options.\n`)
          process.exitCode = 1
          continue
        }
        const missing = (entry.requiredEnv ?? []).filter((k) => !(k in env) && !process.env[k])
        if (missing.length > 0) {
          process.stderr.write(`✗ "${id}" requires env vars: ${missing.join(', ')} (pass with --env KEY=VALUE)\n`)
          process.exitCode = 1
          continue
        }
        const filteredEnv: Record<string, string> = {}
        for (const k of entry.requiredEnv ?? []) {
          const v = env[k] ?? process.env[k]
          if (v) filteredEnv[k] = v
        }
        const cfg = materialiseMcpEntry(entry, filteredEnv)
        await reg.addServer(cfg)
        process.stdout.write(`✓ Installed "${id}" (${entry.name})\n`)
      }
    })

  mcp
    .command('enable <name>')
    .description('Enable an MCP server')
    .action(async (name: string) => toggleServer(name, true))

  mcp
    .command('disable <name>')
    .description('Disable an MCP server')
    .action(async (name: string) => toggleServer(name, false))
}

async function toggleServer(name: string, enabled: boolean): Promise<void> {
  const reg = makeRegistry()
  await reg.load()
  const servers = reg.getServers()
  const cfg = servers.find((s) => s.name === name)
  if (!cfg) {
    process.stderr.write(`MCP server "${name}" not found.\n`)
    process.exitCode = 1
    return
  }
  await reg.addServer({ ...cfg, enabled })
  process.stdout.write(`MCP server "${name}" ${enabled ? 'enabled' : 'disabled'}.\n`)
}

function parseKv(items: string[] | undefined): Record<string, string> | undefined {
  if (!items?.length) return undefined
  const result: Record<string, string> = {}
  for (const item of items) {
    const eq = item.indexOf('=')
    if (eq < 0) continue
    result[item.slice(0, eq)] = item.slice(eq + 1)
  }
  return Object.keys(result).length > 0 ? result : undefined
}
