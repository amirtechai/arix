import React, { useEffect, useRef } from 'react'
import type { Session } from '../types.js'
import { MessageBubble } from './MessageBubble.js'
import { api } from '../api.js'

interface SessionDetailProps {
  session: Session | null
  loading: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TokenBar({ input, output }: { input: number; output: number }) {
  const total = input + output
  if (total === 0) return null
  const inputPct = Math.round((input / total) * 100)
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span>Tokens:</span>
      <div className="flex h-2 w-24 rounded overflow-hidden bg-border">
        <div className="bg-primary/70" style={{ width: `${inputPct}%` }} />
        <div className="bg-green-500/60 flex-1" />
      </div>
      <span className="text-primary">{input.toLocaleString()} in</span>
      <span className="text-green-400">{output.toLocaleString()} out</span>
    </div>
  )
}

export function SessionDetail({ session, loading }: SessionDetailProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        Loading session…
      </div>
    )
  }

  if (session === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
        <div className="text-4xl opacity-20">💬</div>
        <div className="text-sm">Select a session to view</div>
      </div>
    )
  }

  const visibleMessages = session.messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Session header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface flex-shrink-0">
        <div>
          <h2 className="text-white font-semibold text-sm">{session.title}</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-primary">{session.model}</span>
            <span className="text-xs text-muted">{session.provider}</span>
            <span className="text-xs text-muted">{formatDate(session.createdAt)}</span>
            {session.cwd && (
              <span className="text-xs text-muted font-mono truncate max-w-48">{session.cwd}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <TokenBar input={session.tokenUsage.input} output={session.tokenUsage.output} />
          <a
            href={api.exportUrl(session.id)}
            download={`${session.id}.md`}
            className="text-xs bg-border hover:bg-border/80 text-white px-3 py-1.5 rounded transition-colors"
          >
            Export .md
          </a>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {visibleMessages.length === 0 ? (
          <div className="text-center text-muted text-sm py-8">No messages</div>
        ) : (
          visibleMessages.map((msg, i) => (
            <MessageBubble key={msg.id ?? i} message={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
