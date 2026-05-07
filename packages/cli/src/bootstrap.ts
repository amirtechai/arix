/**
 * Bootstrap: wire up provider, tools, and agent for a CLI session.
 *
 * Extras beyond basic setup:
 *  - ProjectMemory injection into system prompt
 *  - Git-aware context: recent commits + status injected
 *  - Auto model routing: --auto flag picks cheapest model for task complexity
 *  - Provider fallback chain: configurable fallback on rate limit / errors
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ConfigManager, SessionManager, AgentLoop, SkillManager, ProjectMemory, ModelCatalogue, McpRegistry } from '@arix-code/core'
import type { Session, TaskTier, NamedProfile } from '@arix-code/core'
import { classifyTask, taskTier } from './task-classifier.js'
import { ProviderFactory, FallbackProvider } from '@arix-code/providers'
import type { BaseProvider } from '@arix-code/core'
import { ToolRegistry, ToolExecutor } from '@arix-code/tools'
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from '@arix-code/tools'
import { ShellExecTool } from '@arix-code/tools'
import { GitStatusTool, GitDiffTool, GitCommitTool, GitBranchTool } from '@arix-code/tools'
import { SemanticSearchTool } from '@arix-code/tools'

const execFileAsync = promisify(execFile)

export interface BootstrapOverrides {
  skill?: string
  provider?: string
  model?: string
  /** If true, pick cheapest model for the given tier automatically */
  autoModel?: boolean
  autoTier?: TaskTier
  /** Named profile preset: budget | power | local */
  profile?: NamedProfile
  /** Initial prompt used for task-type classification */
  initialPrompt?: string
  /** Fallback provider chain (comma-separated: "anthropic,openrouter,ollama") */
  fallbackChain?: string
  /** Extra content appended to system prompt (e.g. file context) */
  extraSystemPrompt?: string
}

export interface BootstrapResult {
  loop: AgentLoop
  sessionManager: SessionManager
  configManager: ConfigManager
  mcpRegistry: McpRegistry
  resolvedModel: string
  resolvedProvider: string
}

// ── Git context helper ────────────────────────────────────────────────────────

async function getGitContext(cwd: string): Promise<string> {
  try {
    const [logResult, statusResult] = await Promise.allSettled([
      execFileAsync('git', ['log', '--oneline', '-5'], { cwd }),
      execFileAsync('git', ['status', '--short'], { cwd }),
    ])

    const log = logResult.status === 'fulfilled' ? logResult.value.stdout.trim() : ''
    const status = statusResult.status === 'fulfilled' ? statusResult.value.stdout.trim() : ''

    if (!log && !status) return ''

    const parts: string[] = []
    if (log) parts.push(`Recent commits:\n${log}`)
    if (status) parts.push(`Working tree changes:\n${status}`)
    return `\n\n[Git context]\n${parts.join('\n\n')}`
  } catch {
    return ''
  }
}

// ── Named profile → model resolution ─────────────────────────────────────────

function resolveProfileModel(
  profile: NamedProfile | undefined,
  providerName: string,
  taskType?: 'coding' | 'planning' | 'review' | 'simple',
): string | undefined {
  if (!profile) return undefined

  if (profile === 'local') {
    const model = ModelCatalogue.recommend({ providers: ['ollama'] })
    return model?.id ?? 'qwen2.5-coder:7b'
  }

  const tier: TaskTier = profile === 'power'
    ? (taskType === 'simple' ? 'medium' : 'complex')
    : 'simple'  // budget → always cheapest

  // budget + simple task → prefer free local model if available
  if (profile === 'budget' && (taskType === 'simple' || !taskType)) {
    const local = ModelCatalogue.recommend({ tier: 'simple', providers: ['ollama'] })
    if (local) return local.id
  }

  const model = ModelCatalogue.recommend({ tier, providers: [providerName], requireTools: true })
    ?? ModelCatalogue.recommend({ tier, requireTools: true })
  return model?.id
}

// ── Provider factory with fallback ───────────────────────────────────────────

function buildProvider(
  providerName: string,
  apiKey: string | undefined,
  fallbackChain?: string,
  configManager?: ConfigManager,
): BaseProvider {
  const primary = ProviderFactory.create(providerName, {
    ...(apiKey !== undefined ? { apiKey } : {}),
  }) as BaseProvider

  if (!fallbackChain) return primary

  const chain: BaseProvider[] = [primary]
  for (const name of fallbackChain.split(',').map((s) => s.trim())) {
    if (name === providerName) continue
    try {
      const key = configManager?.resolveApiKey(name)
      chain.push(ProviderFactory.create(name, { ...(key ? { apiKey: key } : {}) }) as BaseProvider)
    } catch { /* skip unavailable providers */ }
  }

  return chain.length > 1 ? new FallbackProvider(chain) : primary
}

// ── First-run provider guard ─────────────────────────────────────────────────

const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio'])

