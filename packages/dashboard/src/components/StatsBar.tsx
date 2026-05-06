import React from 'react'
import type { Stats } from '../types.js'

interface StatsBarProps {
  stats: Stats | null
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center px-6 py-2 border-r border-border last:border-r-0">
      <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
      <span className="text-lg font-semibold text-white mt-0.5">{value}</span>
    </div>
  )
}

function topEntry(record: Record<string, number>): string {
  const entries = Object.entries(record)
  if (entries.length === 0) return '—'
  entries.sort((a, b) => b[1] - a[1])
  return entries[0]![0]
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function StatsBar({ stats }: StatsBarProps) {
  if (stats === null) {
    return (
      <div className="h-16 bg-surface border-b border-border flex items-center px-6">
        <span className="text-muted text-sm">Loading stats…</span>
      </div>
    )
  }

  return (
    <div className="bg-surface border-b border-border flex items-stretch">
      <div className="flex items-center px-5 py-3 border-r border-border">
        <span className="text-primary font-bold text-lg tracking-tight">Arix</span>
        <span className="text-muted ml-2 text-sm">dashboard</span>
      </div>
      <div className="flex items-stretch">
        <StatItem label="Sessions" value={stats.totalSessions} />
        <StatItem label="Messages" value={stats.totalMessages} />
        <StatItem label="Tokens" value={formatTokens(stats.totalTokens)} />
        <StatItem label="Top Model" value={topEntry(stats.models)} />
        <StatItem label="Provider" value={topEntry(stats.providers)} />
      </div>
    </div>
  )
}
