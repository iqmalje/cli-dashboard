import type { AgentRow } from '../types'

export const MAX_ROWS = 5

export const spawn = (rows: readonly AgentRow[], row: AgentRow) => [...rows.filter(r => r.id !== row.id), row]

export const stop = (rows: readonly AgentRow[], id: string, now: number) =>
  rows.map(r => (r.id === id && r.endedAt === undefined ? { ...r, endedAt: now } : r))

export const setTokens = (rows: readonly AgentRow[], id: string, n: number) =>
  rows.map(r => (r.id === id ? { ...r, tokens: n } : r))

type UsageLine = { type?: string; message?: { id?: string; usage?: Record<string, number | undefined> } }

// Streaming rewrites a message id with growing usage, so the last line per id wins (as YAS reads it).
export const agentTokens = (jsonl: string) => {
  const byId = new Map<string, number>()
  for (const raw of jsonl.split('\n')) {
    if (!raw.includes('"usage"')) continue
    try {
      const l = JSON.parse(raw) as UsageLine
      const u = l.message?.usage
      if (l.type !== 'assistant' || !u || !l.message?.id) continue
      byId.set(l.message.id, (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0))
    } catch {
      // a line mid-write: the next read has it whole
    }
  }
  return [...byId.values()].reduce((a, b) => a + b, 0)
}

export const onPrompt = (rows: readonly AgentRow[]) => rows.filter(r => r.endedAt === undefined)

export const visible = (rows: readonly AgentRow[]) => {
  const running = rows.filter(r => r.endedAt === undefined)
  const done = rows.filter(r => r.endedAt !== undefined)
  const shown = [...running, ...done].slice(0, MAX_ROWS)
  return {
    shown,
    moreRunning: Math.max(0, running.length - MAX_ROWS),
    doneHidden: done.length - shown.filter(r => r.endedAt !== undefined).length,
  }
}
