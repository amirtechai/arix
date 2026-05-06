# Arix — Master Development TODO

> Production-grade open-source CLI agent system. Claude Code competitor.
> Provider-agnostic, session-persistent, skill-compatible, fully independent.
> Stack: Node.js + TypeScript strict, pnpm monorepo, Ink TUI
> Design spec: `docs/superpowers/specs/2026-04-13-arix-design.md`

---

## MASTER CONTEXT (Her prompt'un başına ekle)

```
You are building Arix — a production-grade open-source CLI agent system.

Arix is FULLY INDEPENDENT. No dependency on ~/.claude/, Claude Code, or Anthropic tooling.
Users can optionally copy Claude Code-compatible skill .md files manually.

Goal:
- Multi-model AI coding agent (Claude Code competitor)
- OpenRouter (300+ models) + Anthropic + OpenAI + Ollama support
- Claude Code-level UX but provider-agnostic
- Plugin-based architecture with skill/tool marketplace roadmap
- Session persistence: arix --resume <session-id> (local JSON storage)
- Ink TUI (terminal UI, React-based)

Stack:
- Node.js + TypeScript (strict mode)
- pnpm workspaces monorepo
- packages: core, providers, tools, cli, tui

Architecture (dependency rules — NEVER violate):
- core → zero external dependencies (pure TypeScript)
- providers → only imports from core
- tools → only imports from core
- cli, tui → can import all packages

Storage: ~/.arix/ (config.json, sessions/, skills/, tools/, memory/)

Constraints:
- No overengineering — build what's needed now
- Production-ready code with error handling
- Strong TypeScript typing (no `any`, no `unknown` without narrowing)
- Every module has a single clear responsibility
- Security-first: path sandboxing, shell blocklist, permission modes
```

---

## PHASE 1 — Core + Providers (Foundation)

### P1-01: Monorepo Bootstrap

```
[MASTER CONTEXT above]

Bootstrap the Arix pnpm monorepo.

Create this exact structure:
arix/
├── packages/
│   ├── core/
│   ├── providers/
│   ├── tools/
│   ├── cli/
│   └── tui/
├── apps/
│   └── arix/          ← binary entry point
├── config/
│   ├── tsconfig.base.json
│   ├── eslint.config.js
│   └── .prettierrc
├── pnpm-workspace.yaml
└── package.json

Requirements:
- pnpm workspaces configured
- tsconfig.base.json: strict, ES2022, NodeNext modules
- Each package has its own tsconfig.json extending base
- ESLint: @typescript-eslint/recommended + import rules
- Prettier: single quotes, 2 spaces, trailing commas
- Build: tsup (each package builds independently)
- Each package: src/index.ts as entry, dist/ as output
- Root package.json: build:all, test:all, lint:all scripts

Output: all config files with correct content. No placeholder TODOs.
```

---

### P1-02: Core Types + Interfaces

```
[MASTER CONTEXT above]

Define all shared TypeScript types and interfaces for @arix/core.

File: packages/core/src/types.ts

Include:
1. Message: { role: 'user' | 'assistant' | 'system', content: string, id?: string, timestamp?: number }
2. StreamChunk: { text?: string; toolCall?: ToolCall; done: boolean; error?: string }
3. ToolCall: { id: string; name: string; input: Record<string, unknown> }
4. ToolResult: { toolCallId: string; success: boolean; output: string; error?: string }
5. ModelInfo: { id: string; name: string; contextLength: number; supportsTools: boolean; supportsVision: boolean; pricing?: { input: number; output: number } }
6. ChatRequest: { model: string; messages: Message[]; tools?: ToolDefinition[]; maxTokens?: number; temperature?: number; systemPrompt?: string }
7. ToolDefinition: { name: string; description: string; inputSchema: JSONSchema }
8. TaskType: 'coding' | 'reasoning' | 'cheap' | 'fast' | 'local' | 'long-context'
9. PermissionMode: 'safe' | 'standard' | 'auto'

Also define:
- JSONSchema type (minimal, sufficient for tool schemas)
- ArixError class extending Error with { code: string; provider?: string; retryable: boolean }

All types exported from packages/core/src/index.ts
No `any` types. Use discriminated unions where appropriate.
```

---

### P1-03: Provider Interface + BaseProvider

