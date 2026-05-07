# Quickstart

```bash
# 1. install
npm i -g arix     # or: brew install amirtechai/arix/arix

# 2. point it at a provider you have a key for
export ANTHROPIC_API_KEY=sk-ant-…
arix config set provider anthropic
arix config set model claude-sonnet-4-6

# 3. chat
arix chat
```

That's it. Three commands, you're in.

## Common next steps

```bash
# add MCP servers
arix mcp install github postgres playwright --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_…

# discover bundled skills
arix skill list

# run tests with the test_runner tool
# (the agent calls it automatically — or invoke directly via tools API)

# multi-repo workspace
arix workspace create monorepo ~/code/web ~/code/api ~/code/shared

# track a feature
arix spec features/login.md
arix drift check --all          # run in CI
```

## Cost control

```bash
arix cost preflight "refactor the auth module" --max-output 4096
arix cost regression --factor 2     # alert if this week is 2× prior
arix cost by-skill                  # spend grouped per skill tag
```

## Privacy

```bash
arix redact session.log --check     # secrets scan; CI-friendly
arix config set privacy.localProvider ollama   # auto-route sensitive payloads local
```

## Reversible

```bash
arix undo --list
arix undo                           # rolls back the last destructive tool call
```
