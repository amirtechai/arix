import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { SessionPickerContent } from '../components/SessionPicker.js'
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

describe('SessionPickerContent', () => {
  it('renders session titles', () => {
    const { lastFrame } = render(
      <SessionPickerContent sessions={sessions} query="" cursor={0} />,
    )
    expect(lastFrame()).toContain('Fix the login bug')
    expect(lastFrame()).toContain('Add dark mode')
  })

  it('shows empty state when no sessions', () => {
    const { lastFrame } = render(
      <SessionPickerContent sessions={[]} query="" cursor={0} />,
    )
    expect(lastFrame()).toContain('No sessions match')
  })

  it('shows message counts', () => {
    const { lastFrame } = render(
      <SessionPickerContent sessions={sessions} query="" cursor={0} />,
    )
    expect(lastFrame()).toContain('12msg')
  })

  it('filters by query', () => {
    const { lastFrame } = render(
      <SessionPickerContent sessions={sessions} query="dark" cursor={0} />,
    )
    expect(lastFrame()).toContain('Add dark mode')
    expect(lastFrame()).not.toContain('Fix the login bug')
  })

  it('shows search prompt', () => {
    const { lastFrame } = render(
      <SessionPickerContent sessions={sessions} query="hello" cursor={0} />,
    )
    expect(lastFrame()).toContain('Search:')
    expect(lastFrame()).toContain('hello')
  })
})
