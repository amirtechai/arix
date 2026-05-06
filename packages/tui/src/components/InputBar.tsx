import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'

interface InputBarProps {
  onSubmit: (value: string) => void
  disabled?: boolean
  placeholder?: string
}

export function InputBar({ onSubmit, disabled = false, placeholder = 'Type a message…' }: InputBarProps): React.ReactElement {
  const [value, setValue] = useState('')

  useInput((_input, key) => {
    if (disabled) return
    if (key.return && value.trim() !== '') {
      onSubmit(value.trim())
      setValue('')
    }
  })

  return (
    <Box borderStyle="single" borderTop paddingX={1} gap={1}>
      <Text color={disabled ? 'gray' : 'green'} bold>{'>'}</Text>
      {disabled ? (
        <Text color="gray">{placeholder}</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          placeholder={placeholder}
          onSubmit={(val) => {
            if (val.trim()) {
              onSubmit(val.trim())
              setValue('')
            }
          }}
        />
      )}
    </Box>
  )
}
