import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import fs from 'node:fs'
import path from 'node:path'

export interface FileEntry {
  name: string
  isDirectory: boolean
}

export interface FileExplorerContentProps {
  entries: FileEntry[]
  cursor: number
  cwd: string
}

/** Pure rendering — no useInput, safe to unit test */
export function FileExplorerContent({
  entries,
  cursor,
  cwd,
}: FileExplorerContentProps): React.ReactElement {
  const dirName = path.basename(cwd) || cwd

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1} gap={1}>
        <Text bold color="cyan">Files</Text>
        <Text color="gray" dimColor>{dirName}</Text>
      </Box>

      {/* Entry list */}
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {entries.length === 0 ? (
          <Text color="gray" dimColor>Empty</Text>
        ) : (
          entries.map((entry, i) => {
            const active = i === cursor
            const label = entry.isDirectory ? `${entry.name}/` : entry.name
            return (
              <Box key={entry.name} gap={1}>
                <Text color={active ? 'cyan' : 'gray'}>{active ? '›' : ' '}</Text>
                <Text
                  color={active ? 'white' : entry.isDirectory ? 'blue' : 'gray'}
                  bold={active}
                >
                  {label}
                </Text>
              </Box>
            )
          })
        )}
      </Box>
    </Box>
  )
}

export interface FileExplorerProps {
  cwd?: string
}

function readEntries(dir: string): FileEntry[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.'))
      .sort((a, b) => {
        // Directories first, then files, both alphabetical
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((d) => ({ name: d.name, isDirectory: d.isDirectory() }))
  } catch {
    return []
  }
}

/** Interactive file explorer — handles keyboard navigation */
export function FileExplorer({ cwd: initialCwd }: FileExplorerProps): React.ReactElement {
  const [cwd, setCwd] = useState(initialCwd ?? process.cwd())
  const [entries, setEntries] = useState<FileEntry[]>(() => readEntries(initialCwd ?? process.cwd()))
  const [cursor, setCursor] = useState(0)

  const refresh = useCallback((dir: string) => {
    setEntries(readEntries(dir))
    setCursor(0)
  }, [])

  useEffect(() => {
    refresh(cwd)
  }, [cwd, refresh])

  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(entries.length - 1, c + 1))
      return
    }
    if (key.return) {
      const entry = entries[cursor]
      if (entry?.isDirectory) {
        const next = path.join(cwd, entry.name)
        setCwd(next)
      }
      return
    }
    if (key.backspace || key.delete || (_input === 'h' && !key.ctrl)) {
      const parent = path.dirname(cwd)
      if (parent !== cwd) {
        setCwd(parent)
      }
    }
  })

  return <FileExplorerContent entries={entries} cursor={cursor} cwd={cwd} />
}
