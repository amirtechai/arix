import React, { useEffect, useState } from 'react'
import { api } from './api.js'
import type { Session, SessionSummary, Stats } from './types.js'
import { StatsBar } from './components/StatsBar.js'
import { SessionList } from './components/SessionList.js'
import { SessionDetail } from './components/SessionDetail.js'
import { CostChart } from './components/CostChart.js'
import { MemoryViewer } from './components/MemoryViewer.js'
import { ChatTab } from './components/ChatTab.js'

type Tab = 'chat' | 'sessions' | 'costs' | 'memory'

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'text-white border-b-2 border-primary'
          : 'text-muted hover:text-white border-b-2 border-transparent'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('chat')

  useEffect(() => {
    Promise.all([api.listSessions(), api.getStats()])
      .then(([s, st]) => {
        setSessions(s)
        setStats(st)
        if (s.length > 0 && selectedId === null) setSelectedId(s[0]!.id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  useEffect(() => {
    if (selectedId === null) return
    setLoadingSession(true)
    api.getSession(selectedId)
      .then((s) => setActiveSession(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load session'))
      .finally(() => setLoadingSession(false))
  }, [selectedId])

  if (error !== null) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center text-red-400">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base text-white flex flex-col">
      <StatsBar stats={stats} />

      {/* Tab bar */}
      <div className="bg-surface border-b border-border flex items-center px-4">
        <TabButton label="Chat" active={tab === 'chat'} onClick={() => setTab('chat')} />
        <TabButton label="Sessions" active={tab === 'sessions'} onClick={() => setTab('sessions')} />
        <TabButton label="Costs" active={tab === 'costs'} onClick={() => setTab('costs')} />
        <TabButton label="Memory" active={tab === 'memory'} onClick={() => setTab('memory')} />
      </div>

      {/* Tab content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 100px)' }}>
        {tab === 'chat' && <ChatTab />}
        {tab === 'sessions' && (
          <>
            <SessionList sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />
            <SessionDetail session={activeSession} loading={loadingSession} />
          </>
        )}
        {tab === 'costs' && <CostChart />}
        {tab === 'memory' && <MemoryViewer />}
      </div>
    </div>
  )
}
