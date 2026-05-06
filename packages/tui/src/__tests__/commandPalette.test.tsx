import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { CommandPaletteContent } from '../components/CommandPalette.js'

const commands = [
  { name: 'skill list', description: 'List available skills' },
  { name: 'skill use', description: 'Activate a skill' },
  { name: 'session list', description: 'List saved sessions' },
  { name: 'config set', description: 'Set a config value' },
]

describe('CommandPaletteContent', () => {
  it('shows all commands when query is empty', () => {
    const { lastFrame } = render(
      <CommandPaletteContent commands={commands} query="" cursor={0} />,
    )
    expect(lastFrame()).toContain('skill list')
    expect(lastFrame()).toContain('session list')
    expect(lastFrame()).toContain('config set')
  })

  it('filters commands by query substring', () => {
    const { lastFrame } = render(
      <CommandPaletteContent commands={commands} query="skill" cursor={0} />,
    )
    expect(lastFrame()).toContain('skill list')
    expect(lastFrame()).toContain('skill use')
    expect(lastFrame()).not.toContain('session list')
  })

  it('shows description alongside command name', () => {
    const { lastFrame } = render(
      <CommandPaletteContent commands={commands} query="" cursor={0} />,
    )
    expect(lastFrame()).toContain('List available skills')
  })

  it('shows empty state when no commands match', () => {
    const { lastFrame } = render(
      <CommandPaletteContent commands={commands} query="zzznomatch" cursor={0} />,
    )
    expect(lastFrame()).toContain('No commands match')
  })

  it('highlights cursor row with › indicator', () => {
    const { lastFrame } = render(
      <CommandPaletteContent commands={commands} query="" cursor={0} />,
    )
    expect(lastFrame()).toContain('›')
  })

  it('shows search prompt', () => {
    const { lastFrame } = render(
      <CommandPaletteContent commands={commands} query="sk" cursor={0} />,
    )
    expect(lastFrame()).toContain('>')
    expect(lastFrame()).toContain('sk')
  })
})
