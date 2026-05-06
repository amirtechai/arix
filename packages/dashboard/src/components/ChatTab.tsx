import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function stop(): void {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  async function send(): Promise<void> {
    const text = input.trim()
    if (!text || streaming) return
    setError(null)
    setInput('')

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }]
    setMessages(next)
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const stream = api.streamChat(
        { messages: next.slice(0, -1) },
        ctrl.signal,
      )

      for await (const ev of stream) {
        if (ev.event === 'text') {
          const chunk = (ev.data as { chunk?: string }).chunk ?? ''
          setMessages((prev) => {
            const copy = prev.slice()
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + chunk }
            }
            return copy
          })
        } else if (ev.event === 'error') {
          setError((ev.data as { message?: string }).message ?? 'unknown error')
          break
        } else if (ev.event === 'done') {
          break
        }
      }
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Stream failed')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function clear(): void {
    if (streaming) return
    setMessages([])
    setError(null)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-muted text-sm text-center mt-12">
            Start a conversation. Uses your configured provider/model.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] px-4 py-2 rounded-lg whitespace-pre-wrap text-sm ${
                m.role === 'user' ? 'bg-primary text-white' : 'bg-surface text-white border border-border'
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
        {error !== null && (
          <div className="text-red-400 text-sm border border-red-900 rounded p-2 bg-red-950/30">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface p-3 flex gap-2">
        <textarea
          className="flex-1 bg-base text-white rounded px-3 py-2 text-sm resize-none border border-border focus:border-primary focus:outline-none"
          rows={2}
          placeholder="Type a message — Enter to send, Shift+Enter for newline"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
        />
        {streaming ? (
          <button
            onClick={stop}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm"
          >
            Stop
          </button>
        ) : (
          <>
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="px-4 py-2 bg-primary hover:opacity-80 text-white rounded text-sm disabled:opacity-40"
            >
              Send
            </button>
            <button
              onClick={clear}
              disabled={messages.length === 0}
              className="px-3 py-2 text-muted hover:text-white text-sm disabled:opacity-40"
            >
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  )
}
