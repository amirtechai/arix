import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { CostData } from '../types.js'

function BarChart({ data, maxVal }: { data: { label: string; value: number }[]; maxVal: number }) {
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map(({ label, value }) => {
        const pct = maxVal > 0 ? (value / maxVal) * 100 : 0
        return (
          <div key={label} className="flex flex-col items-center flex-1 min-w-0" title={`${label}: $${value.toFixed(4)}`}>
            <div
              className="w-full bg-primary rounded-t transition-all"
              style={{ height: `${pct}%`, minHeight: value > 0 ? '2px' : '0' }}
            />
            <span className="text-muted text-xs mt-1 truncate w-full text-center">{label.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function CostChart() {
  const [data, setData] = useState<CostData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getCosts()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>
  if (!data) return <div className="p-6 text-muted text-sm">Loading cost data…</div>

  const maxDay = Math.max(...data.byDay.map((d) => d.usd), 0.0001)

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      {/* Summary */}
      <div className="flex gap-6">
        <div className="bg-surface rounded-lg p-4 flex-1">
          <div className="text-muted text-xs uppercase tracking-wider mb-1">Total Spend</div>
          <div className="text-2xl font-bold text-white">${data.totalUsd.toFixed(4)}</div>
        </div>
        <div className="bg-surface rounded-lg p-4 flex-1">
          <div className="text-muted text-xs uppercase tracking-wider mb-1">Sessions with Cost</div>
          <div className="text-2xl font-bold text-white">{data.totalSessions}</div>
        </div>
        <div className="bg-surface rounded-lg p-4 flex-1">
          <div className="text-muted text-xs uppercase tracking-wider mb-1">Avg per Session</div>
          <div className="text-2xl font-bold text-white">
            {data.totalSessions > 0 ? `$${(data.totalUsd / data.totalSessions).toFixed(4)}` : '—'}
          </div>
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="bg-surface rounded-lg p-4">
        <div className="text-sm font-medium text-white mb-4">Daily Spend (last 30 days)</div>
        {data.byDay.length === 0
          ? <div className="text-muted text-sm">No cost data yet</div>
          : <BarChart
              data={data.byDay.map((d) => ({ label: d.date, value: d.usd }))}
              maxVal={maxDay}
            />
        }
      </div>

      {/* Per-model breakdown */}
      <div className="bg-surface rounded-lg p-4">
        <div className="text-sm font-medium text-white mb-4">Cost by Model</div>
        {data.byModel.length === 0
          ? <div className="text-muted text-sm">No data</div>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase border-b border-border">
                  <th className="text-left py-2 pr-4">Model</th>
                  <th className="text-right py-2 pr-4">Sessions</th>
                  <th className="text-right py-2 pr-4">Input Tokens</th>
                  <th className="text-right py-2 pr-4">Output Tokens</th>
                  <th className="text-right py-2">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.map((m) => (
                  <tr key={m.model} className="border-b border-border last:border-0 hover:bg-base/50">
                    <td className="py-2 pr-4 text-white font-mono text-xs">{m.model}</td>
                    <td className="py-2 pr-4 text-right text-muted">{m.sessions}</td>
                    <td className="py-2 pr-4 text-right text-muted">{m.input.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right text-muted">{m.output.toLocaleString()}</td>
                    <td className="py-2 text-right text-primary font-medium">${m.usd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  )
}
