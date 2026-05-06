import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { MemoryEntry } from '../types.js'

export function MemoryViewer() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [cwd, setCwd] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    api.getMemory()
      .then((d) => { setEntries(d.entries); setCwd(d.cwd) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }

  useEffect(() => { load() }, [])

  async function saveEdit() {
    if (!editKey) return
    setSaving(true)
    try {
      await api.updateMemory(cwd, editKey, editValue)
      setEditKey(null)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(key: string) {
    try {
      await api.deleteMemory(key, cwd)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  if (error) return <div className="p-6 text-red-400 text-sm">{error}</div>

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="bg-surface rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-medium text-white">Project Memory</div>
            <div className="text-xs text-muted mt-0.5">{cwd}</div>
          </div>
          <button
            className="text-xs text-primary hover:text-white px-3 py-1 border border-border rounded"
            onClick={load}
          >
            Refresh
          </button>
        </div>

        {entries.length === 0
          ? <div className="text-muted text-sm">No memory entries. Run <code className="text-primary">arix</code> in your project to generate them.</div>
          : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.key} className="border border-border rounded p-3">
                  {editKey === entry.key
                    ? (
                      <div>
                        <div className="text-xs text-muted mb-1 font-mono">{entry.key}</div>
                        <textarea
                          className="w-full bg-base text-white text-sm p-2 rounded border border-border resize-y min-h-16 font-mono focus:outline-none focus:border-primary"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={3}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            className="text-xs bg-primary text-white px-3 py-1 rounded disabled:opacity-50"
                            onClick={saveEdit}
                            disabled={saving}
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            className="text-xs text-muted hover:text-white px-3 py-1 border border-border rounded"
                            onClick={() => setEditKey(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )
                    : (
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted font-mono mb-1">{entry.key}</div>
                          <div className="text-sm text-white break-words">{entry.value}</div>
                          {entry.updatedAt && (
                            <div className="text-xs text-muted mt-1">
                              {new Date(entry.updatedAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            className="text-xs text-muted hover:text-primary px-2 py-1"
                            onClick={() => { setEditKey(entry.key); setEditValue(entry.value) }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs text-muted hover:text-red-400 px-2 py-1"
                            onClick={() => deleteEntry(entry.key)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  }
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
