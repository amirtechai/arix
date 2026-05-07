# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-19

### Added

#### Core (`@arix-code/core`)
- AgentLoop, ContextManager, ModelRouter, ProviderRegistry with lazy loading
- LogManager with ANSI colors, sensitive-field scrubbing, log rotation
- Global error handlers (uncaughtException, unhandledRejection)
- ConfigManager with in-memory cache, `fs.watch()` invalidation, and provider-specific config storage (`setProviderConfig`, `getProviderConfig`, `resolveApiKeyAsync`)
- SkillRegistry for installable agent skill packages
- SessionManager for persisting and querying conversation history
- CostTracker writing to `~/.arix/costs.json`

#### Providers (`@arix-code/providers`)
- Anthropic, OpenAI, OpenRouter adapters
- Ollama adapter with configurable base URL
- Gemini native adapter
- Azure OpenAI, AWS Bedrock, and Google Vertex AI adapters
- FallbackProvider for automatic provider chaining on error

#### Tools (`@arix-code/tools`)
- ReadFileTool, WriteFileTool, EditFileTool, GrepTool, GlobTool, ListDirectoryTool, ShellTool
- Git tools: status, diff, commit, branch
- WebSearchTool and WebFetchTool
- MonitorTool for streaming process output

#### CLI (`@arix-code/cli`)
- Commander.js entry point with `--debug` flag and shell completions (bash/zsh/fish)
- `arix chat` — interactive session with streaming output
- `arix fix` — autonomous bug-fix loop
- `arix loop` — long-running autonomous task loop
- `arix build` — Magic Build mode
- `arix review` — code review command
- `arix serve` — start headless gRPC server
- `arix team` — multi-agent coordinator with shared memory
- `arix provider` — provider setup wizard with API key storage
- `arix models` — list and filter available models with routing
- `arix feature` — feature flag management
- `arix plugin` — plugin install/list/remove
- `arix mcp` — MCP server config management
- `arix wiki` — knowledge base query and indexing
- Smart profile auto-recommendation at startup

#### TUI (`@arix-code/tui`)
- Ink-based terminal UI — DiffViewer, FileExplorer, SessionPicker, CommandPalette, SplitPane

#### Dashboard (`@arix-code/dashboard`)
- Local web dashboard on `localhost:3000`
- Session browser with full message history and markdown export
- Cost ledger with daily and per-model breakdown charts
- Stats overview (sessions, messages, tokens, providers)
- Project memory viewer with inline edit and delete

#### Server (`@arix-code/server`)
- Headless gRPC server (`@grpc/grpc-js`) with ChatService and SessionService
- Proto-defined API at `packages/server/proto/arix.proto`

#### Wiki (`@arix-code/wiki`)
- Markdown knowledge base with full-text search and session indexing

#### VS Code Extension (`@arix-code/vscode-ext`)
- Sidebar panel for chat, file attachment, and session history

### Quality
- 311 tests across 45 test files, all passing
- Strict TypeScript (`exactOptionalPropertyTypes: true`) enforced monorepo-wide
- ESLint + Prettier configured
