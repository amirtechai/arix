import type { Command } from 'commander'
import { UndoStack } from '@arix-code/core'

export function registerUndo(program: Command): void {
  const undo = program
    .command('undo')
    .description('Reverse the most recent destructive tool call (file write/edit/delete)')
    .option('--list', 'List recent undoable operations instead of reverting')
    .option('--id <id>', 'Revert a specific frame by id')
    .action(async (opts: { list?: boolean; id?: string }) => {
      const stack = new UndoStack()
      await stack.load()

      if (opts.list) {
        const frames = stack.list()
        if (frames.length === 0) {
          process.stdout.write('No undoable operations.\n')
          return
        }
        for (const f of frames.slice().reverse()) {
          const ago = ((Date.now() - f.ts) / 1000).toFixed(0)
          process.stdout.write(`  ${f.id.slice(0, 8)}  ${f.kind.padEnd(7)} ${f.tool.padEnd(15)} ${f.path}  (${ago}s ago)\n`)
        }
        return
      }

      const reverted = opts.id ? await stack.undoById(opts.id) : await stack.undoLast()
      if (!reverted) {
        process.stdout.write('Nothing to undo.\n')
        process.exitCode = 1
        return
      }
      process.stdout.write(`✓ Reverted ${reverted.tool} on ${reverted.path}\n`)
    })

  return undo as unknown as void
}
