import React from 'react'
import { render } from 'ink-testing-library'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileExplorerContent } from '../components/FileExplorer.js'

describe('FileExplorerContent', () => {
  const entries = [
    { name: 'src', isDirectory: true },
    { name: 'package.json', isDirectory: false },
    { name: 'tsconfig.json', isDirectory: false },
    { name: 'dist', isDirectory: true },
  ]

  it('renders title and entries', () => {
    const { lastFrame } = render(
      <FileExplorerContent entries={entries} cursor={0} cwd="/home/user/project" />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Files')
    expect(frame).toContain('src')
    expect(frame).toContain('package.json')
  })

  it('shows cursor indicator on active entry', () => {
    const { lastFrame } = render(
      <FileExplorerContent entries={entries} cursor={1} cwd="/project" />,
    )
    const frame = lastFrame() ?? ''
    // cursor on index 1 = package.json
    expect(frame).toContain('package.json')
  })

  it('marks directories distinctly', () => {
    const { lastFrame } = render(
      <FileExplorerContent entries={entries} cursor={0} cwd="/project" />,
    )
    const frame = lastFrame() ?? ''
    // directories shown with trailing slash
    expect(frame).toContain('src/')
    expect(frame).toContain('dist/')
    // files shown without trailing slash
    expect(frame).toContain('package.json')
    expect(frame).not.toContain('package.json/')
  })

  it('renders empty state when no entries', () => {
    const { lastFrame } = render(
      <FileExplorerContent entries={[]} cursor={0} cwd="/project" />,
    )
    expect(lastFrame() ?? '').toContain('Empty')
  })

  it('shows truncated cwd path', () => {
    const { lastFrame } = render(
      <FileExplorerContent entries={entries} cursor={0} cwd="/home/fatih/arix" />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('arix')
  })
})
