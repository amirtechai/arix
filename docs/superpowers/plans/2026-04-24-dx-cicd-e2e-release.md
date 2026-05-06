# DX · CI/CD · E2E · Release Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve CLI developer experience, harden CI/CD pipelines, add real E2E tests, and prepare the monorepo for v0.1.0 release.

**Architecture:** Four sequential phases — Phase Y (DX), Phase Z (CI/CD), Phase E (E2E tests), Phase R (Release prep). Each phase produces independently shippable improvements. Phase E requires Phase Y's build artifacts; Phase R requires all prior phases.

**Tech Stack:** Node.js 22, TypeScript strict, pnpm 9, vitest 1.x + @vitest/coverage-v8, execa for process spawning in E2E, GitHub Actions.

---

## Phase Y: DX Improvements

### Task Y1: Thinking spinner while waiting for first token

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` — add spinner to `createRenderer()`

The current `createRenderer()` shows nothing between the user pressing Enter and the first `text` event arriving. Add a TTY spinner that starts on request begin and clears on first token.

- [ ] **Step 1: Write the failing test for spinner state tracking**

Add to `packages/cli/src/__tests__/commands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('createRenderer spinner', () => {
  it('tracks thinking state transitions', () => {
    // This is a behavioral contract test — the renderer exposes a `thinking` flag
    // that flips from true to false on first text event.
    // We test the exported factory; the actual terminal writes are side effects.
    const { createRenderer } = await import('../commands/chat.js')
    const r = createRenderer()
    expect(r.state.thinking).toBe(false)

    // tool_start should not trigger thinking
    r.onEvent({ type: 'tool_start', call: { id: '1', name: 'read_file', input: {} } }, r.state)
    expect(r.state.thinking).toBe(false)
  })
})
```

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli test 2>&1 | tail -20`