```
[MASTER CONTEXT above]

Implement the Provider interface and BaseProvider abstract class in @arix/core.

File: packages/core/src/provider/index.ts

Provider interface:
interface Provider {
  readonly id: string
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>>
  supportsTools(): boolean
  supportsVision(): boolean
}

BaseProvider abstract class:
- Implements Provider interface
- Abstract methods: listModels(), chat()
- Concrete methods:
  - retry(fn, maxAttempts=3, backoffMs=1000): exponential backoff for retryable errors
  - validateRequest(req: ChatRequest): void — throws ArixError if invalid
  - normalizeMessages(messages: Message[]): Message[] — merge consecutive same-role messages

ProviderRegistry class:
- register(provider: Provider): void
- get(id: string): Provider | undefined
- list(): Provider[]
- getDefault(): Provider — throws if none registered

Export all from packages/core/src/index.ts
Write unit tests in packages/core/src/__tests__/provider.test.ts
```

---

### P1-04: OpenRouter Provider

```
[MASTER CONTEXT above]

Implement the OpenRouter provider in packages/providers/src/openrouter/.

OpenRouter uses OpenAI-compatible API at https://openrouter.ai/api/v1
Auth: Authorization: Bearer <key> header
Models endpoint: GET /models

Features required:
1. API key from constructor or OPENROUTER_API_KEY env var
2. listModels() — fetch from /models, map to ModelInfo[]
3. chat() — POST /chat/completions with stream: true
   - Parse SSE stream (data: {...} lines)
   - Handle [DONE] terminator
   - Map OpenAI stream format → StreamChunk[]
   - Handle tool_calls in stream chunks
4. Error handling:
   - 429 → ArixError with retryable: true
   - 401 → ArixError with code: 'AUTH_ERROR'
   - 5xx → ArixError with retryable: true
5. HTTP timeout: 30s default, configurable
6. No external HTTP libraries — use Node.js built-in fetch (Node 18+)

File structure:
packages/providers/src/openrouter/
├── index.ts         (OpenRouterProvider class)
├── stream.ts        (SSE parser)
├── types.ts         (OpenRouter-specific API types)
└── __tests__/
    └── openrouter.test.ts (mock fetch, test stream parsing)
```

---

### P1-05: Anthropic Provider

```
[MASTER CONTEXT above]

Implement the Anthropic provider in packages/providers/src/anthropic/.

Use the official @anthropic-ai/sdk package.

Features:
1. API key from constructor or ANTHROPIC_API_KEY env var
2. listModels() — return hardcoded current model list (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5)
   with accurate contextLength and pricing values
3. chat() — use client.messages.stream() for streaming
   - Map Anthropic MessageStreamEvent → StreamChunk
   - Handle tool_use content blocks → ToolCall
   - Handle tool_result injection for multi-turn tool use
4. supportsTools(): true
5. supportsVision(): true
6. Error mapping: Anthropic SDK errors → ArixError

File structure:
packages/providers/src/anthropic/
├── index.ts
├── mapper.ts        (Anthropic types → Arix types)
└── __tests__/
    └── anthropic.test.ts
```

---

### P1-06: Ollama Provider (Local LLM)

```
[MASTER CONTEXT above]

Implement the Ollama provider for local LLMs in packages/providers/src/ollama/.

Ollama API: http://localhost:11434 (configurable)
OpenAI-compatible at /v1/chat/completions

Features:
1. Base URL from constructor or OLLAMA_BASE_URL env var (default: http://localhost:11434)
2. listModels() — GET /api/tags, map to ModelInfo[]
3. chat() — POST /v1/chat/completions with stream: true (OpenAI format)
4. isAvailable(): Promise<boolean> — ping /api/tags, return false if connection refused
   (Ollama may not be running — fail gracefully, never throw on unavailable)
5. supportsTools(): true (for models that support it)
6. supportsVision(): false (default, can be overridden per model)

Note: Ollama models are free (pricing: { input: 0, output: 0 })

File structure:
packages/providers/src/ollama/
├── index.ts
└── __tests__/
    └── ollama.test.ts
```

---

### P1-07: OpenAI Provider

```
[MASTER CONTEXT above]

Implement the OpenAI provider in packages/providers/src/openai/.

Use the official openai npm package.

Features:
1. API key from constructor or OPENAI_API_KEY env var
2. listModels() — fetch from /models, filter to chat-capable models
3. chat() — use client.chat.completions.create with stream: true
4. Map OpenAI stream format → StreamChunk
5. Handle tool_calls in stream
6. supportsTools(): true
7. supportsVision(): true (for gpt-4o and newer)

Same structure as Anthropic provider.
```

---

### P1-08: Model Registry

