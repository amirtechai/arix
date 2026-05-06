export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: string
  timestamp?: number
}

export interface SessionSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  provider: string
  model: string
  messageCount: number
}

export interface Session {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  cwd: string
  provider: string
  model: string
  messages: Message[]
  tokenUsage: { input: number; output: number }
}

export interface Stats {
  totalSessions: number
  totalMessages: number
  totalTokens: number
  models: Record<string, number>
  providers: Record<string, number>
}

export interface CostByDay {
  date: string
  usd: number
}

export interface CostByModel {
  model: string
  usd: number
  sessions: number
  input: number
  output: number
}

export interface CostData {
  totalUsd: number
  totalSessions: number
  byDay: CostByDay[]
  byModel: CostByModel[]
}

export interface MemoryEntry {
  key: string
  value: string
  updatedAt?: string
}

export interface MemoryData {
  cwd: string
  entries: MemoryEntry[]
}
