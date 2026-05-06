import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as grpc from '@grpc/grpc-js'
import { createGrpcServer, loadProto, startServer } from '../index.js'

// ── Proto loading ─────────────────────────────────────────────────────────────

describe('loadProto', () => {
  it('loads proto without throwing', () => {
    expect(() => loadProto()).not.toThrow()
  })

  it('exposes ChatService and SessionService', () => {
    const proto = loadProto()
    expect(proto['arix']['v1']['ChatService']).toBeDefined()
    expect(proto['arix']['v1']['SessionService']).toBeDefined()
  })
})

// ── Server creation ───────────────────────────────────────────────────────────

describe('createGrpcServer', () => {
  it('creates a grpc.Server instance', () => {
    const server = createGrpcServer()
    expect(server).toBeInstanceOf(grpc.Server)
    server.forceShutdown()
  })
})

// ── startServer / bind ────────────────────────────────────────────────────────

describe('startServer', () => {
  let boundPort: number

  beforeAll(async () => {
    // Use port 0 to let the OS assign a free port
    boundPort = await startServer(0)
  })

  afterAll(() => {
    // Server started by startServer isn't exposed for shutdown in the current API;
    // process will clean up after the test suite exits.
  })

  it('binds to a port successfully', () => {
    expect(typeof boundPort).toBe('number')
    expect(boundPort).toBeGreaterThan(0)
  })
})
