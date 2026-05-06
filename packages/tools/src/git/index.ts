import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'
import type { Tool, ToolResult } from '@arix/core'

export class GitStatusTool implements Tool {
  readonly name = 'git_status'
  readonly description = 'Get the current git status'
  readonly requiresConfirmation = false
  readonly inputSchema = { type: 'object' as const, properties: {} }

  constructor(private readonly cwd: string) {}

  async execute(_input: Record<string, unknown>): Promise<ToolResult> {
    const git = simpleGit(this.cwd)
    const status = await git.status()
    const result = {
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
      deleted: status.deleted,
      branch: status.current,
      ahead: status.ahead,
      behind: status.behind,
    }
    return { toolCallId: '', success: true, output: JSON.stringify(result, null, 2) }
  }
}

export class GitDiffTool implements Tool {
  readonly name = 'git_diff'
  readonly description = 'Get git diff output'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      staged: { type: 'boolean', description: 'Show staged diff' },
      file: { type: 'string', description: 'Limit diff to specific file' },
    },
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const git = simpleGit(this.cwd)
    const staged = input['staged'] as boolean | undefined
    const file = input['file'] as string | undefined
    const MAX_DIFF = 100 * 1024

    const args: string[] = staged ? ['--cached'] : []
    if (file) args.push('--', file)

    const diff = await git.diff(args)
    const output = diff.length > MAX_DIFF
      ? diff.slice(0, MAX_DIFF) + '\n[Diff truncated at 100KB]'
      : diff

    return { toolCallId: '', success: true, output }
  }
}

export class GitCommitTool implements Tool {
  readonly name = 'git_commit'
  readonly description = 'Create a git commit'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: 'Commit message' },
      files: { type: 'array', items: { type: 'string' }, description: 'Files to stage (omit to commit already-staged)' },
    },
    required: ['message'],
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const git = simpleGit(this.cwd)
    const message = input['message'] as string
    const files = input['files'] as string[] | undefined

    if (files && files.length > 0) {
      await git.add(files)
    }

    const result = await git.commit(message)
    return { toolCallId: '', success: true, output: result.commit ?? 'committed' }
  }
}

export class GitBranchTool implements Tool {
  readonly name = 'git_branch'
  readonly description = 'List, get current, or create a git branch'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['list', 'current', 'create'], description: 'Branch action' },
      name: { type: 'string', description: 'Branch name (for create)' },
    },
    required: ['action'],
  }

  constructor(private readonly cwd: string) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const git = simpleGit(this.cwd)
    const action = input['action'] as 'list' | 'current' | 'create'
    const name = input['name'] as string | undefined

    if (action === 'current') {
      const status = await git.status()
      return { toolCallId: '', success: true, output: status.current ?? 'detached HEAD' }
    }

    if (action === 'list') {
      const branches = await git.branchLocal()
      return { toolCallId: '', success: true, output: branches.all.join('\n') }
    }

    if (action === 'create') {
      if (!name) return { toolCallId: '', success: false, output: '', error: 'Branch name required' }
      await git.checkoutLocalBranch(name)
      return { toolCallId: '', success: true, output: `Created and switched to branch: ${name}` }
    }

    return { toolCallId: '', success: false, output: '', error: `Unknown action: ${action}` }
  }
}

export function createGitTools(cwd: string): Tool[] {
  return [
    new GitStatusTool(cwd),
    new GitDiffTool(cwd),
    new GitCommitTool(cwd),
    new GitBranchTool(cwd),
  ]
}
