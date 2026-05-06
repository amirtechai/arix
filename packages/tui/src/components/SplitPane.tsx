import React from 'react'
import { Box, Text } from 'ink'

export interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
  /** Width ratio for left pane (0–1). Defaults to 0.6 */
  ratio?: number
}

/** Renders two panes side by side with a vertical divider */
export function SplitPane({ left, right }: SplitPaneProps): React.ReactElement {
  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Left pane */}
      <Box flexDirection="column" flexGrow={3} flexBasis={0} overflow="hidden">
        {left}
      </Box>

      {/* Vertical divider */}
      <Box flexDirection="column" width={1}>
        <Text color="gray">│</Text>
      </Box>

      {/* Right pane */}
      <Box flexDirection="column" flexGrow={2} flexBasis={0} overflow="hidden">
        {right}
      </Box>
    </Box>
  )
}
