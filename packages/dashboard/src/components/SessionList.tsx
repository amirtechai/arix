import React, { useState } from 'react'
import type { SessionSummary } from '../types.js'

interface SessionListProps {
  sessions: SessionSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function SessionList({ sessions, selectedId, onSelect }: SessionListProps) {
  const [query, setQuery] = useState('')

  const filtered = sessions.filter(
    (s) =>
      query === '' ||
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.model.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="flex flex-col h-full bg-surface border-r border-border w-72 flex-shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <input
          type="text"
          placeholder="Search sessions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-base border border-border rounded px-3 py-1.5 text-sm text-white placeholder-muted focus:outline-none focus:border-primary"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-muted text-sm">
            {query ? 'No sessions match' : 'No sessions yet'}
          </div>
        ) : (
          filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-4 py-3 border-b border-border hover:bg-base transition-colors ${
                s.id === selectedId ? 'bg-base border-l-2 border-l-primary' : ''
              }`}
            >
              <div className="text-sm font-medium text-white truncate">{s.title}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-primary">{s.model}</span>
                <span className="text-xs text-muted">{s.messageCount} msgs</span>
                <span className="text-xs text-muted ml-auto">{timeAgo(s.updatedAt)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