```
[MASTER CONTEXT above]

Implement ModelRegistry in packages/core/src/registry/.

Responsibilities:
- Map logical TaskType roles to specific model IDs
- Load from ~/.arix/config.json "models" section
- Support runtime override

Interface:
class ModelRegistry {
  constructor(config: ModelRoleConfig)
  
  // Get model ID for a role
  getModel(role: TaskType): string
  
  // Override a role at runtime
  setModel(role: TaskType, modelId: string): void
  
  // Parse model ID into { provider, model } parts
  // 'openrouter/anthropic/claude-sonnet-4-5' → { provider: 'openrouter', model: 'anthropic/claude-sonnet-4-5' }
  // 'anthropic/claude-sonnet-4-5' → { provider: 'anthropic', model: 'claude-sonnet-4-5' }
  // 'ollama/qwen2.5-coder:7b' → { provider: 'ollama', model: 'qwen2.5-coder:7b' }
  parseModelId(modelId: string): { provider: string; model: string }
}

Default role config (used when not in config.json):
{
  coding: 'anthropic/claude-sonnet-4-6',
  reasoning: 'openrouter/openai/o3',
  cheap: 'openrouter/google/gemma-3-4b-it',
  fast: 'openrouter/meta-llama/llama-3.1-8b-instruct',
  local: 'ollama/qwen2.5-coder:7b',
  'long-context': 'openrouter/anthropic/claude-opus-4-6'
}

Write unit tests.
```

---

### P1-09: Model Router

```
[MASTER CONTEXT above]

Implement ModelRouter in packages/core/src/router/.

ModelRouter selects the right provider + model for a given request.
It uses ModelRegistry for role-based selection and ProviderRegistry for provider access.

Decision logic (in order):
1. Explicit model override in request? → use it directly
2. Context token count > 90,000? → use 'long-context' role
3. Request has tool definitions? → verify selected model supports tools, else upgrade
4. Task type hint provided? → use matching role
5. Default → 'coding' role

Fallback logic:
- Try selected provider
- If provider throws ArixError with retryable: true → try next in fallback chain
- Fallback chain from config: ['anthropic', 'openrouter', 'ollama']
- If all fail → throw ArixError with all errors aggregated

Interface:
class ModelRouter {
  constructor(registry: ModelRegistry, providers: ProviderRegistry, fallbackChain: string[])
  
  async route(req: RouterRequest): Promise<{ provider: Provider; model: string }>
}

interface RouterRequest {
  messages: Message[]
  taskType?: TaskType
  modelOverride?: string      // 'fast' (role) or 'openrouter/deepseek/deepseek-r2' (explicit)
  requiresTools?: boolean
}

Write unit tests covering all decision paths.
```

---

## PHASE 2 — Tools + CLI

### P2-01: Tool Base System

```
[MASTER CONTEXT above]

Implement the tool base system in packages/tools/src/base/.

Tool interface (already in core/types.ts — import from there):
- Tool interface with name, description, inputSchema, execute()

ToolRegistry class:
- register(tool: Tool): void
- get(name: string): Tool | undefined
- list(): Tool[]
- toDefinitions(): ToolDefinition[]   ← used when sending to LLM

ToolExecutor class:
- constructor(registry: ToolRegistry, mode: PermissionMode)
- async execute(call: ToolCall): Promise<ToolResult>
- async requiresConfirmation(call: ToolCall): Promise<boolean>
  - 'safe' mode: always false (but only read tools registered)
  - 'standard' mode: write_file, git_commit, shell_exec → true
  - 'auto' mode: always false

ToolConfirmationRequest type (emitted as event for TUI to handle):
{ tool: string; input: Record<string, unknown>; resolve: (approved: boolean) => void }

Use Node.js EventEmitter for confirmation requests.
Write unit tests.
```

---

### P2-02: File System Tools

```
[MASTER CONTEXT above]

Implement file system tools in packages/tools/src/fs/.

Tools to implement:
1. read_file: { path: string } → reads file, returns content as string
2. write_file: { path: string; content: string; createDirs?: boolean } → writes file
3. list_directory: { path: string; recursive?: boolean } → returns file tree

SECURITY — Path sandbox (mandatory, no exceptions):
- resolve path relative to cwd (passed in constructor)
- reject any path that resolves outside allowedPaths
- allowedPaths: string[] — cwd by default, extendable via config
- throw ArixError with code: 'PATH_FORBIDDEN' if outside allowed paths
- never follow symlinks outside sandbox

Implementation notes:
- Use Node.js fs/promises throughout (no sync)
- read_file: handle binary files gracefully (return base64 with mime type)
- list_directory: respect .gitignore if present (use ignore package)
- write_file: create parent directories if createDirs: true

Write unit tests including path traversal attack scenarios.
```

---

### P2-03: Shell Execution Tool