export function checkApiKeyConfigured(providerName: string, apiKey: string | undefined): void {
  if (apiKey !== undefined || LOCAL_PROVIDERS.has(providerName)) return
  const envVar = `${providerName.toUpperCase()}_API_KEY`
  throw new Error(
    `No API key configured for provider "${providerName}".\n` +
    `  Run: arix config set ${providerName}.apiKey YOUR_KEY\n` +
    `  Or set the ${envVar} environment variable.`
  )
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export async function bootstrap(
  cwd: string,
  initialSession?: Session,
  overrides?: BootstrapOverrides,
): Promise<BootstrapResult> {
  const configDir = join(homedir(), '.arix')
  const sessionDir = join(configDir, 'sessions')

  const configManager = new ConfigManager(configDir)
  const config = await configManager.load()

  // Resolve active skill → system prompt
  const skillManager = new SkillManager()
  await skillManager.loadFromDirectory(join(configDir, 'skills'))
  const activeSkillName = overrides?.skill ?? config.skill
  const activeSkill = activeSkillName !== undefined ? skillManager.get(activeSkillName) : undefined

  // Load persistent project memory
  const projectMemory = new ProjectMemory(cwd)
  await projectMemory.load()
  const memorySection = projectMemory.size > 0 ? projectMemory.toSystemPromptSection() : ''

  // Git-aware context
  const gitContext = await getGitContext(cwd)

  const CODING_IDENTITY = `You are Arix — the world's most capable AI software engineer. You are not a chatbot.

Your purpose is to write, review, debug, architect, and ship production-quality code.

Core disciplines:
- ARCHITECTURE FIRST: Before writing code, design the structure. Propose folder layout, module boundaries, data flow.
- RESEARCH: When uncertain about an API or library, say so and reason from first principles. Never hallucinate function signatures.
- PLAN → CODE → VERIFY: Always outline your approach, implement it, then verify correctness.
- ZERO SHORTCUTS: No placeholders, no "TODO: implement this", no incomplete code. Ship production-ready solutions.
- MINIMAL DIFF: Touch only what's needed. Every line must earn its place.
- VISUAL THINKING: For architecture, use Mermaid diagrams. For UI layouts, use ASCII wireframes.

When given a task:
1. Classify complexity (simple / coding / architecture / research)
2. State your plan in 2–3 bullets
3. Execute with full implementation
4. Confirm: "Would a staff engineer approve this?"

You have access to tools for reading/writing files, executing shell commands, and git operations. Use them.`

  const basePrompt = config.systemPrompt ?? activeSkill?.systemPrompt ?? CODING_IDENTITY
  const resolvedSystemPrompt = [basePrompt, memorySection, gitContext, overrides?.extraSystemPrompt].filter(Boolean).join('\n\n') || undefined

  // Model resolution order:
  // 1. Explicit --model override
  // 2. Named profile (--profile budget|power|local)
  // 3. Per-task modelProfiles from config
  // 4. Auto-tier routing (--auto)
  // 5. Config default / provider default
  const providerName = overrides?.provider ?? (overrides?.profile === 'local' ? 'ollama' : (config.provider ?? 'anthropic'))
  let modelId = overrides?.model

  if (!modelId && (overrides?.profile ?? config.profile)) {
    const profile = overrides?.profile ?? config.profile
    const taskType = overrides?.initialPrompt
      ? classifyTask(overrides.initialPrompt).type
      : undefined
    modelId = resolveProfileModel(profile, providerName, taskType)
  }

  if (!modelId && overrides?.initialPrompt && config.modelProfiles) {
    const taskType = classifyTask(overrides.initialPrompt).type
    modelId = config.modelProfiles[taskType]
  }

  if (!modelId && overrides?.autoModel) {
    const tier = overrides.autoTier ?? 'medium'
    const recommended = ModelCatalogue.recommend({ tier, providers: [providerName], requireTools: true })
    if (recommended) modelId = recommended.id
  }

  modelId ??= config.model ?? ModelCatalogue.defaultModel(providerName)

  const apiKey = configManager.resolveApiKey(providerName)
  checkApiKeyConfigured(providerName, apiKey)
  const provider = buildProvider(providerName, apiKey, overrides?.fallbackChain, configManager)

  const allowedPaths = [cwd]
  const registry = new ToolRegistry()
  registry.register(new ReadFileTool(allowedPaths))
  registry.register(new WriteFileTool(allowedPaths))
  registry.register(new ListDirectoryTool(allowedPaths))
  registry.register(new ShellExecTool(allowedPaths))
  registry.register(new GitStatusTool(cwd))
  registry.register(new GitDiffTool(cwd))
  registry.register(new GitCommitTool(cwd))
  registry.register(new GitBranchTool(cwd))
  registry.register(new SemanticSearchTool(cwd))

  // MCP tools — connect to all enabled servers
  const mcpRegistry = new McpRegistry(configDir)
  await mcpRegistry.load()
  const mcpTools = await mcpRegistry.connectAll()
  for (const tool of mcpTools) {
    registry.register(tool)
  }

  const executor = new ToolExecutor(registry, config.permissionMode)

  const loop = new AgentLoop({
    provider,
    model: modelId,
    tools: registry.list(),
    maxTurns: config.maxTurns,
    ...(resolvedSystemPrompt !== undefined ? { systemPrompt: resolvedSystemPrompt } : {}),
    ...(initialSession !== undefined ? { initialMessages: initialSession.messages } : {}),
    onConfirm: async (req) => {
      return new Promise<boolean>((resolve) => {
        executor.emit('confirm', { ...req, resolve })
      })
    },
  })

  const sessionManager = new SessionManager(sessionDir)

  return { loop, sessionManager, configManager, mcpRegistry, resolvedModel: modelId, resolvedProvider: providerName }
}
