# Arix Docs

Public-facing documentation source. Designed to deploy to **docs.arix.amirtech.ai** via Docusaurus or Mintlify; the markdown is provider-neutral.

## Structure

```
site/
├── README.md            ← you are here
├── intro.md             ← landing
├── quickstart.md        ← 3-step install + first chat
├── concepts/
│   ├── architecture.md
│   ├── providers.md
│   ├── skills.md
│   ├── mcp.md
│   ├── workspaces.md
│   ├── spec-driven.md
│   └── cost-control.md
├── reference/
│   └── cli.md           ← every command auto-listed
├── recipes/
│   ├── tdd.md
│   ├── refactor-large-codebase.md
│   ├── multi-repo.md
│   └── ci-drift-watcher.md
└── compare.md           ← vs Cursor / Copilot / Claude Code / Aider
```

## Local preview

This folder is plain markdown — point Docusaurus or Mintlify at it. Suggested CLI:

```bash
npx docusaurus init docs-site classic
# move site/ contents into docs-site/docs/
cd docs-site && npm run start
```

For Mintlify:

```bash
npm i -g mintlify
cd docs/site && mintlify dev
```

## Deployment

The release workflow can deploy this to GitHub Pages or Cloudflare Pages on every push to `main`. See `.github/workflows/docs.yml` (TODO).