```
[MASTER CONTEXT above]

Implement secure shell execution in packages/tools/src/shell/.

Tool: shell_exec: { command: string; cwd?: string; timeout?: number }

Security requirements (ALL mandatory):
1. Blocklist — always reject these patterns (regex match on full command):
   - rm -rf / or rm -rf ~
   - sudo (any usage)
   - curl ... | (ba)sh or wget ... | (ba)sh
   - chmod -R 777 /
   - dd if=... of=/dev/
   - mkfs.*
   - :(){ :|:& };: (fork bomb)
2. Timeout: default 30s, max 120s, configurable
3. Output capture: stdout + stderr combined, max 50KB (truncate with notice)
4. Working directory: must be within allowedPaths (same sandbox as fs tools)
5. Environment: inherit process.env but strip sensitive vars (API keys matching /KEY|SECRET|TOKEN|PASS/)

Implementation:
- Use Node.js child_process.spawn (not exec, to avoid shell injection via command concatenation)
- Parse command into argv array using shell-quote package (prevents injection)
- Return: { stdout, stderr, exitCode, timedOut }

Write unit tests including blocklist bypass attempts.
```

---

### P2-04: Git Tools

```
[MASTER CONTEXT above]

Implement git tools in packages/tools/src/git/.

Tools:
1. git_status: {} → parsed status (staged, unstaged, untracked files)
2. git_diff: { staged?: boolean; file?: string } → diff output (max 100KB)
3. git_commit: { message: string; files?: string[] } → commit hash
4. git_branch: { action: 'list' | 'current' | 'create'; name?: string } → branch info

Implementation:
- Use simple-git npm package (type-safe git operations)
- All operations run in cwd (passed in constructor)
- git_commit: if files provided, stage only those files; else commit already-staged
- Never force push, never reset --hard, never delete branches
- Return structured data (not raw strings) for status and branch

Write unit tests using simple-git's mocking support.
```

---

### P2-05: Context Manager

```
[MASTER CONTEXT above]

Implement ContextManager in packages/core/src/context/.

Responsibilities:
- Maintain conversation message history
- Count tokens (estimation, not exact)
- Apply windowing when approaching model context limit
- Inject system prompt and memory

Interface:
class ContextManager {
  constructor(config: ContextConfig)
  
  addMessage(msg: Message): void
  addToolResult(result: ToolResult): void
  getMessages(modelContextLength: number): Message[]
    // applies windowing: keep system prompt + recent messages that fit
    // always keep last 20 messages minimum
  
  getTokenCount(): number    // estimated
  clear(): void
  export(): Message[]        // full history, no windowing
}

Token counting:
- Use tiktoken-lite package for estimation
- Fallback: (characters / 4) as rough estimate
- Count all messages including system prompt

Windowing strategy when approaching limit (80% of model's context):
1. Always keep system prompt
2. Keep last N messages that fit within budget
3. Prepend summary marker: "--- Earlier conversation summarized ---"
   (actual summarization is a future feature — just truncate for now)

Write unit tests for windowing behavior.
```

---

### P2-06: Session Manager

```
[MASTER CONTEXT above]

Implement SessionManager in packages/core/src/session/.

Storage: ~/.arix/sessions/

Session file: <uuid>.json (full session data)
Index file: ~/.arix/sessions/index.json (lightweight list for arix sessions command)

Interface:
class SessionManager {
  constructor(storageDir: string)
  
  async create(metadata: SessionMetadata): Promise<Session>
  async save(session: Session): Promise<void>        // write to disk after each turn
  async load(id: string): Promise<Session>            // exact UUID
  async find(prefix: string): Promise<Session[]>      // fuzzy prefix match
  async loadLatest(): Promise<Session | null>
  async list(): Promise<SessionSummary[]>             // from index.json
  async delete(id: string): Promise<void>
  async export(id: string, outputPath: string): Promise<void>
  
  // Auto-generate title from first user message (first 60 chars)
  generateTitle(firstMessage: string): string
}

Session type:
{
  id: string                 // UUID v4
  createdAt: string          // ISO 8601
  updatedAt: string
  title: string
  cwd: string
  provider: string
  model: string
  messages: Message[]
  toolCalls: ToolCall[]
  tokenUsage: { input: number; output: number }
}

Write atomically (write to .tmp then rename) to prevent corruption.
Write unit tests including concurrent write scenarios.
```

---

### P2-07: Agent Loop

