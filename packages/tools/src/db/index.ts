/**
 * db_query (N1) — read-only SQL helper for SQLite (stdlib `node:sqlite`),
 * Postgres (optional `pg` peer), and MySQL (optional `mysql2` peer).
 *
 * Mutating statements are rejected by default. EXPLAIN / SHOW / SELECT /
 * pragma_* are allowed.
 */

import type { Tool, ToolResult } from '@arix-code/core'
import { truncate } from '../shell/exec.js'

const READ_ONLY_RE = /^\s*(SELECT|WITH|EXPLAIN|SHOW|PRAGMA|DESCRIBE|DESC)\b/i

type Engine = 'sqlite' | 'postgres' | 'mysql'

function detectEngine(url: string): Engine {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres'
  if (url.startsWith('mysql://')) return 'mysql'
  return 'sqlite'
}

interface QueryRow { [k: string]: unknown }

async function runSqlite(file: string, sql: string, params: unknown[]): Promise<QueryRow[]> {
  // node:sqlite is experimental; require dynamically so import doesn't break older Node
  const { DatabaseSync } = await import('node:sqlite').catch(() => {
    throw new Error('node:sqlite not available — upgrade Node to 22.5+ or install better-sqlite3')
  }) as typeof import('node:sqlite')
  const db = new DatabaseSync(file)
  try {
    const stmt = db.prepare(sql)
    return stmt.all(...(params as never[])) as QueryRow[]
  } finally {
    db.close()
  }
}

// `pg` and `mysql2` are optional peer deps loaded lazily — using `any` here
// avoids forcing the user to install them just to typecheck @arix-code/tools.

async function runPostgres(connStr: string, sql: string, params: unknown[]): Promise<QueryRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pgMod: any
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pgMod = await (Function('m', 'return import(m)')('pg') as Promise<any>)
  } catch {
    throw new Error('Install `pg` to query PostgreSQL: npm i pg')
  }
  const Client = pgMod.default?.Client ?? pgMod.Client
  const client = new Client({ connectionString: connStr })
  await client.connect()
  try {
    const res = await client.query(sql, params)
    return (res.rows ?? []) as QueryRow[]
  } finally {
    await client.end()
  }
}

async function runMysql(connStr: string, sql: string, params: unknown[]): Promise<QueryRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mysqlMod: any
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mysqlMod = await (Function('m', 'return import(m)')('mysql2/promise') as Promise<any>)
  } catch {
    throw new Error('Install `mysql2` to query MySQL: npm i mysql2')
  }
  const conn = await mysqlMod.createConnection(connStr)
  try {
    const [rows] = await conn.execute(sql, params)
    return rows as QueryRow[]
  } finally {
    await conn.end()
  }
}

export class DbQueryTool implements Tool {
  readonly name = 'db_query'
  readonly description =
    'Run a read-only SQL query (SELECT/EXPLAIN/SHOW/PRAGMA). Engines: SQLite (file path), Postgres (postgres:// URL), MySQL (mysql:// URL). Returns rows as JSON.'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      connection: { type: 'string', description: 'SQLite file path OR postgres:// / mysql:// URL' },
      sql:        { type: 'string' },
      params:     { type: 'array', description: 'Positional parameters', items: {} },
      allowMutation: { type: 'boolean', description: 'Override read-only safety. DANGEROUS.' },
      maxRows:    { type: 'number', description: 'Truncate result set (default 200)' },
    },
    required: ['connection', 'sql'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const conn   = input['connection'] as string
    const sql    = input['sql'] as string
    const params = (input['params'] as unknown[] | undefined) ?? []
    const allowMut = (input['allowMutation'] as boolean | undefined) ?? false
    const maxRows  = (input['maxRows'] as number | undefined) ?? 200

    if (!allowMut && !READ_ONLY_RE.test(sql)) {
      return {
        toolCallId: '', success: false, output: '',
        error: 'Refusing to run non-read-only SQL. Pass allowMutation:true to override.',
      }
    }

    const engine = detectEngine(conn)
    try {
      let rows: QueryRow[]
      if (engine === 'sqlite')        rows = await runSqlite(conn, sql, params)
      else if (engine === 'postgres') rows = await runPostgres(conn, sql, params)
      else                            rows = await runMysql(conn, sql, params)

      const slice = rows.slice(0, maxRows)
      const out = JSON.stringify({
        engine,
        rowCount: rows.length,
        truncated: rows.length > maxRows,
        rows: slice,
      }, null, 2)
      return { toolCallId: '', success: true, output: truncate(out, 32_000) }
    } catch (err) {
      return { toolCallId: '', success: false, output: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
}
