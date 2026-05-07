# Arix vs. the field

Honest comparison, updated 2026-Q2. Tick = first-class support; ⚠ = partial; — = not supported.

|                                          | Arix | Cursor | Copilot | Claude Code | Aider |
|------------------------------------------|:----:|:------:|:-------:|:-----------:|:-----:|
| Open source                              | ✓    | —      | —       | ⚠ (CLI)     | ✓     |
| CLI-native                               | ✓    | —      | ⚠       | ✓           | ✓     |
| IDE plugin                               | ⚠ VSCode (in progress) | ✓ | ✓ | — | — |
| 20+ providers (incl. local Ollama)       | ✓    | ⚠      | ⚠       | —           | ⚠     |
| MCP server install (one command)         | ✓    | ⚠      | —       | ✓           | —     |
| First-party skill library (12 bundled)   | ✓    | —      | —       | ⚠ (skills)  | —     |
| Multi-repo workspace (cross-repo refactor)| ✓   | ⚠      | —       | —           | —     |
| Spec-driven development + drift watcher  | ✓    | —      | —       | —           | —     |
| Reversible runs (`undo`)                 | ✓    | —      | —       | —           | —     |
| Cost-bounded runs (hard USD cap)         | ✓    | —      | —       | —           | —     |
| Adaptive prompt cache annotation         | ✓    | —      | —       | ✓           | —     |
| Cost arbitrage (auto-downgrade)          | ✓    | —      | —       | —           | —     |
| Privacy-aware routing (local-only on PII)| ✓    | —      | —       | —           | —     |
| Eval suite (`arix eval`)                 | ✓    | —      | —       | —           | —     |
| Golden trace replay                      | ✓    | —      | —       | —           | —     |
| Audit log (tamper-evident)               | ✓    | —      | —       | —           | —     |
| OpenTelemetry tracing                    | ✓    | —      | —       | —           | —     |
| Local-first encryption (AES-GCM)         | ✓    | —      | —       | —           | —     |
| Confidence calibration markers           | ✓    | —      | —       | —           | —     |
| Diff-style edits (token efficient)       | ✓ (apply_diff) | ⚠ | — | ✓ | ✓ (Aider's signature) |

## Where each tool wins

- **Cursor** — best inline editor experience, multi-file context, smooth IDE integration.
- **Copilot** — built into VSCode and JetBrains, polished completions, GitHub-tight.
- **Claude Code** — Anthropic-tuned, the original CLI agent loop.
- **Aider** — the gold standard for diff-format edits and git-integrated workflows.
- **Arix** — neutral runtime: bring any provider, any IDE, any MCP server. Wins on cost control, eval, audit, privacy, multi-repo, and reversibility.

The honest tradeoff: pick Arix when you want **agency over your stack** — provider, hosting, audit trail, budget, evaluation. Pick a hosted IDE tool when you want zero-setup polish and you're committed to its ecosystem.