```
[MASTER CONTEXT above]

Implement AgentLoop in packages/core/src/agent/.

AgentLoop is the main orchestrator. It runs the agentic loop:
1. Add user message to context
2. Route to provider via ModelRouter
3. Stream response, collect chunks
4. If response contains tool calls:
   a. Execute each tool via ToolExecutor
   b. Add tool results to context
   c. Loop back to step 2
5. If no tool calls: final response, emit 'done'
6. Save session after each turn

Interface:
class AgentLoop extends EventEmitter {
  constructor(config: AgentConfig)
  
  async run(userMessage: string): AsyncIterable<AgentEvent>
  interrupt(): void     // stop current generation
}

AgentEvent union type:
- { type: 'text'; chunk: string }
- { type: 'tool_start'; call: ToolCall }
- { type: 'tool_result'; result: ToolResult }
- { type: 'tool_confirm'; request: ToolConfirmationRequest }
- { type: 'done'; session: Session }
- { type: 'error'; error: ArixError }

Max tool call iterations: 10 (configurable, prevents infinite loops)
Session auto-saved after each complete turn.

Write unit tests mocking provider and tools.
```

---

### P2-08: Config System

```
[MASTER CONTEXT above]

Implement the configuration system in packages/core/src/config/.

Config file location: ~/.arix/config.json

Full config schema (TypeScript type + JSON schema):
{
  providers: {
    openrouter?: { apiKey: string; baseUrl?: string; timeout?: number }
    anthropic?: { apiKey: string; timeout?: number }
    openai?: { apiKey: string; baseUrl?: string; timeout?: number }
    ollama?: { baseUrl: string }
  }
  models: {
    coding?: string
    reasoning?: string
    cheap?: string
    fast?: string
    local?: string
    'long-context'?: string
  }
  fallback: string[]           // provider ID order
  tools: {
    allowedPaths?: string[]
    shell: {
      timeout: number
      blockedCommands?: string[]
      requireConfirmation: boolean
    }
  }
  memory: {
    enabled: boolean
    projectMemory: boolean
  }
  ui: {
    theme?: 'default' | 'minimal'
    showTokenUsage: boolean
  }
}

ConfigManager class:
- load(): Promise<ArixConfig>           // merge file + env vars + defaults
- save(config: Partial<ArixConfig>): Promise<void>
- get<T>(path: string): T                  // dot-notation path access
- set(path: string, value: unknown): Promise<void>

Env var overrides (higher priority than config file):
- OPENROUTER_API_KEY → providers.openrouter.apiKey
- ANTHROPIC_API_KEY → providers.anthropic.apiKey
- OPENAI_API_KEY → providers.openai.apiKey
- OLLAMA_BASE_URL → providers.ollama.baseUrl

Never write API keys to config.json if they came from env vars.
Write unit tests.
```

---

### P2-09: CLI Foundation

```
[MASTER CONTEXT above]

Implement the CLI in packages/cli/src/.

Use commander (not yargs) for command parsing.

Commands:

arix chat [message]
  --model <id-or-role>    override model (e.g., 'fast' or 'openrouter/deepseek/...')
  --mode <safe|standard|auto>   permission mode
  --no-tui                plain text output (no Ink TUI)
  --system <text>         custom system prompt

arix run <file>
  --model, --mode (same as chat)

arix --resume [session-id-prefix]
  (shorthand: arix -r [prefix])

arix sessions [list|rm|export]
  list: table output (id, title, date, model, tokens)
  rm <id>: delete with confirmation prompt
  export <id> [output-path]: export to JSON

arix model list [--provider <id>]
arix model set <role> <model-id>

arix config show
arix config set <path> <value>
arix config get <path>

arix skills list
arix skills install <path>

arix tools list
arix tools install <github-user/repo>

Entry point: packages/cli/src/index.ts
Binary in apps/arix/src/index.ts → imports cli package

Plain text output (--no-tui) must work independently of tui package.
Write integration tests for command parsing.
```

---

## PHASE 3 — Ink TUI

### P3-01: TUI App Shell

```
[MASTER CONTEXT above]

Implement the Ink TUI app shell in packages/tui/src/.

Layout:
┌─────────────────────────────────────────────────────────┐
│ StatusBar: Arix | session title | model | token count │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ChatPane (scrollable message history)                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ InputBar: > _ (multiline support)            [?][ctrl]  │
└─────────────────────────────────────────────────────────┘

Components:
- <App> root component (manages state, wires AgentLoop events)
- <StatusBar> — session title, model, token count, mode indicator
- <ChatPane> — scrollable, shows Message and ToolCall items
- <InputBar> — text input, Enter to submit, Shift+Enter for newline
- <ToolConfirmPane> — modal overlay for tool approval
- <Spinner> — streaming in progress indicator

Key bindings (use ink's useInput):
- Ctrl+C → interrupt / exit
- Ctrl+R → open SessionPicker overlay
- Ctrl+M → open ModelPicker overlay
- Ctrl+T → focus ToolConfirmPane (if pending)
- / prefix in input → slash command mode

Use ink v5 (React 18 compatible).
Use ink-text-input for InputBar.
Use chalk for coloring.

All components in packages/tui/src/components/
Hooks in packages/tui/src/hooks/
```

