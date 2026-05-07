import { useState, useCallback, useEffect, useRef } from 'react'
import type { AgentEvent, ToolConfirmationRequest } from '@arix-code/core'
import { StreamState } from './StreamState.js'
import type { ChatMessage } from '../types.js'

export interface UseStreamResult {
  messages: ChatMessage[]
  streaming: boolean
  error: string | undefined
  pendingConfirm: ToolConfirmationRequest | undefined
  addUserMessage: (content: string) => void
  consume: (stream: AsyncIterable<AgentEvent>) => Promise<void>
  clearError: () => void
}

export function useStream(initialMessages?: ChatMessage[]): UseStreamResult {
  const stateRef = useRef<StreamState>(new StreamState(initialMessages))
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return stateRef.current.onChange(() => forceUpdate((n) => n + 1))
  }, [])

  const addUserMessage = useCallback((content: string) => {
    stateRef.current.addUserMessage(content)
  }, [])

  const consume = useCallback(async (stream: AsyncIterable<AgentEvent>): Promise<void> => {
    await stateRef.current.consume(stream)
  }, [])

  const clearError = useCallback(() => {
    stateRef.current.clearError()
  }, [])

  const s = stateRef.current
  return {
    messages: s.messages,
    streaming: s.streaming,
    error: s.error,
    pendingConfirm: s.pendingConfirm,
    addUserMessage,
    consume,
    clearError,
  }
}
