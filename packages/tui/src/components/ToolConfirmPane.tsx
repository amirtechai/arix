import React from 'react'
import { Box, Text, useInput } from 'ink'
import type { ToolConfirmationRequest } from '@arix/core'

interface ToolConfirmPaneProps {
  request: ToolConfirmationRequest
}

export function ToolConfirmPane({ request }: ToolConfirmPaneProps): React.ReactElement {
  useInput((_input, key) => {
    if (key.return || _input === 'y' || _input === 'Y') {
      request.resolve(true)
    } else if (_input === 'n' || _input === 'N' || key.escape) {
      request.resolve(false)
    }
  })

  const inputStr = JSON.stringify(request.input, null, 2)
  const truncated = inputStr.length > 300 ? inputStr.slice(0, 300) + '\n…' : inputStr

  return (
    <Box
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      gap={1}
    >
      <Text color="yellow" bold>⚠  Tool requires confirmation</Text>
      <Box gap={2}>
        <Text color="cyan" bold>Tool:</Text>
        <Text>{request.tool}</Text>
      </Box>
      <Box flexDirection="column">
        <Text color="cyan" bold>Input:</Text>
        <Text color="gray" dimColor>{truncated}</Text>
      </Box>
      <Text color="gray">Press <Text color="green" bold>Y</Text> / Enter to allow  ·  <Text color="red" bold>N</Text> / Esc to deny</Text>
    </Box>
  )
}
