/**
 * arix redact — scan a chat.md / log / arbitrary file and redact secrets
 * in-place (or stdout). Implements R9.
 */

import type { Command } from 'commander'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { redactSecrets, scanSecrets } from '@arix-code/tools'

export function registerRedact(program: Command): void {
  program
    .command('redact <file>')
    .description('Scan a file for likely secrets and redact them')
    .option('--in-place', 'Rewrite the file (creates a .bak backup)')
    .option('--check', 'Exit non-zero if anything is found, do not modify')
    .action(async (file: string, opts: { inPlace?: boolean; check?: boolean }) => {
      const path = resolve(file)
      const text = await readFile(path, 'utf-8')
      const findings = scanSecrets(text)

      if (opts.check) {
        if (findings.length === 0) {
          process.stdout.write(`✓ ${path}: no secrets detected\n`)
        } else {
          process.stdout.write(`✗ ${path}: ${findings.length} finding(s)\n`)
          for (const f of findings) {
            process.stdout.write(`  ${f.line}:${f.patternId}  ${f.preview}\n`)
          }
          process.exitCode = 1
        }
        return
      }

      const cleaned = redactSecrets(text)
      if (opts.inPlace) {
        await copyFile(path, path + '.bak')
        await writeFile(path, cleaned, 'utf-8')
        process.stdout.write(`Redacted ${findings.length} secret(s) in ${path} (backup: ${path}.bak)\n`)
      } else {
        process.stdout.write(cleaned)
      }
    })
}