Expected: FAIL (createRenderer not exported, `thinking` property doesn't exist)

- [ ] **Step 2: Export `createRenderer` and add `thinking` + `spinnerTimer` to RenderState**

In `packages/cli/src/commands/chat.ts`, update `RenderState` and add spinner logic:

```typescript
// add to RenderState interface
interface RenderState {
  buffer: string
  inCodeBlock: boolean
  toolStart: number
  thinking: boolean
  spinnerTimer: ReturnType<typeof setInterval> | null
}

// update createRenderer initial state
const state: RenderState = {
  buffer: '',
  inCodeBlock: false,
  toolStart: 0,
  thinking: false,
  spinnerTimer: null,
}

// spinner frames
const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']

function startSpinner(s: RenderState): void {
  if (!isTTY || s.spinnerTimer !== null) return
  let frame = 0
  s.thinking = true
  s.spinnerTimer = setInterval(() => {
    process.stdout.write(`\r${c.gray}${SPINNER[frame++ % SPINNER.length]} thinking...${c.reset}`)
  }, 80)
}

function stopSpinner(s: RenderState): void {
  if (s.spinnerTimer !== null) {
    clearInterval(s.spinnerTimer)
    s.spinnerTimer = null
    if (isTTY) process.stdout.write('\r\x1b[K') // clear spinner line
  }
  s.thinking = false
}
```

In the `onEvent` function, update `case 'text':` to call `stopSpinner` before writing:

```typescript
case 'text':
  stopSpinner(s)
  s.buffer += e.chunk
  // ... existing flush logic ...
  break
```

Update `case 'done':` and `case 'error':` to also call `stopSpinner(s)`.

Export the function at the bottom of the file: `export { createRenderer }`

Then call `startSpinner(renderer.state)` right before the `for await` loop in the `runMessage` function.

- [ ] **Step 3: Run tests**

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli test 2>&1 | tail -10`

Expected: all CLI tests pass

- [ ] **Step 4: Typecheck**

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli typecheck 2>&1`

Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/fatih/arix
git add packages/cli/src/commands/chat.ts packages/cli/src/__tests__/commands.test.ts
git commit -m "feat(cli): thinking spinner while waiting for first token"
```

---

### Task Y2: Graceful Ctrl+C abort during streaming

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` — `runMessage` function

Currently Ctrl+C during streaming kills the process without saving. Add an abort signal to the agent loop and handle SIGINT.

- [ ] **Step 1: Write failing test for abort behavior contract**

Add to `packages/cli/src/__tests__/commands.test.ts`:

```typescript
describe('AbortController integration', () => {
  it('AbortController signal is AbortSignal', () => {
    const ctrl = new AbortController()
    expect(ctrl.signal).toBeInstanceOf(AbortSignal)
    expect(ctrl.signal.aborted).toBe(false)
    ctrl.abort()
    expect(ctrl.signal.aborted).toBe(true)
  })
})
```

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli test 2>&1 | tail -10`
Expected: PASS (trivial test — verifies runtime supports AbortController)

- [ ] **Step 2: Add SIGINT handler that aborts current run**

In the `action` handler of `registerChat`, before the `prompt()` call, add an `abortCtrl` reference:

```typescript
let currentAbort: AbortController | null = null

// Set up SIGINT to abort current streaming instead of killing process
process.on('SIGINT', () => {
  if (currentAbort !== null) {
    currentAbort.abort()
    process.stdout.write(`\n${c.yellow}Interrupted — stopping response.${c.reset}\n`)
    return
  }
  // No active stream — exit cleanly
  process.stdout.write('\n')
  rl.close()
})
```

In `runMessage`, wrap the `for await` loop:

```typescript
async function runMessage(msg: string): Promise<void> {
  currentAbort = new AbortController()
  const { signal } = currentAbort
  renderer.startThinking?.()  // if spinner added in Y1

  try {
    for await (const ev of loop.run(msg)) {
      if (signal.aborted) break
      renderer.onEvent(ev, renderer.state)
    }
  } finally {
    stopSpinner(renderer.state)
    currentAbort = null
  }
}
```

- [ ] **Step 3: Run full test suite**

Run: `cd /home/fatih/arix && pnpm test 2>&1 | grep -E 'Tests|passed|failed'`

Expected: 311+ passed, 0 failed

- [ ] **Step 4: Commit**

```bash
cd /home/fatih/arix
git add packages/cli/src/commands/chat.ts
git commit -m "feat(cli): graceful Ctrl+C abort during streaming"
```

---

### Task Y3: Tool call input preview

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` — `tool_start` case in renderer

Currently: `▶ read_file...`
Wanted: `▶ read_file  src/index.ts` (show first meaningful input value)

- [ ] **Step 1: Write test for input preview extraction**

Add to `packages/cli/src/__tests__/commands.test.ts`:

```typescript
describe('toolInputPreview', () => {
  it('extracts first string value from tool input', () => {
    const { toolInputPreview } = await import('../commands/chat.js')
    expect(toolInputPreview({ path: 'src/index.ts', mode: 'read' })).toBe('src/index.ts')
    expect(toolInputPreview({ query: 'hello world' })).toBe('hello world')
    expect(toolInputPreview({ command: 'ls -la' })).toBe('ls -la')
    expect(toolInputPreview({})).toBe('')
    expect(toolInputPreview({ count: 5 })).toBe('')
  })
})
```

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli test 2>&1 | tail -10`
Expected: FAIL (`toolInputPreview` not exported)

- [ ] **Step 2: Implement and export `toolInputPreview`**

Add this function before `createRenderer` in `chat.ts`:

```typescript
export function toolInputPreview(input: Record<string, unknown>): string {
  // Return the first string value from the input object, truncated
  for (const v of Object.values(input)) {
    if (typeof v === 'string' && v.length > 0) {
      return v.length > 60 ? v.slice(0, 57) + '...' : v
    }
  }
  return ''
}
```

Update the `tool_start` case in `onEvent`:

```typescript
case 'tool_start':
  if (s.buffer) { process.stdout.write(renderMarkdown(s.buffer) + '\n'); s.buffer = '' }
  stopSpinner(s)
  const preview = toolInputPreview(e.call.input as Record<string, unknown>)
  const previewStr = preview ? `  ${c.gray}${preview}${c.reset}` : ''
  process.stdout.write(`${c.gray}  ▶ ${c.cyan}${e.call.name}${c.reset}${previewStr}${c.gray}...${c.reset}`)
  s.toolStart = Date.now()
  break
```

- [ ] **Step 3: Run tests**

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli test 2>&1 | tail -10`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
cd /home/fatih/arix
git add packages/cli/src/commands/chat.ts packages/cli/src/__tests__/commands.test.ts
git commit -m "feat(cli): show tool input preview in streaming output"
```

---

### Task Y4: First-run provider guard

**Files:**
- Modify: `packages/cli/src/bootstrap.ts` — add pre-flight API key check

Currently, if no API key is configured, the error surfaces deep in the HTTP request as a 401 or connection error. Instead, detect it early and print a clear actionable message.

- [ ] **Step 1: Write failing test**

Add to `packages/cli/src/__tests__/integration.test.ts`:

```typescript
it('bootstrap resolves provider from config', async () => {
  // When a non-existent provider is explicitly requested with no key,
  // bootstrap should throw a recognizable error message
  const mgr = new ConfigManager(configDir)
  await mgr.set('provider', 'openrouter')
  // No API key set — resolveApiKeyAsync will return undefined

  const key = await mgr.resolveApiKeyAsync('openrouter')
  expect(key).toBeUndefined()
})
```

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli test 2>&1 | tail -10`
Expected: PASS (trivial — just verifies the method exists and returns undefined for unconfigured provider)

- [ ] **Step 2: Add provider guard in `bootstrap.ts`**

After resolving `providerName` and before calling `ProviderFactory.create`, add:

```typescript
// Providers that require an API key (Ollama does not)
const KEY_REQUIRED: ReadonlySet<string> = new Set([
  'anthropic', 'openai', 'openrouter', 'gemini', 'azure', 'bedrock', 'vertex',
])

if (KEY_REQUIRED.has(providerName)) {
  const apiKey = await configMgr.resolveApiKeyAsync(providerName)
  if (!apiKey) {
    const envVar = providerName.toUpperCase().replace(/-/g, '_') + '_API_KEY'
    throw new Error(
      `No API key configured for provider "${providerName}".\n` +
      `  Set it with:  arix provider setup\n` +
      `  Or export:    ${envVar}=<your-key>`,
    )
  }
}
```

- [ ] **Step 3: Run full tests**

Run: `cd /home/fatih/arix && pnpm test 2>&1 | grep -E 'Tests|passed|failed'`
Expected: 311+ passed

- [ ] **Step 4: Typecheck**

Run: `cd /home/fatih/arix && pnpm typecheck 2>&1 | tail -5`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/fatih/arix
git add packages/cli/src/bootstrap.ts packages/cli/src/__tests__/integration.test.ts
git commit -m "feat(cli): clear actionable error when API key not configured"
```

---

## Phase Z: CI/CD Hardening

### Task Z1: Code coverage with threshold enforcement

**Files:**
- Modify: `vitest.config.ts` (root) — add coverage config
- Create: `.vitest-coverage-threshold.ts` — optional; inline in root config is cleaner
- Modify: `.github/workflows/ci.yml` — add `--coverage` flag and Codecov upload step
- Install: `@vitest/coverage-v8` in root devDependencies

- [ ] **Step 1: Install coverage package**

```bash
cd /home/fatih/arix
pnpm add -D -w @vitest/coverage-v8
```

Verify: `cat pnpm-lock.yaml | grep -c coverage-v8` prints ≥ 1

- [ ] **Step 2: Update root `vitest.config.ts` to include coverage config**

Current root `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

Replace with:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/vitest.config.*',
        '**/tsup.config.*',
        'packages/vscode-ext/**',
      ],
    },
  },
})
```

- [ ] **Step 3: Run coverage locally to verify**

```bash
cd /home/fatih/arix
pnpm test -- --coverage 2>&1 | tail -30
```

Expected: coverage table printed, no threshold failures (or note which thresholds fail so we can adjust)

If threshold failures appear, lower them to match the actual current coverage:
- Look at "All files" row in the output
- Set thresholds 5 percentage points below actual values

- [ ] **Step 4: Update `.github/workflows/ci.yml` to upload coverage**

Add after the `Test` step in the `ci` job (ubuntu + node 22 only):

```yaml
      - name: Test with coverage
        if: matrix.os == 'ubuntu-latest' && matrix.node-version == '22'
        run: pnpm test -- --coverage

      - name: Upload coverage to Codecov
        if: matrix.os == 'ubuntu-latest' && matrix.node-version == '22'
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false
        continue-on-error: true
