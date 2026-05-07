import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { LauncherContent } from '../components/Launcher.js'
import type { SessionSummary } from '@arix-code/core'

const sessions: SessionSummary[] = [
  {
    id: 'abc-1',
    title: 'Fix the login bug',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    messageCount: 12,
  },
  {
    id: 'abc-2',
    title: 'Add dark mode',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    provider: 'openai',
    model: 'gpt-4o',
    messageCount: 5,
  },
]

describe('LauncherContent', () => {
  it('always shows "New session" option', () => {
    const { lastFrame } = render(<LauncherContent sessions={[]} cursor={0} />)
    expect(lastFrame()).toContain('New session')
  })

  it('shows session titles when sessions exist', () => {
    const { lastFrame } = render(<LauncherContent sessions={sessions} cursor={0} />)
    expect(lastFrame()).toContain('Fix the login bug')
    expect(lastFrame()).toContain('Add dark mode')
  })

  it('shows empty state message when no prior sessions', () => {
    const { lastFrame } = render(<LauncherContent sessions={[]} cursor={0} />)
    expect(lastFrame()).toContain('No previous sessions')
  })

  it('highlights cursor with › indicator', () => {
    const { lastFrame } = render(<LauncherContent sessions={sessions} cursor={0} />)
    expect(lastFrame()).toContain('›')
  })

  it('shows message counts for sessions', () => {
    const { lastFrame } = render(<LauncherContent sessions={sessions} cursor={0} />)
    expect(lastFrame()).toContain('12msg')
  })
})
