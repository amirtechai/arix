import React from 'react'
import { render } from 'ink-testing-library'
import { describe, it, expect } from 'vitest'
import { SplitPane } from '../components/SplitPane.js'
import { Text } from 'ink'

describe('SplitPane', () => {
  it('renders both left and right children', () => {
    const { lastFrame } = render(
      <SplitPane
        left={<Text>left content</Text>}
        right={<Text>right content</Text>}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('left content')
    expect(frame).toContain('right content')
  })

  it('renders a divider between panes', () => {
    const { lastFrame } = render(
      <SplitPane
        left={<Text>left</Text>}
        right={<Text>right</Text>}
      />,
    )
    const frame = lastFrame() ?? ''
    // Should have some separator character
    expect(frame).toContain('│')
  })
})