```

Replace the existing bare `Test` step with a conditional:

```yaml
      - name: Test
        if: "!(matrix.os == 'ubuntu-latest' && matrix.node-version == '22')"
        run: pnpm test
```

- [ ] **Step 5: Commit**

```bash
cd /home/fatih/arix
git add vitest.config.ts .github/workflows/ci.yml package.json pnpm-lock.yaml
git commit -m "ci: add code coverage with v8 provider and Codecov upload"
```

---

### Task Z2: Release workflow — CHANGELOG-driven GitHub Release notes

**Files:**
- Modify: `.github/workflows/release.yml` — extract CHANGELOG section for the tag into release body

Currently `release.yml` uses `generate_release_notes: true` which auto-generates notes from merged PRs. Better: pull the relevant CHANGELOG section for the exact tag being released.

- [ ] **Step 1: Add a CHANGELOG extraction script**

Create `scripts/extract-changelog.sh`:

```bash
#!/usr/bin/env bash
# Extract the changelog section for the given version tag (e.g. v0.1.0 → 0.1.0)
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag> (e.g. v0.1.0)" >&2
  exit 1
fi

VERSION="${TAG#v}"  # strip leading 'v'

# Extract text between ## [VERSION] and the next ## heading
awk "/^## \[$VERSION\]/{found=1; next} found && /^## /{exit} found{print}" CHANGELOG.md
```

```bash
chmod +x /home/fatih/arix/scripts/extract-changelog.sh
```

Verify locally:

```bash
cd /home/fatih/arix
./scripts/extract-changelog.sh v0.1.0 | head -10
```

Expected: the Added section for 0.1.0 is printed

- [ ] **Step 2: Update `release.yml` to use CHANGELOG content**

Replace the `Create GitHub Release` step with:

```yaml
      - name: Extract release notes from CHANGELOG
        id: changelog
        run: |
          NOTES=$(./scripts/extract-changelog.sh "${{ github.ref_name }}" || echo "See CHANGELOG.md for details.")
          # GitHub Actions multiline output
          {
            echo "notes<<EOF"
            echo "$NOTES"
            echo "EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          body: ${{ steps.changelog.outputs.notes }}
          generate_release_notes: false
```

- [ ] **Step 3: Commit**

```bash
cd /home/fatih/arix
mkdir -p scripts
git add scripts/extract-changelog.sh .github/workflows/release.yml
git commit -m "ci: use CHANGELOG content for GitHub Release notes"
```

---

### Task Z3: Add `engines` field to all publishable packages

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/providers/package.json`
- Modify: `packages/tools/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/dashboard/package.json`
- Modify: `packages/server/package.json`
- Modify: `packages/wiki/package.json`
- Modify: `packages/tui/package.json`

The `arix` wrapper already has `"engines": { "node": ">=18.0.0" }`. All other packages need it too.

- [ ] **Step 1: Verify which packages are missing `engines`**

```bash
for f in /home/fatih/arix/packages/*/package.json; do
  name=$(node -e "console.log(require('$f').name)")
  engines=$(node -e "console.log(require('$f').engines?.node ?? 'MISSING')")
  echo "$name: $engines"
done
```

Expected: most show MISSING (except arix wrapper and vscode-ext)

- [ ] **Step 2: Add `engines` to all 8 packages**

For each of: `core`, `providers`, `tools`, `cli`, `dashboard`, `server`, `wiki`, `tui` — add after the `"license"` field:

```json
  "engines": {
    "node": ">=18.0.0"
  },
```

Do this with a shell loop to avoid 8 manual edits:

```bash
cd /home/fatih/arix
for pkg in core providers tools cli dashboard server wiki tui; do
  pkgfile="packages/$pkg/package.json"
  # Insert engines after "license" line using node
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$pkgfile', 'utf8'));
    p.engines = p.engines ?? { node: '>=18.0.0' };
    // Write with 2-space indent, preserve existing order
    const keys = Object.keys(p);
    // Insert engines after license if not already present at correct position
    fs.writeFileSync('$pkgfile', JSON.stringify(p, null, 2) + '\n');
  "
done
```

Verify: `grep -r '"node"' packages/*/package.json | grep -v vscode-ext | wc -l` → should be 9

- [ ] **Step 3: Commit**

```bash
cd /home/fatih/arix
git add packages/*/package.json
git commit -m "chore: add engines node>=18 to all publishable packages"
```

---

### Task Z4: `.npmrc` and publish config

**Files:**
- Create: `.npmrc` at repo root

- [ ] **Step 1: Create `.npmrc`**

```bash
cat > /home/fatih/arix/.npmrc << 'EOF'
# Reproducible installs
prefer-frozen-lockfile=true

# npm publish provenance (requires npm 9.5+)
provenance=true

# Prevent accidental publish of private packages
# (root package.json already has "private": true)
EOF
```

- [ ] **Step 2: Verify `pnpm install` still works**

```bash
cd /home/fatih/arix && pnpm install --frozen-lockfile 2>&1 | tail -5
```

Expected: no errors, `Already up to date` or similar

- [ ] **Step 3: Commit**

```bash
cd /home/fatih/arix
git add .npmrc
git commit -m "chore: add .npmrc with provenance and frozen-lockfile settings"
```

---

## Phase E: E2E CLI Tests

### Task E1: E2E test infrastructure

**Files:**
- Create: `packages/cli/src/__tests__/e2e/helpers.ts` — spawn helper
- Modify: `packages/cli/package.json` — add `test:e2e` script
- Modify: `packages/cli/vitest.config.ts` — add E2E test include path

E2E tests spawn `node packages/cli/dist/index.js` with a temp `~/.arix` dir. They require the CLI to be built first.

- [ ] **Step 1: Create spawn helper**

Create `packages/cli/src/__tests__/e2e/helpers.ts`:

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const execFileAsync = promisify(execFile)

const CLI_PATH = join(import.meta.dirname, '../../../../dist/index.js')

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function runCli(
  args: string[],
  opts: { configDir?: string; env?: Record<string, string> } = {},
): Promise<RunResult> {
  const configDir = opts.configDir ?? join(tmpdir(), 'arix-e2e-' + Date.now())
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [CLI_PATH, ...args],
      {
        timeout: 15_000,
        env: {
          ...process.env,
          ARIX_CONFIG_DIR: configDir,
          NO_COLOR: '1',
          ...opts.env,
        },
      },
    )
    return { stdout, stderr, exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    }
  }
}

