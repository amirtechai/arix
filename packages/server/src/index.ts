import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { AgentLoop, ConfigManager, SkillManager, SessionManager, logger } from '@arix-code/core'
import type { AgentEvent, Session } from '@arix-code/core'
import { ProviderFactory } from '@arix-code/providers'
import { ReadFileTool, WriteFileTool, ListDirectoryTool, ShellExecTool } from '@arix-code/tools'
import { GitStatusTool, GitDiffTool, GitCommitTool, GitBranchTool } from '@arix-code/tools'

// ── Proto loading ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROTO_PATH = join(__dirname, '..', 'proto', 'arix.proto')

export function loadProto() {
  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  })
  return grpc.loadPackageDefinition(packageDef) as unknown as {
    'arix': {
      'v1': {
        ChatService: grpc.ServiceClientConstructor
        SessionService: grpc.ServiceClientConstructor
      }
    }
  }
}

// ── Agent bootstrap for server ────────────────────────────────────────────────

async function makeLoop(opts: {
  model?: string
  provider?: string
  skill?: string
  cwd?: string
}): Promise<AgentLoop> {
  const configDir = join(homedir(), '.arix')
  const cwd = opts.cwd ?? process.cwd()

  const configMgr = new ConfigManager(configDir)
  const config = await configMgr.load()
  const providerName = opts.provider ?? config.provider ?? 'anthropic'
  const apiKey = configMgr.resolveApiKey(providerName)
  const provider = ProviderFactory.create(providerName, {
    ...(apiKey !== undefined ? { apiKey } : {}),
  })

  const skillMgr = new SkillManager()
  await skillMgr.loadFromDirectory(join(configDir, 'skills'))
  const skillName = opts.skill ?? config.skill
  const systemPrompt = skillName !== undefined ? skillMgr.get(skillName)?.systemPrompt : config.systemPrompt

  const allowedPaths = [cwd]
  const tools = [
    new ReadFileTool(allowedPaths),
    new WriteFileTool(allowedPaths),
    new ListDirectoryTool(allowedPaths),
    new ShellExecTool(allowedPaths),
    new GitStatusTool(cwd),
    new GitDiffTool(cwd),
    new GitCommitTool(cwd),
    new GitBranchTool(cwd),
  ]

  return new AgentLoop({
    provider,
    model: opts.model ?? config.model ?? 'claude-sonnet-4-6',
    tools,
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ServerWritableStream = grpc.ServerWritableStream<unknown, unknown>

function sendEvent(call: ServerWritableStream, ev: AgentEvent): void {
  if (ev.type === 'text') {
    call.write({ payload: 'text', text: { text: ev.chunk } })
  } else if (ev.type === 'tool_start') {
    call.write({
      payload: 'tool_call',
      tool_call: { id: ev.call.id, name: ev.call.name, input_json: JSON.stringify(ev.call.input) },
    })
  } else if (ev.type === 'tool_result') {
    call.write({
      payload: 'tool_result',
      tool_result: {
        tool_call_id: ev.result.toolCallId,
        success: ev.result.success,
        output: ev.result.output ?? '',
        error: ev.result.error ?? '',
      },
    })
  } else if (ev.type === 'error') {
    call.write({ payload: 'error', error: { message: ev.error } })
  } else if (ev.type === 'done') {
    call.write({ payload: 'done', done: { session_id: '' } })
  }
}

// ── Service implementations ───────────────────────────────────────────────────

function makeRunHandler() {
  return async (call: grpc.ServerWritableStream<{
    prompt: string
    model: string
    provider: string
    skill: string
    max_turns: number
  }, unknown>): Promise<void> => {
    const req = call.request
    logger.info('gRPC Run request', { model: req.model, provider: req.provider })
    try {
      const loop = await makeLoop({ model: req.model, provider: req.provider, skill: req.skill })
      for await (const ev of loop.run(req.prompt)) {
        sendEvent(call as unknown as ServerWritableStream, ev)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      call.write({ payload: 'error', error: { message: msg } })
    }
    call.end()
  }
}

function makeListSessionsHandler() {
  return async (
    _call: grpc.ServerUnaryCall<{ limit: number }, unknown>,
    callback: grpc.sendUnaryData<unknown>,
  ): Promise<void> => {
    const sessionDir = join(homedir(), '.arix', 'sessions')
    const mgr = new SessionManager(sessionDir)
    const sessions = await mgr.list()
    callback(null, {
      sessions: sessions.slice(0, 50).map((s) => ({
        id: s.id,
        title: s.title,
        created_at: String(s.createdAt),
        updated_at: String(s.updatedAt),
        message_count: s.messageCount,
      })),
    })
  }
}

// ── Server factory ────────────────────────────────────────────────────────────

export function createGrpcServer(): grpc.Server {
  const proto = loadProto()
  const server = new grpc.Server()

  const chatServiceProto = proto['arix']['v1']['ChatService'] as unknown as {
    service: grpc.ServiceDefinition
  }
  const sessionServiceProto = proto['arix']['v1']['SessionService'] as unknown as {
    service: grpc.ServiceDefinition
  }

  server.addService(chatServiceProto.service, {
    Run: makeRunHandler(),
    // Bidirectional Chat: not implemented in this MVP
    Chat: (call: grpc.ServerDuplexStream<unknown, unknown>) => {
      call.write({ payload: 'error', error: { message: 'Bidirectional Chat not yet implemented — use Run' } })
      call.end()
    },
  })

  server.addService(sessionServiceProto.service, {
    List: makeListSessionsHandler(),
    Get: (_call: unknown, cb: grpc.sendUnaryData<unknown>) => cb({ code: grpc.status.UNIMPLEMENTED }),
    Delete: (_call: unknown, cb: grpc.sendUnaryData<unknown>) => cb({ code: grpc.status.UNIMPLEMENTED }),
  })

  return server
}

export function startServer(port = 50051): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createGrpcServer()
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) { reject(err); return }
        logger.info('Arix gRPC server started', { port: boundPort })
        console.log(`Arix gRPC server listening on port ${boundPort}`)
        resolve(boundPort)
      },
    )
  })
}
