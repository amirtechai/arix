import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  title: string
  model: string
  tokenCount: number
  streaming?: boolean
  /** Context window size — enables the budget progress bar */
  contextLimit?: number
}

const BAR_WIDTH = 10

function budgetBar(pct: number): { bar: string; color: 'green' | 'yellow' | 'red' } {
  const filled = Math.round(pct * BAR_WIDTH)
  const empty = BAR_WIDTH - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  const color = pct >= 0.95 ? 'red' : pct >= 0.6 ? 'yellow' : 'green'
  return { bar, color }
}

export function StatusBar({
  title,
  model,
  tokenCount,
  streaming = false,
  contextLimit,
}: StatusBarProps): React.ReactElement {
  const budgetSection = contextLimit !== undefined && contextLimit > 0
    ? (() => {
        const pct = Math.min(tokenCount / contextLimit, 1)
        const { bar, color } = budgetBar(pct)
        const pctLabel = `${Math.round(pct * 100)}%`
        return { bar, color, pctLabel }
      })()
    : null

  return (
    <Box borderStyle="single" borderBottom paddingX={1} justifyContent="space-between">
      <Box gap={2}>
        <Text bold color="cyan">Arix</Text>
        <Text color="white">{title}</Text>
      </Box>
      <Box gap={2}>
        {streaming && <Text color="yellow">●</Text>}
        {budgetSection !== null && (
          <Box gap={1}>
            <Text color={budgetSection.color}>{budgetSection.bar}</Text>
            <Text color={budgetSection.color}>{budgetSection.pctLabel}</Text>
          </Box>
        )}
        <Text color="gray">{model}</Text>
        <Text color="gray">{tokenCount} tok</Text>
      </Box>
    </Box>
  )
}
