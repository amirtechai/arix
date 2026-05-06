import React from 'react'
import { Box, Text } from 'ink'
import type { ChatMessage } from '../types.js'

interface MessageListProps {
  messages: ChatMessage[]
}

function UserMessage({ msg }: { msg: ChatMessage }): React.ReactElement {
  return (
    <Box marginY={1}>
      <Text color="green" bold>{'> '}</Text>
      <Text wrap="wrap">{msg.content}</Text>
    </Box>
  )
}

function AssistantMessage({ msg }: { msg: ChatMessage }): React.ReactElement {
  return (
    <Box marginY={1} flexDirection="column">
      <Text color="blue" bold dimColor>{'◆ '}</Text>
      <Text wrap="wrap">
        {msg.content}
        {msg.streaming === true && <Text color="yellow">▌</Text>}
      </Text>
    </Box>
  )
}

function ToolMessage({ msg }: { msg: ChatMessage }): React.ReactElement {
  const icon = msg.toolSuccess === false ? '✗' : msg.streaming ? '⟳' : '✓'
  const color = msg.toolSuccess === false ? 'red' : msg.streaming ? 'yellow' : 'green'

  return (
    <Box marginY={1} borderStyle="round" borderColor={color} paddingX={1} flexDirection="column">
      <Box gap={1}>
        <Text color={color}>{icon}</Text>
        <Text color="cyan" bold>{msg.toolName ?? 'tool'}</Text>
      </Box>
      {msg.content !== '' && (
        <Text color="gray" dimColor wrap="wrap">
          {msg.content.length > 200 ? msg.content.slice(0, 200) + '…' : msg.content}
        </Text>
      )}
    </Box>
  )
}

export function MessageList({ messages }: MessageListProps): React.ReactElement {
  if (messages.length === 0) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray" dimColor>Type a message to start…</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.map((msg) => {
        switch (msg.role) {
          case 'user':
            return <UserMessage key={msg.id} msg={msg} />
          case 'assistant':
            return <AssistantMessage key={msg.id} msg={msg} />
          case 'tool':
            return <ToolMessage key={msg.id} msg={msg} />
          default:
            return null
        }
      })}
    </Box>
  )
}
