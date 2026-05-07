// Curated catalog of recommended MCP servers, installable via `arix mcp install <name>`.
// Each entry resolves to an McpServerConfig at install time.

import type { McpServerConfig } from './types.js'

export interface McpCatalogEntry {
  /** Short id used by `arix mcp install <id>` */
  id: string
  /** Human-readable name */
  name: string
  /** Short description of what the server provides */
  description: string
  /** Tags for search */
  tags: string[]
  /** Names of env vars the user must provide before connecting */
  requiredEnv?: string[]
  /** Default transport config — env values must be supplied at install time */
  config: Omit<McpServerConfig, 'name' | 'enabled'>
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem (official)',
    description: 'Sandboxed local filesystem access via the official Anthropic MCP server.',
    tags: ['fs', 'core'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Read repos, issues, PRs, file contents, search code via GitHub API.',
    tags: ['vcs', 'collab'],
    requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'GitLab equivalent — projects, issues, merge requests.',
    tags: ['vcs', 'collab'],
    requiredEnv: ['GITLAB_PERSONAL_ACCESS_TOKEN', 'GITLAB_API_URL'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gitlab'],
    },
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Schema introspection + read-only query execution against a Postgres instance.',
    tags: ['db', 'sql'],
    requiredEnv: ['POSTGRES_CONNECTION_STRING'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
    },
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Local SQLite introspection + query execution.',
    tags: ['db', 'sql'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite'],
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Channel/message/user lookup and posting via Slack Bot API.',
    tags: ['collab', 'chat'],
    requiredEnv: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
    },
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Linear ticket system — issues, projects, cycles.',
    tags: ['ticket', 'pm'],
    requiredEnv: ['LINEAR_API_KEY'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-linear'],
    },
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Atlassian Jira issue tracker.',
    tags: ['ticket', 'pm'],
    requiredEnv: ['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-atlassian'],
    },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion pages/databases — search, read, update.',
    tags: ['docs', 'pm'],
    requiredEnv: ['NOTION_API_KEY'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
    },
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Headless browser automation — navigate, click, screenshot, scrape.',
    tags: ['browser', 'web'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    },
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Chromium automation alternative.',
    tags: ['browser', 'web'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
  },
  {
    id: 'memory',
    name: 'Memory (graph)',
    description: 'Persistent knowledge-graph memory — richer than session memory.',
    tags: ['memory'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Structured chain-of-thought scaffolding for complex problems.',
    tags: ['reasoning'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
  },
  {
    id: 'time',
    name: 'Time',
    description: 'Date/time arithmetic, time-zone conversion, scheduling helpers.',
    tags: ['util'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-time'],
    },
  },
  {
    id: 'fetch',
    name: 'Fetch (lightweight)',
    description: 'Lightweight URL → content extractor (markdown).',
    tags: ['web'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Error tracking — issue search, event details, releases.',
    tags: ['ops', 'observability'],
    requiredEnv: ['SENTRY_AUTH_TOKEN'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@sentry/mcp-server'],
    },
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'k8s cluster query — pods, services, deployments, logs.',
    tags: ['ops', 'k8s'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-server-kubernetes'],
    },
  },
  {
    id: 'aws',
    name: 'AWS',
    description: 'AWS CLI wrapper for read-only ops across services.',
    tags: ['cloud'],
    requiredEnv: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-aws'],
    },
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    description: 'gcloud wrapper for project/resource inspection.',
    tags: ['cloud'],
    requiredEnv: ['GOOGLE_APPLICATION_CREDENTIALS'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-gcp'],
    },
  },
  {
    id: 'azure',
    name: 'Azure',
    description: 'Azure CLI wrapper.',
    tags: ['cloud'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-azure'],
    },
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Design token export, frame inspection, asset extraction.',
    tags: ['design'],
    requiredEnv: ['FIGMA_ACCESS_TOKEN'],
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'figma-mcp'],
    },
  },
]

export function findMcpEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id)
}

/** Materialise a catalog entry into a server config, injecting env. */
export function materialiseMcpEntry(
  entry: McpCatalogEntry,
  env: Record<string, string> = {},
): McpServerConfig {
  return {
    name: entry.id,
    enabled: true,
    ...entry.config,
    ...(Object.keys(env).length > 0 ? { env: { ...(entry.config.env ?? {}), ...env } } : {}),
  }
}
