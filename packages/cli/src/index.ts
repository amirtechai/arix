import { program } from 'commander'
import { createRequire } from 'node:module'
import { installGlobalErrorHandlers, logger } from '@arix/core'
import { registerChat } from './commands/chat.js'
import { registerConfig } from './commands/config.js'
import { registerSession } from './commands/session.js'
import { registerSkill } from './commands/skill.js'
import { registerInit } from './commands/init.js'
import { registerTui } from './commands/tui.js'
import { registerDashboard } from './commands/dashboard.js'
import { registerCompletions } from './commands/completions.js'
import { registerTools } from './commands/tools.js'
import { registerFix } from './commands/fix.js'
import { registerLoop } from './commands/loop.js'
import { registerServe } from './commands/serve.js'
import { registerFeature } from './commands/feature.js'
import { registerProvider } from './commands/provider.js'
import { registerProfile } from './commands/profile.js'
import { registerWiki } from './commands/wiki.js'
import { registerPr } from './commands/pr.js'
import { registerReview } from './commands/review.js'
import { registerTdd } from './commands/tdd.js'
import { registerModels } from './commands/models.js'
import { registerCost } from './commands/cost.js'
import { registerMemory } from './commands/memory.js'
import { registerPlugin } from './commands/plugin.js'
import { registerMcp } from './commands/mcp.js'
import { registerAsk } from './commands/ask.js'
import { registerDesign } from './commands/design.js'
import { registerTeam } from './commands/team.js'
import { registerBuild } from './commands/build.js'
import { registerFind } from './commands/find.js'
import { registerComplete } from './commands/complete.js'
import { registerUndo } from './commands/undo.js'
import { registerWorkspace } from './commands/workspace.js'
import { registerSpec } from './commands/spec.js'
import { registerEval } from './commands/eval.js'

installGlobalErrorHandlers()

// ── Global flag rewrite ─────────────────────────────────────────────────────
// `arix --resume <id>`         → `arix chat --resume <id>`
// `arix --resume` (no id)      → `arix chat` with interactive picker
// `arix --continue`            → `arix chat --continue`
// Done before commander parses so we don't double-parse argv.
const SUBCOMMANDS = new Set([
  'chat', 'config', 'session', 'skill', 'init', 'tui', 'dashboard',
  'completions', 'tools', 'fix', 'loop', 'serve', 'feature', 'provider',
  'profile', 'wiki', 'pr', 'review', 'tdd', 'models', 'cost', 'memory',
  'plugin', 'mcp', 'ask', 'design', 'team', 'build', 'find',
  'undo', 'workspace', 'ws', 'spec', 'eval',
  'help', '--help', '-h', '--version', '-V',
])

;(function rewriteArgv(): void {
  const args = process.argv.slice(2)
  if (args.length === 0) return
  // Find first non-flag token; if it's a known subcommand, leave argv alone.
  const firstNonFlag = args.find((a) => !a.startsWith('-'))
  if (firstNonFlag !== undefined && SUBCOMMANDS.has(firstNonFlag)) return
  // Look for --resume or --continue among the args.
  const hasResume = args.includes('--resume') || args.includes('-r')
  const hasContinue = args.includes('--continue') || args.includes('-c')
  if (hasResume || hasContinue) {
    process.argv.splice(2, 0, 'chat')
  }
})()

// Build version string: "0.1.0 (Node.js 22.x.x, linux/x64)"
const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }
const versionStr = `${pkg.version} (Node.js ${process.version}, ${process.platform}/${process.arch})`

program
  .name('arix')
  .description('Arix — provider-agnostic AI coding agent')
  .version(versionStr, '-V, --version')
  .option('--debug', 'Enable verbose debug logging (or set ARIX_DEBUG=1)')
  .option('--resume [id]', 'Resume a previous session (shorthand for: arix chat --resume)')
  .option('--continue', 'Resume the most recent session (shorthand for: arix chat --continue)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<{ debug?: boolean }>()
    if (opts.debug) logger.enableDebug()
    void logger.rotate()
  })

registerChat(program)
registerConfig(program)
registerSession(program)
registerSkill(program)
registerInit(program)
registerTui(program)
registerDashboard(program)
registerCompletions(program)
registerTools(program)
registerFix(program)
registerLoop(program)
registerServe(program)
registerFeature(program)
registerProvider(program)
registerProfile(program)
registerWiki(program)
registerPr(program)
registerReview(program)
registerTdd(program)
registerModels(program)
registerCost(program)
registerMemory(program)
registerPlugin(program)
registerMcp(program)
registerAsk(program)
registerDesign(program)
registerTeam(program)
registerBuild(program)
registerFind(program)
registerComplete(program)
registerUndo(program)
registerWorkspace(program)
registerSpec(program)
registerEval(program)

program.parse()
