# Arix

> Provider-agnostic AI coding agent for the terminal.

Arix is a CLI-first coding agent that:

- runs against **21 providers** (Anthropic, OpenAI, Gemini, DeepSeek, xAI, Groq, Cerebras, Perplexity, Mistral, Cohere, Ollama, …) via a unified routing layer
- ships with **12 first-party skills** (TDD, code review, debugger, refactor, security audit, perf, architect, migrator, documenter, i18n, PR author, data engineer)
- speaks **Model Context Protocol** out of the box — install GitHub, Postgres, Playwright, Slack, Linear, Sentry, Figma servers with `arix mcp install <id>`
- has a real **plugin/tool API**, not a sandbox-by-name
- includes **cost-bounded runs**, **spec-driven development**, **multi-repo workspaces**, **reversible runs** (`arix undo`), **eval suite**, **golden-trace replay**, and **privacy-aware routing**

If Cursor is the closed-source IDE play and Aider is the diff-format play, **Arix is the agent runtime that lives where your shell does**.

## What's it for?

- Agent-driven feature work in the terminal — `arix chat`, watch the diff, accept / reject.
- Background loops — `arix loop` runs against a watcher, fixes failing tests until CI is green.
- Spec-first refactors — `arix spec feature.md` parses tasks, tracks drift in CI.
- Multi-repo refactors — `arix workspace create monorepo repo-a repo-b repo-c`.

## Next

→ [Quickstart](./quickstart.md)
→ [Architecture](./concepts/architecture.md)
→ [vs. Cursor / Copilot / Claude Code](./compare.md)
