import React from 'react'
import { Box, Text } from 'ink'

export interface DiffViewerProps {
  diff: string
  fileName: string
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk' | 'header'
  content: string
}

function parseDiff(diff: string): { lines: DiffLine[]; added: number; removed: number } {
  let added = 0
  let removed = 0
  const lines: DiffLine[] = []

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++') || raw.startsWith('---')) {
      lines.push({ type: 'header', content: raw })
    } else if (raw.startsWith('@@')) {
      lines.push({ type: 'hunk', content: raw })
    } else if (raw.startsWith('+')) {
      added++
      lines.push({ type: 'add', content: raw })
    } else if (raw.startsWith('-')) {
      removed++
      lines.push({ type: 'remove', content: raw })
    } else if (raw.trim() !== '') {
      lines.push({ type: 'context', content: raw })
    }
  }

  return { lines, added, removed }
}

export function DiffViewer({ diff, fileName }: DiffViewerProps): React.ReactElement {
  const { lines, added, removed } = parseDiff(diff)

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      paddingX={1}
      paddingY={0}
    >
      {/* Header */}
      <Box gap={2} paddingX={1}>
        <Text bold color="cyan">{fileName}</Text>
        <Text color="green">+{added}</Text>
        <Text color="red">-{removed}</Text>
      </Box>

      {/* Diff lines */}
      {lines.length === 0 ? (
        <Box paddingX={1}>
          <Text color="gray" dimColor>No changes</Text>
        </Box>
      ) : (
        lines.map((line, i) => {
          switch (line.type) {
            case 'add':
              return (
                <Box key={i} paddingX={1}>
                  <Text color="green">{line.content}</Text>
                </Box>
              )
            case 'remove':
              return (
                <Box key={i} paddingX={1}>
                  <Text color="red">{line.content}</Text>
                </Box>
              )
            case 'hunk':
              return (
                <Box key={i} paddingX={1}>
                  <Text color="cyan" dimColor>{line.content}</Text>
                </Box>
              )
            case 'header':
              return (
                <Box key={i} paddingX={1}>
                  <Text color="gray" dimColor>{line.content}</Text>
                </Box>
              )
            default:
              return (
                <Box key={i} paddingX={1}>
                  <Text color="gray">{line.content}</Text>
                </Box>
              )
          }
        })
      )}
    </Box>
  )
}
