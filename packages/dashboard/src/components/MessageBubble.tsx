import React from 'react'
import type { Message } from '../types.js'

interface MessageBubbleProps {
  message: Message
}

function formatTime(ts?: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted bg-base px-3 py-1 rounded-full border border-border">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 my-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          isUser ? 'bg-primary text-white' : 'bg-border text-muted'
        }`}
      >
        {isUser ? 'U' : 'G'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-primary/20 border border-primary/30 text-white'
              : 'bg-surface border border-border text-gray-200'
          }`}
        >
          {message.content}
        </div>
        {message.timestamp !== undefined && (
          <span className="text-xs text-muted mt-1 px-1">{formatTime(message.timestamp)}</span>
        )}
      </div>
    </div>
  )
}