---

### P3-02: Streaming Renderer

```
[MASTER CONTEXT above]

Implement streaming text rendering in the TUI.

The challenge: stream text character by character as it arrives from AgentLoop 'text' events,
render tool calls with their inputs and results, handle interruption cleanly.

Requirements:
1. useStream hook: subscribes to AgentLoop AsyncIterable<AgentEvent>
   - buffers text chunks, triggers re-render
   - handles tool_start (show tool name + spinner)
   - handles tool_result (replace spinner with result)
   - handles tool_confirm (pause stream, show confirmation modal)
   - handles done/error

2. Message rendering:
   - User messages: right-aligned or prefixed with "> "
   - Assistant text: left-aligned, syntax highlighting for code blocks (use cli-highlight)
   - Tool calls: box with tool name + truncated input + result/spinner
   - Error messages: red, with error code

3. Performance:
   - Batch re-renders (don't re-render per character — buffer 50ms)
   - Virtual scrolling not needed for MVP (Ink handles overflow)

File: packages/tui/src/hooks/useStream.ts
File: packages/tui/src/components/MessageRenderer.tsx
```

---

### P3-03: Session Picker

```
[MASTER CONTEXT above]

Implement session picker overlay for Ctrl+R in TUI.

Features:
- Fuzzy search across session titles (use fuse.js)
- Shows: title, date (relative: "2h ago"), model, token count
- Arrow keys to navigate
- Enter to select (resumes session)
- Escape to cancel

Component: packages/tui/src/components/SessionPicker.tsx

Input: SessionSummary[] from SessionManager.list()
Output: selected session ID or null
```

---

## PHASE 4 — Session Resume + Memory

### P4-01: Session Resume Flow

```
[MASTER CONTEXT above]

Implement complete session resume flow end-to-end.

arix --resume f7aa3c52 should:
1. SessionManager.find('f7aa3c52') → find matching session
2. If multiple matches → show TUI picker
3. Load session → inject messages into ContextManager
4. Initialize AgentLoop with restored context
5. TUI shows previous messages (scrolled to bottom)
6. Status bar shows "Resumed: <title>"
7. User can continue conversation from where they left off

Edge cases to handle:
- Session file corrupted (JSON parse error) → show error, offer to start fresh
- Provider in session no longer configured → warn but use current default provider
- Model in session no longer available → warn but use current default model
- Session from different cwd → warn user (different directory) but still resume

Implement in: packages/cli/src/commands/resume.ts
Integration test: create session, exit, resume, verify messages present.
```

---

### P4-02: Memory Injection

```
[MASTER CONTEXT above]

Implement memory injection into context on session start.

Memory sources (in priority order, lower = prepended earlier in system prompt):
1. ~/.arix/memory/MEMORY.md — global user memory
2. ~/.arix/memory/projects/<md5(cwd)>.md — project-specific memory

Memory injection:
- Load memory files at session start
- Append to system prompt as: "--- User Memory ---\n<content>"
- If combined memory > 2000 tokens, truncate oldest entries (project memory preserved over global)

Auto-memory write (end of session):
- After session ends, agent optionally writes important facts to memory
- Triggered by: arix config set memory.autoSave true
- Agent uses write_file tool on memory files (subject to normal confirmation)

MemoryManager class in packages/core/src/memory/:
- load(cwd: string): Promise<string>     returns combined memory string
- getProjectPath(cwd: string): string    deterministic path from cwd hash

Write unit tests.
```

---

## PHASE 5 — Skills + Plugins

### P5-01: Skill Loader

```
[MASTER CONTEXT above]

Implement the skill system in packages/core/src/skills/.

Skills are .md files in ~/.arix/skills/ with frontmatter:
---
name: flutter-expert
description: Flutter, Dart, widget, state, animations
trigger: flutter dart widget riverpod
---
<skill content injected into system prompt when triggered>

SkillManager class:
- load(): Promise<Skill[]>             scan ~/.arix/skills/*.md
- find(query: string): Skill[]         match by name or trigger keywords
- install(sourcePath: string): Promise<void>   copy .md to skills dir
- uninstall(name: string): Promise<void>
- toSystemPrompt(skills: Skill[]): string   format for injection

Skill auto-detection (optional, off by default):
- Analyze user's first message for trigger keywords
- If match found: suggest "Skill 'flutter-expert' available. Use /skill flutter-expert to activate."

Manual activation: user types /skill <name> in chat

Skill content is injected as additional system context, not replacing main system prompt.

arix skills list → table: name, description, trigger, size
arix skills install <path> → copies file, validates frontmatter
```

---

### P5-02: Custom Tool Loader

