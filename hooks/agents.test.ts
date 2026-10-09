import { expect, test } from 'claude-code/testing'

import type { AgentRow } from '../types'
import { agentTokens, onPrompt, scrollBy, setTokens, spawn, stop, visible } from './agents'

const row = (id: string, endedAt?: number): AgentRow => ({ id, name: id, model: 'sonnet', description: 'd', startedAt: 0, ...(endedAt === undefined ? {} : { endedAt }) })

// Finished agents stay visible for the rest of the turn so the user sees the outcome, then clear on the next prompt.
test('a stopped agent stays until the next prompt, then goes', () => {
  const rows = stop(spawn(spawn([], row('a')), row('b')), 'a', 10)
  expect(rows.map(r => r.endedAt)).toEqual([10, undefined])
  expect(onPrompt(rows).map(r => r.id)).toEqual(['b'])
})

test('stop keeps the first endedAt; setTokens replaces the count', () => {
  const rows = stop(stop([row('a')], 'a', 10), 'a', 20)
  expect(rows[0]?.endedAt).toBe(10)
  expect(setTokens(setTokens(rows, 'a', 5), 'a', 7)[0]?.tokens).toBe(7)
})

// Streaming rewrites one message id with growing usage: counting every line would double-count it,
// counting the first would undercount output. The last line per id is the truth (as YAS does).
test('agentTokens: last line per message id wins, summed across messages', () => {
  const line = (id: string, input: number, out: number) =>
    JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: input, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: out } } })
  const jsonl = [line('m1', 1, 5), line('m1', 1, 50), line('m2', 2, 20), '{"type":"user"}', '{broken'].join('\n')
  expect(agentTokens(jsonl)).toBe(1 + 10 + 100 + 50 + (2 + 10 + 100 + 20))
  expect(agentTokens('')).toBe(0)
})

const eight = [...['1', '2', '3', '4', '5', '6'].map(id => row(id)), row('d1', 1), row('d2', 2)]

// Five rows show at a time, running first; the rest are a scroll away, counted above and below.
test('visible shows a 5-row window, running first, and counts what is above and below', () => {
  const v = visible(eight, 0)
  expect(v.shown.map(r => r.id)).toEqual(['1', '2', '3', '4', '5'])
  expect([v.above, v.below]).toEqual([0, 3])
  const w = visible(eight, 2)
  expect(w.shown.map(r => r.id)).toEqual(['3', '4', '5', '6', 'd1'])
  expect([w.above, w.below]).toEqual([2, 1])
})

// Rows finish and clear under a scrolled window: the offset must never show an empty window.
test('visible clamps a stale offset to the last full window', () => {
  const v = visible(eight, 99)
  expect(v.shown.map(r => r.id)).toEqual(['4', '5', '6', 'd1', 'd2'])
  expect([v.above, v.below]).toEqual([3, 0])
  expect(visible([row('1')], 4).shown.map(r => r.id)).toEqual(['1'])
})

test('scrollBy moves one row and stops at both ends', () => {
  expect(scrollBy(0, -1, 8)).toBe(0)
  expect(scrollBy(0, 1, 8)).toBe(1)
  expect(scrollBy(3, 1, 8)).toBe(3)
  expect(scrollBy(0, 1, 4)).toBe(0)
})
