# Arix — System Design Spec
**Date:** 2026-04-13  
**Status:** Approved  
**Author:** brainstorming session

---

## Overview

Arix is a production-grade, open-source CLI agent system. It is a fully independent program — no dependency on `~/.claude/` or any Anthropic tooling. Users can optionally install Claude Code-compatible skills manually.

**Core goal:** Provider-agnostic AI coding agent with Claude Code-level UX, supporting 300+ models via OpenRouter, native Anthropic/OpenAI adapters, and local LLMs via Ollama.

**Differentiators vs Claude Code:**
- Works with any model/provider, not locked to Anthropic
- Session resume: `arix --resume <session-id>`
- Fully local session storage — no cloud sync
- Plugin/tool marketplace (`arix tools install`)
- Compatible skill format (users can copy Claude Code skills manually)

**Differentiators vs opencode:**
- TypeScript ecosystem (lower barrier for community contributions)
- Smart model router with cost-aware fallback
- First-class skill system with marketplace roadmap
- Monorepo architecture — each package independently publishable

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLI / TUI Layer                   │
│  arix chat | run | resume | model | config        │
│  Ink TUI (React terminal renderer)                   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   Core (Agent Engine)                │
│  AgentLoop → ContextManager → SessionManager        │
│  ToolExecutor → StreamHandler                       │
└───────┬──────────────┬──────────────┬───────────────┘
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌────▼──────────────┐
│  Providers   │ │   Tools    │ │   Skills / Plugins  │
│  OpenRouter  │ │ file/shell │ │ ~/.arix/skills/  │
│  Anthropic   │ │ git/search │ │ marketplace         │
│  OpenAI      │ │ custom     │ │ community tools     │
│  Ollama      │ └────────────┘ └────────────────────┘
└──────────────┘
        │
┌───────▼──────────────────────────────────────────────┐
│              Storage Layer (~/.arix/)              │
│  config.json | sessions/<id>.json | skills/ | logs/  │
└──────────────────────────────────────────────────────┘
```

**Data flow:**
1. CLI command → AgentLoop starts
2. ContextManager loads session history (if resuming)
3. ModelRouter selects provider + model
4. Provider streams response chunks
5. ToolExecutor intercepts tool calls, executes, injects results
6. SessionManager persists every turn to `~/.arix/sessions/<id>.json`
7. TUI renders stream in real-time

---

## Package Structure

```
arix/
├── packages/
│   ├── core/                     @arix/core
│   │   ├── agent/                AgentLoop, turn management
│   │   ├── context/              ContextManager, token counting, windowing
│   │   ├── session/              SessionManager, UUID, local JSON storage
│   │   ├── router/               ModelRouter, cost-aware selection, fallback
│   │   ├── registry/             ModelRegistry, role→model mapping
│   │   └── stream/               StreamHandler, SSE parser, chunk assembly
│   │
│   ├── providers/                @arix/providers
│   │   ├── base/                 Provider interface + BaseProvider
│   │   ├── openrouter/           300+ models, OpenAI-compatible endpoint
│   │   ├── anthropic/            Native Anthropic SDK adapter
│   │   ├── openai/               GPT-4o, o3, etc.
│   │   └── ollama/               Local LLM (Llama, Mistral, Qwen)
│   │
│   ├── tools/                    @arix/tools
│   │   ├── base/                 Tool interface, registry, executor
│   │   ├── fs/                   readFile, writeFile, listDir (sandboxed)
│   │   ├── shell/                exec (whitelist + timeout + sandbox)
│   │   └── git/                  status, diff, commit, branch
│   │
│   ├── cli/                      @arix/cli
│   │   ├── commands/             chat, run, resume, model, config, skills
│   │   ├── repl/                 interactive loop, history, autocomplete
│   │   └── output/               plain text renderer (no TUI)
│   │
│   └── tui/                      @arix/tui
│       ├── app/                  Ink root component
│       ├── components/           ChatPane, StatusBar, ToolOutput, Spinner
│       └── hooks/                useStream, useSession, useKeymap
│
├── apps/
│   └── arix/                  Binary entry point
│
└── config/
    ├── tsconfig.base.json
    ├── eslint.config.js
    └── .prettierrc
```

**Dependency rules (strict):**
- `core` → no external package dependencies (pure TypeScript)
- `providers` → depends only on `core`
- `tools` → depends only on `core`
- `cli` and `tui` → can import all packages (outward-facing layer)

---

## Provider Interface

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface StreamChunk {
  text?: string
  toolCall?: ToolCall
  done: boolean
}

interface Provider {
  readonly id: string
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>>
  supportsTools(): boolean
  supportsVision(): boolean
}

interface ChatRequest {
  model: string
  messages: Message[]
  tools?: ToolDefinition[]
  maxTokens?: number
  temperature?: number
}
```

---

## Model Registry + Router

**Config-driven model roles:**
```jsonc
{
  "models": {
    "coding":    "anthropic/claude-sonnet-4-5",
    "reasoning": "openai/o3",
    "cheap":     "openrouter/google/gemma-3-4b",
    "fast":      "openrouter/meta-llama/llama-3.1-8b-instruct",
    "local":     "ollama/qwen2.5-coder:7b"
  },
  "fallback": ["anthropic", "openrouter", "ollama"]
}
```

