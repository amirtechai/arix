/**
 * Wiki index — codebase knowledge base using Node.js built-in sqlite (node:sqlite).
 * No native addons required. Requires Node 22.5+ (--experimental-sqlite flag
 * not needed in Node 22.12+ when imported as CJS, used via createRequire).
 *
 * Uses FTS5 full-text search for BM25-scored chunk retrieval.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'

// node:sqlite is experimental in Node 22. Load via createRequire so the import
// is synchronous and doesn't make the entire module async.
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { DatabaseSync } = _require('node:sqlite') as {
  DatabaseSync: new (path: string) => NodeSqliteDatabase
}

// Minimal type shim for node:sqlite DatabaseSync
interface NodeSqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
}

interface NodeSqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): NodeSqliteStatement
  close(): void
}

// ── Constants ──────────────────────────────────────────────────────────────

const INDEXABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs',
  '.py', '.go', '.rs', '.rb', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.md', '.mdx', '.txt', '.rst',
  '.json', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh',
  '.css', '.scss', '.html',
])

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.turbo', 'coverage', '.nyc_output', 'target', 'vendor',
])

const MAX_FILE_BYTES = 200_000  // skip files > 200KB
const CHUNK_SIZE = 50           // lines per chunk
const TOP_K = 8                 // results to return per query

// ── Types ──────────────────────────────────────────────────────────────────

export interface WikiChunk {
  id: number
  filePath: string
  startLine: number
  endLine: number
  content: string
  score: number
}

export interface BuildStats {
  files: number
  chunks: number
  skipped: number
  durationMs: number
}

// ── WikiIndex ──────────────────────────────────────────────────────────────

export class WikiIndex {
  private readonly dbPath: string
  private db: NodeSqliteDatabase | null = null

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(homedir(), '.arix', 'wiki.db')
  }

  private open(): NodeSqliteDatabase {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath)
      this.initSchema()
    }
    return this.db
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private initSchema(): void {
    const db = this.db!
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS chunks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path  TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line   INTEGER NOT NULL,
        content    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        content='chunks',
        content_rowid='id',
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;
    `)
  }

  // ── Build ────────────────────────────────────────────────────────────────

  async build(rootDir: string, onProgress?: (file: string) => void): Promise<BuildStats> {
    const start = Date.now()
    const db = this.open()

    // Clear existing index
    db.exec(`
      DELETE FROM chunks;
      INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild');
    `)
    db.prepare("INSERT OR REPLACE INTO meta VALUES ('root', ?)").run(rootDir)
    db.prepare("INSERT OR REPLACE INTO meta VALUES ('built_at', ?)").run(new Date().toISOString())

    const files: string[] = []
    await collectFiles(rootDir, files)

    const insertChunk = db.prepare(
      'INSERT INTO chunks (file_path, start_line, end_line, content) VALUES (?, ?, ?, ?)',
    )

    let totalChunks = 0
    let skipped = 0

    for (const filePath of files) {
      onProgress?.(filePath)
      try {
        const info = await stat(filePath)
        if (info.size > MAX_FILE_BYTES) { skipped++; continue }

        const raw = await readFile(filePath, 'utf8')
        const relPath = relative(rootDir, filePath)
        const chunks = chunkFile(relPath, raw)
        for (const [fp, sl, el, content] of chunks) {
          insertChunk.run(fp, sl, el, content)
          totalChunks++
        }
      } catch {
        skipped++
      }
    }

    db.prepare("INSERT OR REPLACE INTO meta VALUES ('chunk_count', ?)").run(String(totalChunks))
    db.prepare("INSERT OR REPLACE INTO meta VALUES ('file_count', ?)").run(String(files.length))

    return {
      files: files.length,
      chunks: totalChunks,
      skipped,
      durationMs: Date.now() - start,
    }
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  query(question: string, topK = TOP_K): WikiChunk[] {
    const db = this.open()

    const ftsQuery = sanitizeFtsQuery(question)
    if (!ftsQuery) return []

    const rawRows = db.prepare(`
      SELECT c.id, c.file_path, c.start_line, c.end_line, c.content,
             bm25(chunks_fts) AS rank
      FROM chunks_fts
      JOIN chunks c ON c.id = chunks_fts.rowid
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, topK)

    return rawRows.map((r) => ({
      id: r['id'] as number,
      filePath: r['file_path'] as string,
      startLine: r['start_line'] as number,
      endLine: r['end_line'] as number,
      content: r['content'] as string,
      // bm25 returns negative values; negate so higher = better
      score: -(r['rank'] as number),
    }))
  }

  // ── Meta ──────────────────────────────────────────────────────────────────

  getStats(): { root: string; builtAt: string; files: number; chunks: number } | null {
    try {
      const db = this.open()
      const get = (key: string) =>
        (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? ''
      return {
        root: get('root'),
        builtAt: get('built_at'),
        files: parseInt(get('file_count') || '0', 10),
        chunks: parseInt(get('chunk_count') || '0', 10),
      }
    } catch {
      return null
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function collectFiles(dir: string, out: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true }) as import('node:fs').Dirent[]
  } catch {
    return
  }

  for (const entry of entries) {
    const name = entry.name as string
    if (name.startsWith('.') && name !== '.env.example') continue
    const full = join(dir, name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      await collectFiles(full, out)
    } else if (entry.isFile()) {
      const ext = extname(name)
      if (INDEXABLE_EXTENSIONS.has(ext)) out.push(full)
    }
  }
}

function chunkFile(relPath: string, content: string): Array<[string, number, number, string]> {
  const lines = content.split('\n')
  const chunks: Array<[string, number, number, string]> = []

  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const slice = lines.slice(i, i + CHUNK_SIZE)
    const text = `// ${relPath}\n${slice.join('\n')}`.trim()
    if (text.length > 10) {
      chunks.push([relPath, i + 1, Math.min(i + CHUNK_SIZE, lines.length), text])
    }
  }

  return chunks
}

function sanitizeFtsQuery(input: string): string {
  // Strip FTS5 special operators to prevent syntax errors
  return input
    .replace(/['"*^()\[\]{}:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 1)
    .join(' OR ')
}

export { WikiIndex as default }
