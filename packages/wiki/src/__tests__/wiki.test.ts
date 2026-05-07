import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// node:sqlite requires Node 22.5+. Probe before importing the wiki module
// (which loads node:sqlite eagerly).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let WikiIndex: any = null
let sqliteAvailable = false
try {
  // Synchronous require so the probe runs deterministically in vitest's
  // ESM-but-with-cjs-interop transform pipeline.
   
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  req('node:sqlite')
  sqliteAvailable = true
  WikiIndex = (await import('../index.js')).WikiIndex
} catch { /* skipped on older Node */ }

let workDir: string
let dbPath: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'arix-wiki-'))
  dbPath = join(workDir, 'wiki.db')

  // Create a small fake codebase
  await mkdir(join(workDir, 'src'), { recursive: true })
  await writeFile(
    join(workDir, 'src', 'auth.ts'),
    `export function login(email: string, password: string): Promise<string> {
  // Validate credentials and return JWT token
  return fetch('/api/auth', { method: 'POST', body: JSON.stringify({ email, password }) })
    .then(r => r.json())
    .then(d => d.token)
}

export function logout(): void {
  localStorage.removeItem('token')
}
`,
  )
  await writeFile(
    join(workDir, 'src', 'database.ts'),
    `import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function queryUsers(limit = 10) {
  const result = await pool.query('SELECT * FROM users LIMIT $1', [limit])
  return result.rows
}

export async function getUserById(id: string) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0]
}
`,
  )
  await writeFile(
    join(workDir, 'README.md'),
    `# My Project

A demo project with authentication and database access.

## Setup
Run \`npm install\` then \`npm start\`.
`,
  )
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

const d = sqliteAvailable ? describe : describe.skip

d('WikiIndex', () => {
  it('builds an index and returns stats', async () => {
    const index = new WikiIndex(dbPath)
    const stats = await index.build(workDir)
    index.close()

    expect(stats.files).toBeGreaterThanOrEqual(3)
    expect(stats.chunks).toBeGreaterThan(0)
    expect(stats.skipped).toBe(0)
    expect(stats.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('queries and finds relevant chunks', async () => {
    const index = new WikiIndex(dbPath)
    await index.build(workDir)

    const results = index.query('authentication login token')
    index.close()

    expect(results.length).toBeGreaterThan(0)
    const authResult = results.find((r: { filePath: string; content: string }) => r.filePath.includes('auth'))
    expect(authResult).toBeDefined()
    expect(authResult?.content).toContain('login')
  })

  it('returns empty array for unmatched query', async () => {
    const index = new WikiIndex(dbPath)
    await index.build(workDir)

    const results = index.query('xyzzy_nonexistent_function_zzz')
    index.close()

    expect(results).toHaveLength(0)
  })

  it('getStats returns index metadata after build', async () => {
    const index = new WikiIndex(dbPath)
    await index.build(workDir)
    const stats = index.getStats()
    index.close()

    expect(stats).not.toBeNull()
    expect(stats?.root).toBe(workDir)
    expect(stats?.builtAt).toBeTruthy()
    expect(stats?.chunks).toBeGreaterThan(0)
  })

  it('getStats returns empty stats when index has not been built', () => {
    // node:sqlite creates the DB file on open — getStats returns zeros, not null
    const index = new WikiIndex(join(workDir, 'fresh.db'))
    const stats = index.getStats()
    index.close()
    // Either null (file not opened) or empty stats — both are acceptable "no index" states
    if (stats !== null) {
      expect(stats.chunks).toBe(0)
      expect(stats.files).toBe(0)
    }
  })

  it('rebuild clears previous data', async () => {
    const index = new WikiIndex(dbPath)
    await index.build(workDir)
    const first = index.getStats()

    // Build again
    await index.build(workDir)
    const second = index.getStats()
    index.close()

    // Chunk counts should be equal (same files)
    expect(second?.chunks).toBe(first?.chunks)
  })

  it('respects topK parameter', async () => {
    const index = new WikiIndex(dbPath)
    await index.build(workDir)

    const r1 = index.query('function', 1)
    const r2 = index.query('function', 3)
    index.close()

    expect(r1.length).toBeLessThanOrEqual(1)
    expect(r2.length).toBeLessThanOrEqual(3)
  })

  it('scores are positive numbers', async () => {
    const index = new WikiIndex(dbPath)
    await index.build(workDir)
    const results = index.query('database query users')
    index.close()

    for (const r of results) {
      expect(r.score).toBeGreaterThan(0)
    }
  })
})
