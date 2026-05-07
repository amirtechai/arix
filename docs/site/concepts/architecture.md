# Architecture

```
                         ┌─────────────────────────┐
                         │    arix (CLI binary)    │
                         └──────────┬──────────────┘
                                    │
                       ┌────────────┴────────────┐
                       │                         │
            ┌──────────▼─────┐         ┌────────▼────────┐
            │  @arix/cli     │         │  @arix/tui      │ (Ink)
            │  Commander     │         │                 │
            └────────┬───────┘         └────────┬────────┘
                     │                          │
                     └────────┬─────────────────┘
                              │
                  ┌───────────▼────────────┐
                  │     @arix/core         │
                  │ ──────────────────     │
                  │ AgentLoop · Router     │
                  │ Skills · Sessions      │
                  │ MCP client/registry    │
                  │ Cost · Cache · Undo    │
                  │ Spec · Workspace       │
                  │ Tracer · Audit         │
                  └─┬───────┬─────────┬────┘
                    │       │         │
       ┌────────────▼┐ ┌────▼─────┐ ┌─▼──────────┐
       │ @arix/      │ │ @arix/   │ │ @arix/     │
       │ providers   │ │ tools    │ │ server     │ (gRPC, optional)
       │ (21 of them)│ │ (~25)    │ │            │
       └─────────────┘ └──────────┘ └────────────┘
                    │
            ┌───────▼──────────┐
            │  Real APIs:      │
            │  Anthropic …     │
            │  OpenAI …        │
            │  Ollama (local)  │
            └──────────────────┘
```

## Key invariants

1. **No package depends on a higher one.** `core` is a leaf; `cli`/`tui` are the apps; `tools` and `providers` are siblings.
2. **AgentLoop is provider-shaped, not provider-specific.** Every provider lowers to `chat(ChatRequest) → AsyncIterable<StreamChunk>`.
3. **Tools are typed JSON-schema interfaces.** `Tool#execute` returns `ToolResult` regardless of source (built-in, plugin, MCP-adapted).
4. **All persistence lives in `~/.arix/`.** Sessions, costs, MCP config, undo stack, workspaces, specs, audit log, OTLP spans.
5. **Provider responses must be content-blocks.** No string-only fallbacks; tool use is first-class.

## Lifecycle of a turn

```
user input
   ↓
[optional planTurn(): plan-only LLM call]
   ↓
predictiveRoute() decides provider/model
   ↓
classifyPayload() may swap to local on PII
   ↓
annotateForCache() marks cache breakpoints
   ↓
provider.chat()  ──→  StreamChunk*
   ↓
toolCalls? → ToolResultCache.wrap → execute → UndoStack.snapshot (write tools)
   ↓
costTracker.record() → HardBudget.check() → BudgetExceededError? graceful stop
   ↓
[optional reflectTurn(): self-critique]
   ↓
session.save() → AuditLog.append() → tracer.flush()
```

Every step is opt-in via `AgentLoopOptions`. The default loop is identical to v0.1 — additions are additive.
