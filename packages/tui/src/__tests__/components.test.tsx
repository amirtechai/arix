import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { StatusBar } from '../components/StatusBar.js'
import { MessageList } from '../components/MessageList.js'
import type { ChatMessage } from '../types.js'

describe('StatusBar', () => {
  it('renders title and model', () => {
    const { lastFrame } = render(
      <StatusBar title="Test session" model="claude-3-5-sonnet" tokenCount={1234} />,
    )
    expect(lastFrame()).toContain('Test session')
    expect(lastFrame()).toContain('claude-3-5-sonnet')
    expect(lastFrame()).toContain('1234')
  })

  it('shows streaming indicator when streaming', () => {
    const { lastFrame } = render(
      <StatusBar title="Session" model="gpt-4o" tokenCount={0} streaming />,
    )
    expect(lastFrame()).toContain('●')
  })

  it('shows token budget percentage when contextLimit is provided', () => {
    const { lastFrame } = render(
      <StatusBar title="S" model="m" tokenCount={40000} contextLimit={100000} />,
    )
    expect(lastFrame()).toContain('40%')
  })

  it('shows filled budget bar proportional to usage', () => {
    const { lastFrame } = render(
      <StatusBar title="S" model="m" tokenCount={50000} contextLimit={100000} />,
    )
    // 50% — should show both filled (█) and empty (░) segments
    const frame = lastFrame() ?? ''
    expect(frame).toContain('█')
    expect(frame).toContain('░')
  })

  it('shows 100% when at context limit', () => {
    const { lastFrame } = render(
      <StatusBar title="S" model="m" tokenCount={100000} contextLimit={100000} />,
    )
    expect(lastFrame()).toContain('100%')
  })
})

describe('MessageList', () => {
  const messages: ChatMessage[] = [
    { id: '1', role: 'user', content: 'Hello there' },
    { id: '2', role: 'assistant', content: 'Hi! How can I help?' },
  ]

  it('renders user and assistant messages', () => {
    const { lastFrame } = render(<MessageList messages={messages} />)
    expect(lastFrame()).toContain('Hello there')
    expect(lastFrame()).toContain('Hi! How can I help?')
  })

  it('renders tool call message', () => {
    const toolMessages: ChatMessage[] = [
      {
        id: '3',
        role: 'tool',
        content: 'file contents here',
        toolName: 'read_file',
        toolSuccess: true,
      },
    ]
    const { lastFrame } = render(<MessageList messages={toolMessages} />)
    expect(lastFrame()).toContain('read_file')
  })

  it('renders empty state', () => {
    const { lastFrame } = render(<MessageList messages={[]} />)
    expect(lastFrame()).toBeTruthy()
  })
})
