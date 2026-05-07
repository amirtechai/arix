# Arix

> Provider-agnostic AI coding assistant for the terminal — bring your own model.

Arix lets you chat with any LLM (Anthropic Claude, OpenAI, Ollama, OpenRouter, Gemini, Azure, Bedrock, Vertex) from the command line while keeping full control over your data, keys, and tools.

## Features

| Feature | Description |
|---------|-------------|
| **Multi-provider** | Anthropic · OpenAI · Ollama · OpenRouter · Gemini · Azure · Bedrock · Vertex |
| **Smart routing** | Auto-fallback to next provider; per-task model selection |
| **Tool execution** | Read/Write/Edit files, Grep, Glob, Shell, Git, Web — agent loop built in |
| **Auto-fix loop** | `arix fix` runs an autonomous bug-fix cycle |
| **Terminal UI** | Ink-based TUI with diff viewer, file explorer, session picker |
| **Dashboard** | Local web UI on `localhost:3000` for session history and cost tracking |
| **Cost ledger** | Per-session USD tracking with daily and per-model breakdowns |
| **Skills** | Installable skill packages extend agent capabilities |
| **Plugin system** | MCP-compatible plugin marketplace |
| **VS Code extension** | Sidebar chat, CodeLens actions, semantic search |
| **gRPC server** | Headless server mode for IDE and CI/CD integration |
| **Wiki** | Knowledge base with full-text search |
| **Shell completions** | Bash · Zsh · Fish completions included |

## Installation

```bash
npm install -g @arix-code/cli
```

Or build from source:

```bash
git clone https://github.com/amirtechai/arix.git
cd arix
pnpm install
pnpm build
npm link packages/cli
```

## Quick Start

```bash
# Configure a provider
arix config set provider anthropic
arix config set anthropic.apiKey sk-ant-...

# Start a chat session
arix chat

# Run with a specific model
arix chat --model anthropic/claude-sonnet-4-6

# Use Ollama locally
arix chat --model ollama/qwen2.5-coder:7b
```

## Configuration

Arix stores config at `~/.config/arix/config.json`.

```json
{
  "provider": "anthropic",
  "model": "anthropic/claude-sonnet-4-6",
  "anthropic": {
    "apiKey": "sk-ant-..."
  },
  "openai": {
    "apiKey": "sk-..."
  },
  "ollama": {
    "baseUrl": "http://localhost:11434"
  },
  "openrouter": {
    "apiKey": "sk-or-..."
  }
}
```

## Providers

| Provider | Model format | Required config |
|----------|-------------|-----------------|
| Anthropic | `anthropic/claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai/gpt-4o` | `OPENAI_API_KEY` |
| OpenRouter | `openrouter/deepseek/r1` | `OPENROUTER_API_KEY` |
| Ollama | `ollama/qwen2.5-coder:7b` | `ollama.baseUrl` (default: localhost:11434) |
| Gemini | `gemini/gemini-2.0-flash` | `GEMINI_API_KEY` |
| Azure OpenAI | `azure/gpt-4o` | `AZURE_OPENAI_API_KEY` + endpoint |
| AWS Bedrock | `bedrock/anthropic.claude-3-5` | AWS credentials |
| Google Vertex | `vertex/claude-3-5-sonnet` | GCP credentials |

Use the interactive setup wizard to configure any provider:

```bash
arix provider setup
```

## Shell Completions

```bash
# Bash
arix completions bash >> ~/.bashrc

# Zsh
arix completions zsh >> ~/.zshrc
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions.

## License

MIT
