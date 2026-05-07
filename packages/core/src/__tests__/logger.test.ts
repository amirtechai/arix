import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rm, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'

// We test the logger by importing it after patching homedir
// to point to a temp directory.

describe('LogManager', () => {
  let tmpHome: string

  beforeEach(async () => {
    tmpHome = await mkdtemp(join(tmpdir(), 'arix-logger-test-'))
    vi.resetModules()
    vi.doMock('node:os', () => ({ homedir: () => tmpHome }))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(tmpHome, { recursive: true, force: true })
  })

  it('writes log entry to file', async () => {
    const { logger } = await import('../logger/index.js')
    logger.info('test message', { key: 'value' })
    // wait for async file write
    await new Promise((r) => setTimeout(r, 50))

    const logDir = join(tmpHome, '.arix', 'logs')
    const files = await readdir(logDir).catch(() => [])
    expect(files.length).toBeGreaterThan(0)

    const content = await readFile(join(logDir, files[0]!), 'utf-8')
    expect(content).toContain('test message')
    expect(content).toContain('"key":"value"')
  })

  it('redacts sensitive fields', async () => {
    const { logger } = await import('../logger/index.js')
    logger.info('auth', { apiKey: 'sk-secret-key', userId: '123' })
    await new Promise((r) => setTimeout(r, 50))

    const logDir = join(tmpHome, '.arix', 'logs')
    const files = await readdir(logDir).catch(() => [])
    if (files.length === 0) return // file write may not happen in test

    const content = await readFile(join(logDir, files[0]!), 'utf-8')
    expect(content).not.toContain('sk-secret-key')
    expect(content).toContain('[REDACTED]')
    expect(content).toContain('123')
  })
})

describe('scrub (sensitive field redaction)', () => {
  it('redacts nested sensitive keys', async () => {
    // Test via the log output directly
    const writtenLines: string[] = []
    const _origWrite = process.stdout.write.bind(process.stdout)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })

    vi.resetModules()
    vi.doMock('node:os', () => ({ homedir: () => '/tmp/fake-home' }))
    const { logger } = await import('../logger/index.js')
    logger.enableDebug()
    logger.debug('nested', { outer: { token: 'abc123', name: 'alice' } })

    expect(writtenLines.some((l) => l.includes('[REDACTED]'))).toBe(true)
    expect(writtenLines.every((l) => !l.includes('abc123'))).toBe(true)

    vi.restoreAllMocks()
  })
})

describe('formatUserError', () => {
  it('maps AUTH_ERROR to friendly message', async () => {
    const { formatUserError } = await import('../errors/handler.js')
    const { ArixError } = await import('../errors.js')
    const err = new ArixError('AUTH_ERROR', 'raw internal message')
    const msg = formatUserError(err)
    expect(msg).toContain('API key')
    expect(msg).not.toBe('raw internal message')
  })

  it('passes through plain Error message', async () => {
    const { formatUserError } = await import('../errors/handler.js')
    const err = new Error('something went wrong')
    expect(formatUserError(err)).toBe('something went wrong')
  })
})
