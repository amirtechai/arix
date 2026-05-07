import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import type { SessionSummary } from '@arix-code/core'

export interface LauncherContentProps {
  sessions: SessionSummary[]
  /** 0 = "New session", 1+ = sessions[cursor - 1] */
  cursor: number
}

export interface LauncherProps {
  sessions: SessionSummary[]
  /** Called with undefined to start a new session, or a session id to resume */
  onSelect: (sessionId: string | undefined) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Pure rendering — no useInput, safe to unit test */
export function LauncherContent({ sessions, cursor }: LauncherContentProps): React.ReactElement {
  const items = sessions.slice(0, 9)

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      width={72}
    >
      <Text bold color="cyan">Arix — Welcome</Text>
      <Box marginTop={1} flexDirection="column">
        {/* New session row */}
        <Box gap={2}>
          <Text color={cursor === 0 ? 'cyan' : 'gray'}>{cursor === 0 ? '›' : ' '}</Text>
          <Text color={cursor === 0 ? 'white' : 'gray'} bold={cursor === 0}>New session</Text>
        </Box>

        {/* Existing sessions */}
        {items.length === 0 ? (
          <Box marginTop={1}>
            <Text color="gray" dimColor>No previous sessions</Text>
          </Box>
        ) : (
          items.map((s, i) => {
            const active = cursor === i + 1
            return (
              <Box key={s.id} gap={2}>
                <Text color={active ? 'cyan' : 'gray'}>{active ? '›' : ' '}</Text>
                <Text color={active ? 'white' : 'gray'}>
                  {s.title.slice(0, 42).padEnd(42)}
                </Text>
                <Text color="gray" dimColor>{relativeTime(s.updatedAt)}</Text>
                <Text color="gray" dimColor>{s.messageCount}msg</Text>
              </Box>
            )
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>↑↓ navigate  ↵ select</Text>
      </Box>
    </Box>
  )
}

/** Full interactive launcher — uses useInput for keyboard handling */
export function Launcher({ sessions, onSelect }: LauncherProps): React.ReactElement {
  const [cursor, setCursor] = useState(0)
  const maxCursor = sessions.length  // 0=new, 1..n=sessions

  const handleInput = useCallback(
    (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
      if (key.upArrow) { setCursor((c) => Math.max(0, c - 1)); return }
      if (key.downArrow) { setCursor((c) => Math.min(maxCursor, c + 1)); return }
      if (key.return) {
        if (cursor === 0) {
          onSelect(undefined)
        } else {
          const session = sessions[cursor - 1]
          if (session) onSelect(session.id)
        }
      }
    },
    [cursor, maxCursor, sessions, onSelect],
  )

  useInput(handleInput)

  return <LauncherContent sessions={sessions} cursor={cursor} />
}
