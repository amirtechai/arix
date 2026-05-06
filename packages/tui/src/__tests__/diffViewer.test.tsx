import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { DiffViewer } from '../components/DiffViewer.js'

const SIMPLE_DIFF = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,4 +1,4 @@
 import { foo } from './foo.js'
-const x = 1
+const x = 2
 export { foo }
`

describe('DiffViewer', () => {
  it('renders the file name', () => {
    const { lastFrame } = render(<DiffViewer diff={SIMPLE_DIFF} fileName="src/index.ts" />)
    expect(lastFrame()).toContain('src/index.ts')
  })

  it('renders added lines with + prefix', () => {
    const { lastFrame } = render(<DiffViewer diff={SIMPLE_DIFF} fileName="src/index.ts" />)
    expect(lastFrame()).toContain('+const x = 2')
  })

  it('renders removed lines with - prefix', () => {
    const { lastFrame } = render(<DiffViewer diff={SIMPLE_DIFF} fileName="src/index.ts" />)
    expect(lastFrame()).toContain('-const x = 1')
  })

  it('renders context lines unchanged', () => {
    const { lastFrame } = render(<DiffViewer diff={SIMPLE_DIFF} fileName="src/index.ts" />)
    expect(lastFrame()).toContain('import { foo }')
  })

  it('renders hunk header (@@ line)', () => {
    const { lastFrame } = render(<DiffViewer diff={SIMPLE_DIFF} fileName="src/index.ts" />)
    expect(lastFrame()).toContain('@@')
  })

  it('shows line count summary', () => {
    const { lastFrame } = render(<DiffViewer diff={SIMPLE_DIFF} fileName="src/index.ts" />)
    // Should show +1/-1 or similar addition/removal summary
    expect(lastFrame()).toContain('+1')
    expect(lastFrame()).toContain('-1')
  })

  it('renders empty state for empty diff', () => {
    const { lastFrame } = render(<DiffViewer diff="" fileName="file.ts" />)
    expect(lastFrame()).toContain('file.ts')
  })
})
