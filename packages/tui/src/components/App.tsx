import React, { useCallback, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { StatusBar } from './StatusBar.js'
import { MessageList } from './MessageList.js'
import { InputBar } from './InputBar.js'
import { ToolConfirmPane } from './ToolConfirmPane.js'
import { CommandPalette } from './CommandPalette.js'
import type { PaletteCommand } from './CommandPalette.js'
import { SplitPane } from './SplitPane.js'
import { FileExplorer } from './FileExplorer.js'
import { useStream } from '../hooks/useStream.js'
import type { AgentLoop, Session, SessionManager } from '@arix-code/core'
import type { ChatMessage } from '../types.js'

export interface AppProps {
  loop: AgentLoop
  model: string
  sessionTitle?: string
  /** Context window size — enables the token budget indicator */
  contextLimit?: number
  /** Loaded session for resume — messages are displayed and context is preserved */
  session?: Session
  sessionManager?: SessionManager
}

const PALETTE_COMMANDS: PaletteCommand[] = [
  { name: 'skill list', description: 'List available skills' },
  { name: 'skill use <name>', description: 'Activate a skill' },
  { name: 'session list', description: 'List saved sessions' },
  { name: 'config set <key> <value>', description: 'Set a config value' },
  { name: 'config list', description: 'Show all config values' },
]

/** Extract plain text from a message's content (string or ContentBlock[]) */
function contentToString(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
}

/** Convert a loaded Session's messages to ChatMessage[] for initial display */
function sessionToChatMessages(session: Session): ChatMessage[] {
  return session.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m, i) => ({
      id: m.id ?? String(i),
      role: m.role as 'user' | 'assistant',
      content: contentToString(m.content),
    }))
}

export function App({
  loop,
  model,
  sessionTitle,
  contextLimit,
  session,
  sessionManager,
}: AppProps): React.ReactElement {
  const { exit } = useApp()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)

  const initialMessages = session !== undefined ? sessionToChatMessages(session) : undefined
  const { messages, streaming, error, pendingConfirm, addUserMessage, consume } = useStream(initialMessages)

  const derivedTitle = sessionTitle ?? session?.title ?? 'New session'
  const tokenCount = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)  // content is string in ChatMessage

  const handleSubmit = useCallback(
    async (message: string) => {
      if (streaming) return
      addUserMessage(message)
      const stream = loop.run(message)
      await consume(stream)

      // Persist session after each turn
      if (sessionManager !== undefined && session !== undefined) {
        const history = loop.getHistory()
        const updated: Session = {
          ...session,
          messages: history as Session['messages'],
          title: session.title === 'New session' && history.length > 0
            ? (contentToString(history[0]?.content ?? '').slice(0, 60).replace(/\n/g, ' ').trim() || session.title)
            : session.title,
        }
        await sessionManager.save(updated)
      }
    },
    [streaming, addUserMessage, loop, consume, session, sessionManager],
  )

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') { exit(); return }
    if (key.ctrl && _input === 'k') { setPaletteOpen((v) => !v); return }
    if (key.ctrl && _input === 'p') { setSplitOpen((v) => !v); return }
  })

  if (paletteOpen) {
    return (
      <Box flexDirection="column" height="100%">
        <StatusBar
          title={derivedTitle}
          model={model}
          tokenCount={tokenCount}
          streaming={streaming}
          {...(contextLimit !== undefined ? { contextLimit } : {})}
        />
        <CommandPalette
          commands={PALETTE_COMMANDS}
          onSelect={(_cmd) => setPaletteOpen(false)}
          onClose={() => setPaletteOpen(false)}
        />
      </Box>
    )
  }

  const chatPane = (
    <>
      <MessageList messages={messages} />

      {error !== undefined && (
        <Box paddingX={1} borderStyle="single" borderColor="red" gap={1}>
          <Text color="red">⚠</Text>
          <Text color="red">{error}</Text>
          <Text color="gray" dimColor>(press any key to dismiss)</Text>
        </Box>
      )}

      {pendingConfirm !== undefined && (
        <ToolConfirmPane request={pendingConfirm} />
      )}
    </>
  )

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        title={derivedTitle}
        model={model}
        tokenCount={tokenCount}
        streaming={streaming}
        {...(contextLimit !== undefined ? { contextLimit } : {})}
      />

      {splitOpen ? (
        <SplitPane
          left={chatPane}
          right={<FileExplorer />}
        />
      ) : (
        chatPane
      )}

      <InputBar
        onSubmit={handleSubmit}
        disabled={streaming || pendingConfirm !== undefined}
        placeholder={
          streaming
            ? 'Waiting for response…'
            : splitOpen
              ? 'Type a message… (Ctrl+K: commands, Ctrl+P: hide explorer)'
              : 'Type a message… (Ctrl+K: commands, Ctrl+P: file explorer)'
        }
      />
    </Box>
  )
}
