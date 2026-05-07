import { simpleGit } from 'simple-git'
import type { Tool, ToolResult } from '@arix/core'

export class GitBlameTool implements Tool {
  readonly name = 'git_blame'
  readonly description = 'Show line-by-line authorship for a file (optionally a line range)'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      file:      { type: 'string', description: 'File path' },
      startLine: { type: 'number' },
      endLine:   { type: 'number' },
    },
    required: ['file'],
  }
  constructor(private readonly cwd: string) {}
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const file = input['file'] as string
    const start = input['startLine'] as number | undefined
    const end   = input['endLine'] as number | undefined
    const git = simpleGit(this.cwd)
    const args = ['blame', '--line-porcelain']
    if (start && end) args.push('-L', `${start},${end}`)
    args.push(file)
    const out = await git.raw(args)
    return { toolCallId: '', success: true, output: out.length > 16_000 ? out.slice(0, 16_000) + '\n[truncated]' : out }
  }
}

export class GitLogTool implements Tool {
  readonly name = 'git_log'
  readonly description = 'Show commit history (most recent N, optionally for a path)'
  readonly requiresConfirmation = false
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      maxCount: { type: 'number', description: 'Default 20' },
      path:     { type: 'string' },
      author:   { type: 'string' },
    },
  }
  constructor(private readonly cwd: string) {}
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const max = (input['maxCount'] as number | undefined) ?? 20
    const path   = input['path'] as string | undefined
    const author = input['author'] as string | undefined
    const git = simpleGit(this.cwd)
    const args: string[] = ['log', `-n${max}`, '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short']
    if (author) args.push(`--author=${author}`)
    if (path) args.push('--', path)
    const out = await git.raw(args)
    return { toolCallId: '', success: true, output: out.trim() || '(no commits)' }
  }
}

export class GitRebaseTool implements Tool {
  readonly name = 'git_rebase'
  readonly description = 'Rebase the current branch onto a target. Use --abort to back out a conflicted rebase.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      onto:     { type: 'string', description: 'Target branch/ref' },
      abort:    { type: 'boolean' },
      continue: { type: 'boolean' },
    },
  }
  constructor(private readonly cwd: string) {}
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const git = simpleGit(this.cwd)
    if (input['abort']) {
      const out = await git.raw(['rebase', '--abort'])
      return { toolCallId: '', success: true, output: out || 'rebase aborted' }
    }
    if (input['continue']) {
      const out = await git.raw(['rebase', '--continue'])
      return { toolCallId: '', success: true, output: out || 'rebase continued' }
    }
    const onto = input['onto'] as string | undefined
    if (!onto) return { toolCallId: '', success: false, output: '', error: 'onto is required' }
    try {
      const out = await git.raw(['rebase', onto])
      return { toolCallId: '', success: true, output: out || `rebased onto ${onto}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', success: false, output: '', error: msg }
    }
  }
}

export class GitCherryPickTool implements Tool {
  readonly name = 'git_cherry_pick'
  readonly description = 'Cherry-pick one or more commits onto the current branch'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      commits:   { type: 'array', items: { type: 'string' }, description: 'Commit SHAs in apply order' },
      abort:     { type: 'boolean' },
      continue_: { type: 'boolean' },
    },
  }
  constructor(private readonly cwd: string) {}
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const git = simpleGit(this.cwd)
    if (input['abort'])     return { toolCallId: '', success: true, output: await git.raw(['cherry-pick', '--abort']) || 'aborted' }
    if (input['continue_']) return { toolCallId: '', success: true, output: await git.raw(['cherry-pick', '--continue']) || 'continued' }
    const commits = input['commits'] as string[] | undefined
    if (!commits || commits.length === 0) return { toolCallId: '', success: false, output: '', error: 'commits is required' }
    try {
      const out = await git.raw(['cherry-pick', ...commits])
      return { toolCallId: '', success: true, output: out || `picked ${commits.length} commits` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { toolCallId: '', success: false, output: '', error: msg }
    }
  }
}

export class GitBisectTool implements Tool {
  readonly name = 'git_bisect'
  readonly description = 'Manage a git bisect session. Actions: start, good, bad, skip, reset, run.'
  readonly requiresConfirmation = true
  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['start', 'good', 'bad', 'skip', 'reset', 'run'] },
      ref:    { type: 'string', description: 'For good/bad: a commit ref' },
      good:   { type: 'string', description: 'For start: known-good ref' },
      bad:    { type: 'string', description: 'For start: known-bad ref (default HEAD)' },
      script: { type: 'string', description: 'For run: command to execute as the test (exit 0 = good)' },
    },
    required: ['action'],
  }
  constructor(private readonly cwd: string) {}
  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'] as string
    const git = simpleGit(this.cwd)
    try {
      let out = ''
      if (action === 'start') {
        await git.raw(['bisect', 'start'])
        await git.raw(['bisect', 'bad', (input['bad'] as string | undefined) ?? 'HEAD'])
        const good = input['good'] as string | undefined
        if (!good) return { toolCallId: '', success: false, output: '', error: '`good` ref required to start bisect' }
        out = await git.raw(['bisect', 'good', good])
      } else if (action === 'good' || action === 'bad' || action === 'skip') {
        const ref = input['ref'] as string | undefined
        out = await git.raw(['bisect', action, ...(ref ? [ref] : [])])
      } else if (action === 'reset') {
        out = await git.raw(['bisect', 'reset'])
      } else if (action === 'run') {
        const script = input['script'] as string | undefined
        if (!script) return { toolCallId: '', success: false, output: '', error: '`script` required for run' }
        out = await git.raw(['bisect', 'run', 'sh', '-c', script])
      } else {
        return { toolCallId: '', success: false, output: '', error: `Unknown action: ${action}` }
      }
      return { toolCallId: '', success: true, output: out.trim() || `(${action} completed)` }
    } catch (err) {
      return { toolCallId: '', success: false, output: '', error: err instanceof Error ? err.message : String(err) }
    }
  }
}

export function createAdvancedGitTools(cwd: string) {
  return [
    new GitBlameTool(cwd),
    new GitLogTool(cwd),
    new GitRebaseTool(cwd),
    new GitCherryPickTool(cwd),
    new GitBisectTool(cwd),
  ]
}