```
[MASTER CONTEXT above]

Implement custom tool loading from ~/.arix/tools/.

Custom tool structure:
~/.arix/tools/<tool-name>/
├── tool.json     { name, description, inputSchema, version, author }
└── tool.js       CommonJS module exporting: { execute(input): Promise<ToolResult> }

PluginToolLoader class:
- async load(toolsDir: string): Promise<Tool[]>
  - scan subdirectories
  - validate tool.json schema
  - require() tool.js in sandbox (Node.js vm module for basic isolation)
  - wrap in Tool interface
- async install(source: string): Promise<void>
  - source: local path or 'github:user/repo'
  - for GitHub: fetch tarball from github API, extract, validate
  - verify tool.json and tool.js present before installing

Security for custom tools:
- vm sandbox with restricted require (only allow: path, fs, https, child_process)
- timeout: 30s max execution
- Output size limit: 100KB

arix tools install github:user/arix-tool-sqlite → installs to ~/.arix/tools/
```

---

## PHASE 6 — Polish + Performance

### P6-01: Error Handling + Logging

```
[MASTER CONTEXT above]

Implement global error handling and logging system.

Logger (packages/core/src/logger/):
- Levels: debug, info, warn, error
- Output: CLI-friendly (chalk colored), structured JSON to file
- Log file: ~/.arix/logs/arix-<date>.log (rotate daily, keep 7 days)
- Debug mode: XCLAUDE_DEBUG=1 env var or --debug flag
- Never log: API keys, passwords, tokens (strip from log output)

Global error handling:
- Uncaught exceptions: log + show user-friendly message + exit 1
- Unhandled rejections: same
- Provider errors: map to user-facing messages:
  - AUTH_ERROR → "API key invalid. Run: arix config set providers.<name>.apiKey <key>"
  - RATE_LIMIT → "Rate limit hit. Trying fallback provider..."
  - CONTEXT_TOO_LONG → "Conversation too long. Starting compression..."

LogManager singleton in packages/core/src/logger/index.ts
Used throughout all packages via import { logger } from '@arix/core'
```

---

### P6-02: Performance Optimizations

```
[MASTER CONTEXT above]

Profile and optimize Arix's performance.

Areas to optimize:
1. Startup time: lazy-load providers (only instantiate when used)
   - Dynamic import() for each provider
   - Target: <200ms to first prompt

2. Stream rendering: batch Ink re-renders
   - Collect stream chunks for 50ms, then render once
   - Avoid re-rendering entire tree per character

3. Session loading: index.json for list operations
   - Never read all session files to list sessions
   - Keep index.json in sync on every save

4. Config caching: in-memory cache with file watcher
   - Don't re-read config.json on every operation
   - Use fs.watch to invalidate cache on change

5. Token counting: cache tiktoken model initialization
   - tiktoken model load is expensive (~100ms)
   - Initialize once, reuse

Measure before and after each optimization.
Document improvements in comments.
```

---

### P6-03: CLI Autocomplete + UX Polish

```
[MASTER CONTEXT above]

Polish CLI UX:

1. Shell autocomplete:
   arix --completions bash >> ~/.bashrc
   arix --completions zsh >> ~/.zshrc
   Generates completion script for all commands + subcommands

2. First-run experience:
   On first run (no config.json):
   - Interactive setup wizard (using @inquirer/prompts)
   - Ask: which provider? → enter API key → test connection → save
   - Show: "Setup complete! Try: arix chat 'Hello'"

3. Error messages — actionable:
   Bad: "Error: ENOENT"
   Good: "File not found: src/foo.ts. Check the path and try again."

4. Streaming output polish:
   - Tool calls: show animated dots while executing
   - Long tool output: collapsed by default, expand on request
   - Code blocks in markdown: syntax highlighted (cli-highlight)

5. --version flag: show version + Node.js version + platform
   arix --version
   → Arix 0.1.0 (Node.js 22.x.x, linux/x64)
```

---

### P6-04: Integration Test Suite

```
[MASTER CONTEXT above]

Create full integration test suite.

Test file: packages/core/src/__tests__/integration/

Tests to write:
1. Provider switching:
   - Mock OpenRouter + Anthropic providers
   - Verify ModelRouter correctly selects based on task type
   - Verify fallback when primary provider fails

2. Tool execution flow:
   - AgentLoop with mock provider that returns tool call
   - Verify tool executed, result injected, loop continues
   - Verify interruption stops loop cleanly

3. Session persistence:
   - Create session, save, reload
   - Verify messages preserved
   - Verify --resume loads correct session
   - Verify fuzzy prefix matching

4. Security (shell + path):
   - Verify path traversal attacks blocked
   - Verify shell blocklist enforced
   - Verify permission modes respected

5. Context windowing:
   - Fill context past limit
   - Verify windowing truncates correctly
   - Verify system prompt always preserved

Use vitest (not Jest) for all tests.
Mock file system with memfs for fs-dependent tests.
```

