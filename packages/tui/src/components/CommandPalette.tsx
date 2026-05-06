import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'

export interface PaletteCommand {
  name: string
  description: string
}

export interface CommandPaletteContentProps {
  commands: PaletteCommand[]
  query: string
  cursor: number
}

export interface CommandPaletteProps {
  commands: PaletteCommand[]
  onSelect: (command: PaletteCommand) => void
  onClose: () => void
}

function matches(query: string, cmd: PaletteCommand): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return cmd.name.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q)
}

/** Pure rendering — no useInput, safe to unit test */
export function CommandPaletteContent({
  commands,
  query,
  cursor,
}: CommandPaletteContentProps): React.ReactElement {
  const filtered = commands.filter((c) => matches(query, c))

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      width={72}
    >
      <Text bold color="cyan">Command Palette</Text>

      {/* Search input */}
      <Box marginTop={1} gap={1}>
        <Text color="cyan">{'>'}</Text>
        <Text>{query}<Text color="cyan">_</Text></Text>
      </Box>

      {/* Command list */}
      <Box marginTop={1} flexDirection="column">
        {filtered.length === 0 ? (
          <Text color="gray" dimColor>No commands match</Text>
        ) : (
          filtered.slice(0, 10).map((cmd, i) => {
            const active = i === cursor
            return (
              <Box key={cmd.name} gap={2}>
                <Text color={active ? 'cyan' : 'gray'}>{active ? '›' : ' '}</Text>
                <Text color={active ? 'white' : 'gray'} bold={active}>
                  {cmd.name.padEnd(20)}
                </Text>
                <Text color="gray" dimColor>{cmd.description}</Text>
              </Box>
            )
          })
        )}
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>↑↓ navigate  ↵ run  Esc close</Text>
      </Box>
    </Box>
  )
}

/** Full interactive palette — uses useInput */
export function CommandPalette({
  commands,
  onSelect,
  onClose,
}: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const filtered = commands.filter((c) => matches(query, c))

  const handleInput = useCallback(
    (input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) => {
      if (key.escape) { onClose(); return }
      if (key.upArrow) { setCursor((c) => Math.max(0, c - 1)); return }
      if (key.downArrow) { setCursor((c) => Math.min(filtered.length - 1, c + 1)); return }
      if (key.return) {
        const cmd = filtered[cursor]
        if (cmd) { onSelect(cmd); return }
      }
      if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); return }
      if (input && !key.ctrl && !key.meta) setQuery((q) => q + input)
    },
    [filtered, cursor, onClose, onSelect],
  )

  useInput(handleInput)

  return <CommandPaletteContent commands={commands} query={query} cursor={cursor} />
}
