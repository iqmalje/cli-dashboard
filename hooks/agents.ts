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

// The last offset that still fills the window.
const maxOffset = (total: number) => Math.max(0, total - MAX_ROWS)

export const scrollBy = (offset: number, by: number, total: number) => Math.min(maxOffset(total), Math.max(0, offset + by))

// A MAX_ROWS window over running-then-finished rows, from `offset` (clamped, since rows come and go).
export const visible = (rows: readonly AgentRow[], offset: number) => {
  const ordered = [...rows.filter(r => r.endedAt === undefined), ...rows.filter(r => r.endedAt !== undefined)]
  const at = Math.min(maxOffset(ordered.length), Math.max(0, offset))
  const shown = ordered.slice(at, at + MAX_ROWS)
  return { shown, above: at, below: ordered.length - at - shown.length }
}