**Router decision tree:**
1. User `--model` override → use directly
2. Context > 100k tokens → select long-context capable model
3. Request contains tool calls → enforce tool-capable model
4. Task type hint → map to role (coding/reasoning/cheap/fast/local)
5. Provider unavailable → walk fallback chain

---

## Session + Memory System

**Storage layout:**
```
~/.arix/
├── sessions/
│   ├── <uuid>.json        full session (messages, tool calls, token usage)
│   ├── <uuid>.log         raw log
│   └── index.json         session index (id, title, date, model)
├── memory/
│   ├── MEMORY.md          global user memory
│   └── projects/
│       └── <cwd-hash>.md  per-project memory
└── config.json
```

**Session JSON schema:**
```jsonc
{
  "id": "f7aa3c52-d14e-4682-aed2-6dbd6138",
  "createdAt": "2026-04-13T10:23:00Z",
  "updatedAt": "2026-04-13T11:45:00Z",
  "title": "Refactor auth module",
  "cwd": "/home/fatih/myproject",
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4-5",
  "messages": [],
  "toolCalls": [],
  "tokenUsage": { "input": 45230, "output": 8120 }
}
```

**Resume flow:**
- `arix --resume f7aa3c52` → exact UUID match
- `arix --resume f7aa` → fuzzy prefix match, show picker if multiple
- `arix --resume` → resume most recent session
- On load: inject messages into ContextManager, show previous conversation in TUI

---

## Tool System + Security

**Tool interface:**
```typescript
interface Tool {
  readonly name: string
  readonly description: string
  readonly inputSchema: JSONSchema
  execute(input: unknown): Promise<ToolResult>
}
```

**Built-in tools:**

| Tool | Risk Level | Confirmation |
|------|-----------|-------------|
| `read_file` | Low | Never |
| `write_file` | Medium | Standard mode |
| `list_directory` | Low | Never |
| `shell_exec` | High | Always |
| `git_status` | Low | Never |
| `git_diff` | Low | Never |
| `git_commit` | Medium | Standard mode |
| `web_search` | Low | Never |

**Security layers:**
1. **Path sandbox** — only cwd and below by default; `allowedPaths` in config to extend
2. **Shell blocklist** — `rm -rf /`, `sudo`, `curl | sh`, `wget | bash` always blocked
3. **Permission modes:**
   - `--mode safe` — read-only tools only
   - `--mode standard` — write + git with confirmation (default)
   - `--mode auto` — all tools automatic (CI/CD use)

**Custom tools:**
```
~/.arix/tools/<tool-name>/
├── tool.json    (name, description, inputSchema)
└── tool.js      (exports execute() function)
```

---

## CLI Commands

```bash
# Core
arix chat                          # interactive TUI
arix chat "fix the auth bug"       # one-shot task
arix run <file.md>                 # run task from file
arix --resume [session-id]         # resume session

# Models
arix model list                    # list all available models
arix model set coding claude-sonnet-4-5

# Config
arix config set providers.openrouter.apiKey sk-or-...
arix config show

# Sessions
arix sessions                      # list sessions
arix sessions rm <id>
arix sessions export <id>

# Skills & Tools
arix skills list
arix skills install <path|url>
arix tools list
arix tools install github:user/repo
```

---

## Ink TUI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Arix  session: Refactor auth  model: claude-sonnet   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  User: Fix the login validation bug                     │
│                                                         │
│  Assistant: I'll look at the auth module...             │
│  ┌─ Tool: read_file ──────────────────────────────────┐ │
│  │ src/auth/login.ts                                  │ │
│  └────────────────────────────────────────────────────┘ │
│  Found the issue on line 47. Here's the fix...  ▌       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ > _                                          [?] [ctrl] │
└─────────────────────────────────────────────────────────┘
```

**Key bindings:**
- `Ctrl+C` — interrupt / exit
- `Ctrl+R` — session picker (fuzzy search)
- `Ctrl+M` — switch model (runtime)
- `Ctrl+T` — approve/deny tool call
- `/clear`, `/model`, `/export` — slash commands

---

## Skill System

**Storage:** `~/.arix/skills/*.md`

**Format:** Claude Code skill `.md` format (frontmatter + content). 100% compatible — users can copy `.md` skill files from Claude Code or write new ones.

**Install:** `arix skills install <path>` copies to `~/.arix/skills/`

**Marketplace (roadmap):** `arix skills search` → queries skills.arix.dev

---

## Phase Roadmap

| Phase | Scope | Goal |
|-------|-------|------|
| P1 | core + providers | Provider abstraction, model registry, router, OpenRouter + Anthropic |
| P2 | tools + cli | Tool system, security layer, basic CLI (no TUI) |
| P3 | tui | Ink TUI, streaming renderer, key bindings |
| P4 | session/memory | Resume, session persistence, memory injection |
| P5 | skills + plugins | Skill loader, custom tool install, marketplace foundations |
| P6 | polish | Performance, autocomplete, web dashboard, agent marketplace |
