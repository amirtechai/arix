import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import type { SessionSummary } from '@arix-code/core'

interface SessionPickerProps {
  sessions: SessionSummary[]
  onSelect: (session: SessionSummary) => void
  onCancel: () => void
}

export interface SessionPickerContentProps {
  sessions: SessionSummary[]
  query: string
  cursor: number
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

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

/** Pure rendering component — no useInput, safe to unit test */
export function SessionPickerContent({ sessions, query, cursor }: SessionPickerContentProps): React.ReactElement {
  const filtered = sessions.filter((s) => fuzzyMatch(query, s.title))

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      width={70}
    >
      <Text bold color="cyan">Session Picker</Text>
      <Box gap={1} marginY={1}>
        <Text color="gray">Search:</Text>
        <Text>{query}<Text color="cyan">_</Text></Text>
      </Box>
      {filtered.length === 0 ? (
        <Text color="gray" dimColor>No sessions match</Text>
      ) : (
        filtered.slice(0, 10).map((s, i) => (
          <Box key={s.id} gap={2}>
            <Text color={i === cursor ? 'cyan' : 'gray'}>{i === cursor ? '›' : ' '}</Text>
            <Text color={i === cursor ? 'white' : 'gray'}>
              {s.title.slice(0, 40).padEnd(40)}
            </Text>
            <Text color="gray" dimColor>{relativeTime(s.updatedAt)}</Text>
            <Text color="gray" dimColor>{s.messageCount}msg</Text>
          </Box>
        ))
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>↑↓ navigate  ↵ select  Esc cancel</Text>
      </Box>
    </Box>
  )
}

/** Full interactive picker — uses useInput for keyboard handling */
export function SessionPicker({ sessions, onSelect, onCancel }: SessionPickerProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const filtered = sessions.filter((s) => fuzzyMatch(query, s.title))

  useEffect(() => { setCursor(0) }, [query])

  const handleInput = useCallback((input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
    if (key.escape || (key.ctrl && input === 'r')) { onCancel(); return }
    if (key.upArrow) { setCursor((c) => Math.max(0, c - 1)); return }
    if (key.downArrow) { setCursor((c) => Math.min(filtered.length - 1, c + 1)); return }
    if (key.return) { const s = filtered[cursor]; if (s) onSelect(s); return }
    if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); return }
    if (input && !key.ctrl && !key.meta) setQuery((q) => q + input)
  }, [filtered, cursor, onCancel, onSelect])

  useInput(handleInput)

  return <SessionPickerContent sessions={sessions} query={query} cursor={cursor} />
}