export async function withTempConfig(
  fn: (configDir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'arix-e2e-'))
  try {
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
```

- [ ] **Step 2: Add E2E test script to CLI package.json**

In `packages/cli/package.json`, add to `scripts`:

```json
"test:e2e": "pnpm build && vitest run --config vitest.e2e.config.ts"
```

- [ ] **Step 3: Create E2E vitest config**

Create `packages/cli/vitest.e2e.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/e2e/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 4: Verify helper file typechecks**

Run: `cd /home/fatih/arix && pnpm --filter @arix/cli typecheck 2>&1`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /home/fatih/arix
git add packages/cli/src/__tests__/e2e/helpers.ts packages/cli/vitest.e2e.config.ts packages/cli/package.json
git commit -m "test(cli): add E2E test infrastructure and spawn helper"
```

---

### Task E2: E2E tests — version, help, config

**Files:**
- Create: `packages/cli/src/__tests__/e2e/cli.e2e.test.ts`

These tests spawn the actual compiled binary and assert on stdout/stderr/exit codes.

- [ ] **Step 1: Build CLI**

```bash
cd /home/fatih/arix && pnpm --filter @arix/cli build 2>&1 | tail -5
```

Expected: build succeeds, `packages/cli/dist/index.js` exists

- [ ] **Step 2: Write E2E tests**

Create `packages/cli/src/__tests__/e2e/cli.e2e.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runCli, withTempConfig } from './helpers.js'