---

### P6-05: Packaging + Open Source Release

```
[MASTER CONTEXT above]

Prepare Arix for open source release.

1. Package configuration:
   - apps/arix/package.json: bin entry, npm publish config
   - All packages: correct exports fields, types fields
   - Target: `npm install -g arix` works

2. README.md (root):
   - What is Arix (2 sentences)
   - Installation: npm/pnpm/brew
   - Quick start: 3 commands to get running
   - Configuration: API key setup
   - Features table vs Claude Code vs opencode
   - Contributing guide link

3. CONTRIBUTING.md:
   - Dev setup (pnpm install, build, test)
   - Package structure explanation
   - How to add a provider
   - How to add a tool
   - PR guidelines

4. GitHub:
   - .github/workflows/ci.yml: lint + test + build on PR
   - .github/workflows/release.yml: publish to npm on tag
   - Issue templates: bug report, feature request, new provider
   - CHANGELOG.md starter

5. Security:
   - SECURITY.md with responsible disclosure policy
   - Ensure no API keys in any committed file
   - Run: npm audit, fix all high/critical

Output: all files ready for `git push` to public GitHub repo.
```

---

## BONUS MODULES (Post-v1.0)

### B1: Web Dashboard

```
[MASTER CONTEXT above]

Build optional web dashboard for Arix session visualization.

arix dashboard → opens http://localhost:7432 in browser

Features:
- View all sessions with search/filter
- Read-only chat replay (scroll through session)
- Token usage charts per session
- Model usage statistics
- Export sessions as markdown

Stack: Vite + React + TailwindCSS (separate package: packages/dashboard)
Runs as a local Express server, serves static build
Auth: none (localhost only, no external access)

This is optional — arix works 100% without it.
```

---

### B2: Agent Marketplace

```
[MASTER CONTEXT above]

Design the Arix agent/skill marketplace.

arix skills search <query>    → search skills.arix.dev API
arix skills install <name>    → install from marketplace
arix tools search <query>     → search tools
arix tools install <name>     → install from marketplace

API spec for skills.arix.dev:
GET /api/skills?q=flutter&limit=20
GET /api/skills/:name
POST /api/skills (submit new skill)

Community submission:
- GitHub-based submission (PR to arix-skills registry repo)
- Auto-validation: frontmatter check, no malicious content
- Rating system (stars, downloads)

Security:
- Skills are markdown only (no executable code)
- Tools go through manual review before listing
- All tools published with source code link (no binary blobs)

This is a future milestone — design the API contract now, implement later.
```

---

### B3: Ink TUI v2 — Advanced Features

```
[MASTER CONTEXT above]

Enhance Ink TUI with advanced features:

1. Multi-pane layout (optional, toggle with Ctrl+P):
   ┌──────────────────┬────────────────────┐
   │   Chat History   │   File Explorer    │
   │                  │   (working dir)    │
   ├──────────────────┴────────────────────┤
   │              Input Bar                │
   └───────────────────────────────────────┘

2. Command palette (Ctrl+K):
   - Fuzzy search all arix commands
   - Run any command from within chat

3. Diff viewer:
   - When agent modifies files, show inline diff in TUI
   - Approve/reject individual file changes

4. Token budget indicator:
   - Progress bar showing context usage
   - Color: green → yellow → red as context fills

5. Notification system:
   - Non-blocking toasts for: session saved, tool completed, error
   - Bottom-right corner, auto-dismiss after 3s
```

---

## Progress Tracker

| Phase | Status | Target |
|-------|--------|--------|
| P1: Core + Providers | ✅ Done | |
| P2: Tools + CLI | ✅ Done | |
| P3: Ink TUI | ✅ Done | |
| P4: Session + Memory | ✅ Done | |
| P5: Skills + Plugins | ✅ Done | |
| P6: Polish + Release | ✅ Done | |
| B1: Web Dashboard | 🚧 In progress | |
| B2: Marketplace | 📋 TODO (API contract + CLI commands) | |
| B3: TUI v2 | ✅ Done | |

---

## Reference Links

- Design spec: `docs/superpowers/specs/2026-04-13-arix-design.md`
- OpenRouter API: https://openrouter.ai/docs/api/reference/overview
- Ink (TUI): https://github.com/vadimdemedes/ink
- opencode (reference): https://github.com/opencode-ai/opencode
- Claude Code source: https://github.com/anthropics/claude-code
