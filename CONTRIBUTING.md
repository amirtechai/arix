# Contributing to Arix

## Development Setup

**Requirements:** Node.js 22+, pnpm 9+

```bash
git clone https://github.com/your-org/arix.git
cd arix
pnpm install
pnpm build
```

Run tests:

```bash
pnpm test          # all packages
pnpm test:watch    # watch mode
```

Type-check:

```bash
pnpm typecheck
```

Lint:

```bash
pnpm lint
```

## Monorepo Structure

```
packages/
  core/        # AgentLoop, ContextManager, ModelRouter, ProviderRegistry, Logger
  providers/   # Anthropic, OpenAI, Ollama, OpenRouter adapters
  tools/       # File system tools (Read/Write/Edit/Grep/Glob), Shell tool
  tui/         # Ink-based terminal UI components
  cli/         # Commander.js CLI entry point
  dashboard/   # Local web dashboard (Express + React)
```

## Adding a Provider

1. Create `packages/providers/src/<name>/index.ts`
2. Extend `BaseProvider` and implement `chat()`, `listModels()`, `supportsTools()`, `supportsVision()`
3. Register in `packages/providers/src/index.ts`
4. Add tests in `packages/providers/src/__tests__/<name>.test.ts`

```typescript
import { BaseProvider } from '@arix/core'
import type { ChatRequest, StreamChunk, ModelInfo } from '@arix/core'

export class MyProvider extends BaseProvider {
  readonly id = 'myprovider'
  readonly name = 'My Provider'

  supportsTools() { return true }
  supportsVision() { return false }

  async listModels(): Promise<ModelInfo[]> { return [] }

  async chat(req: ChatRequest): Promise<AsyncIterable<StreamChunk>> {
    // implement streaming chat
  }
}
```

## Adding a Tool

1. Create or extend a tool file in `packages/tools/src/`
2. Implement the `Tool` interface from `@arix/core`
3. Export from `packages/tools/src/index.ts`
4. Add tests

```typescript
import type { Tool, ToolResult } from '@arix/core'

export class MyTool implements Tool {
  readonly name = 'my_tool'
  readonly description = 'Does something useful'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: { input: { type: 'string' } },
    required: ['input'],
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const text = input['input'] as string
    return { toolCallId: '', success: true, output: `Result: ${text}` }
  }
}
```

## PR Guidelines

- One logical change per PR
- All tests must pass: `pnpm test`
- No TypeScript errors: `pnpm typecheck`
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`
- Keep diff minimal — don't reformat unrelated code

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