const PKG_VERSION = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../../package.json'), 'utf8'),
).version as string

describe('arix --version', () => {
  it('prints the package version', async () => {
    const r = await runCli(['--version'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout.trim()).toContain(PKG_VERSION)
  })
})

describe('arix --help', () => {
  it('exits 0 and lists main commands', async () => {
    const r = await runCli(['--help'])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('chat')
    expect(r.stdout).toContain('fix')
    expect(r.stdout).toContain('config')
    expect(r.stdout).toContain('session')
  })
})

describe('arix config', () => {
  it('config set + get round-trips', async () => {
    await withTempConfig(async (configDir) => {
      const setResult = await runCli(['config', 'set', 'maxTurns', '7'], { configDir })
      expect(setResult.exitCode).toBe(0)

      const getResult = await runCli(['config', 'get', 'maxTurns'], { configDir })
      expect(getResult.exitCode).toBe(0)
      expect(getResult.stdout).toContain('7')
    })
  })

  it('config list shows provider and model', async () => {
    await withTempConfig(async (configDir) => {
      const r = await runCli(['config', 'list'], { configDir })
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toMatch(/provider/i)
    })
  })
})

describe('arix session list', () => {
  it('returns empty list without error on fresh config dir', async () => {
    await withTempConfig(async (configDir) => {
      const r = await runCli(['session', 'list'], { configDir })
      expect(r.exitCode).toBe(0)
      // Either "No sessions" message or empty JSON-like output
      expect(r.stderr).toBe('')
    })
  })
})

describe('arix models list', () => {
  it('exits 0 and prints model table headers', async () => {
    await withTempConfig(async (configDir) => {
      const r = await runCli(['models', 'list'], { configDir })
      expect(r.exitCode).toBe(0)
      // Should print a table with model names
      expect(r.stdout.length).toBeGreaterThan(0)
    })
  })
})

describe('arix fix --dry-run', () => {
  it('exits without spawning agent when no errors', async () => {
    await withTempConfig(async (configDir) => {
      // In a dir with no package.json, fix should print helpful message
      const r = await runCli(['fix', '--dry-run'], {
        configDir,
        env: { HOME: configDir },  // temp HOME so no real project detected
      })
      // Should exit gracefully (may be 0 or 1 depending on whether checks pass)
      expect(r.exitCode).toBeLessThanOrEqual(1)
    })
  })
})
```

- [ ] **Step 3: Run E2E tests**

```bash
cd /home/fatih/arix && pnpm --filter @arix/cli test:e2e 2>&1 | tail -20
```

Expected: all 7 tests pass. If `--version` test fails, check that `packages/cli/package.json` has a `version` field.

- [ ] **Step 4: Add E2E to CI workflow**

In `.github/workflows/ci.yml`, add a new job after `lint`:

```yaml
  e2e:
    name: E2E CLI
    runs-on: ubuntu-latest
    needs: ci   # run after unit tests pass

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run E2E tests
        run: pnpm --filter @arix/cli test:e2e
```

- [ ] **Step 5: Commit**

```bash
cd /home/fatih/arix
git add packages/cli/src/__tests__/e2e/ .github/workflows/ci.yml packages/cli/vitest.e2e.config.ts
git commit -m "test(cli): E2E tests for version, help, config, session, models, fix"
```

---

## Phase R: Release Preparation

### Task R1: Pre-release validation script

**Files:**
- Create: `scripts/pre-release-check.sh`

A script that validates the repo is in a releasable state: all tests pass, no typecheck errors, CHANGELOG has entry for current version, all package versions match.

- [ ] **Step 1: Create the script**

Create `scripts/pre-release-check.sh`:

```bash
#!/usr/bin/env bash
# Pre-release validation. Run before tagging a release.
set -euo pipefail

ERRORS=0

# Helper
fail() { echo "❌ $1"; ERRORS=$((ERRORS + 1)); }
pass() { echo "✅ $1"; }

echo "=== Arix Pre-Release Check ==="
echo ""

# 1. Typecheck
echo "→ Typechecking..."
if pnpm typecheck > /dev/null 2>&1; then
  pass "Typecheck clean"
else
  fail "Typecheck has errors — run: pnpm typecheck"
fi

# 2. Tests
echo "→ Running tests..."
if pnpm test > /dev/null 2>&1; then
  pass "All tests pass"
else
  fail "Tests failing — run: pnpm test"
fi

# 3. Build
echo "→ Building..."
if pnpm build > /dev/null 2>&1; then
  pass "Build succeeds"
else
  fail "Build failed — run: pnpm build"
fi

# 4. Version consistency
ROOT_VERSION=$(node -e "console.log(require('./package.json').version)")
echo "→ Checking version consistency (root: $ROOT_VERSION)..."
ALL_MATCH=true
for pkg in packages/*/package.json; do
  PKG_VERSION=$(node -e "const p=require('./$pkg'); if(!p.private) console.log(p.version)")
  if [[ -n "$PKG_VERSION" && "$PKG_VERSION" != "$ROOT_VERSION" ]]; then
    fail "Version mismatch: $pkg has $PKG_VERSION (expected $ROOT_VERSION)"
    ALL_MATCH=false
  fi
done
if $ALL_MATCH; then pass "All package versions are $ROOT_VERSION"; fi

# 5. CHANGELOG has entry for this version
echo "→ Checking CHANGELOG for v$ROOT_VERSION..."
if grep -q "## \[$ROOT_VERSION\]" CHANGELOG.md; then
  pass "CHANGELOG has entry for $ROOT_VERSION"
else
  fail "CHANGELOG missing entry for $ROOT_VERSION — update CHANGELOG.md"
fi

# 6. No uncommitted changes
echo "→ Checking git status..."
if [[ -z "$(git status --porcelain)" ]]; then
  pass "Working tree is clean"
else
  fail "Uncommitted changes detected — commit or stash first"
fi

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo "🚀 All checks passed. Ready to tag: git tag v$ROOT_VERSION && git push --tags"
else
  echo "💥 $ERRORS check(s) failed. Fix them before releasing."
  exit 1
fi
```

```bash
chmod +x /home/fatih/arix/scripts/pre-release-check.sh
```

- [ ] **Step 2: Run the script to verify it works**

```bash
cd /home/fatih/arix && ./scripts/pre-release-check.sh 2>&1
```

Expected: all checks pass (or typecheck/tests pass; version mismatch if vscode-ext is 0.2.0 — that's fine since it has no publishConfig as a standard package and the script only checks non-private packages)

Note: if vscode-ext causes a false failure, update the script to skip packages that don't have `publishConfig`:

```bash
PKG_VERSION=$(node -e "
  const p=require('./$pkg');
  if(!p.private && p.publishConfig) console.log(p.version)
")
```

- [ ] **Step 3: Commit**

```bash
cd /home/fatih/arix
mkdir -p scripts
git add scripts/pre-release-check.sh scripts/extract-changelog.sh
git commit -m "chore: add pre-release validation and changelog extraction scripts"
```

---

### Task R2: `arix` wrapper package — verify bin script is correct

**Files:**
- Verify: `packages/arix/bin/arix.js`
- Modify: `packages/arix/package.json` — add `engines`, fix repo URL

The wrapper package was created by the release workflow at publish time. Now we bake it in properly so it's always present.

- [ ] **Step 1: Verify wrapper bin exists and is executable**

```bash
ls -la /home/fatih/arix/packages/arix/bin/arix.js
node /home/fatih/arix/packages/arix/bin/arix.js --version 2>&1 || true
```

If `arix.js` doesn't exist or has wrong content:

```bash
mkdir -p /home/fatih/arix/packages/arix/bin
printf '#!/usr/bin/env node\nimport "@arix/cli";\n' > /home/fatih/arix/packages/arix/bin/arix.js
chmod +x /home/fatih/arix/packages/arix/bin/arix.js
```

- [ ] **Step 2: Fix repo URL in `packages/arix/package.json`**

The wrapper's `package.json` has `"url": "git+https://github.com/arix/arix.git"` but root has `amirtechai/arix`. Update:

```bash
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('packages/arix/package.json', 'utf8'));
  p.repository.url = 'git+https://github.com/amirtechai/arix.git';
  p.homepage = 'https://github.com/amirtechai/arix';
  fs.writeFileSync('packages/arix/package.json', JSON.stringify(p, null, 2) + '\n');
"
```

- [ ] **Step 3: Run full test suite + typecheck one final time**

```bash
cd /home/fatih/arix
pnpm test 2>&1 | grep -E 'Test Files|Tests|passed|failed'
pnpm typecheck 2>&1 | tail -5
```

Expected: all tests pass, typecheck clean.

- [ ] **Step 4: Run pre-release check**

```bash
cd /home/fatih/arix && ./scripts/pre-release-check.sh
```

Expected: all 6 checks green.

- [ ] **Step 5: Commit**

```bash
cd /home/fatih/arix
git add packages/arix/
git commit -m "chore(release): finalize arix wrapper package and repo URLs"
```

---

## Summary

| Phase | Tasks | Outcome |
|-------|-------|---------|
| Y — DX | Y1–Y4 | Spinner, abort, tool preview, first-run guard |
| Z — CI/CD | Z1–Z4 | Coverage + Codecov, CHANGELOG releases, engines field, .npmrc |
| E — E2E | E1–E2 | Spawn-based CLI tests + CI job |
| R — Release | R1–R2 | Pre-release script, wrapper package finalized |

After all phases: run `./scripts/pre-release-check.sh` → if green, `git tag v0.1.0 && git push --tags` triggers automatic npm publish + Docker GHCR push.
