import { expect, test } from 'claude-code/testing'

import type { AgentRow } from '../types'
import { agentTokens, onPrompt, setTokens, spawn, stop, visible } from './agents'

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

test('visible caps at 5 rows, running first, and counts what it hid', () => {
  const rows = [...['1', '2', '3', '4', '5', '6'].map(id => row(id)), row('d1', 1), row('d2', 2)]
  const v = visible(rows)
  expect(v.shown.map(r => r.id)).toEqual(['1', '2', '3', '4', '5'])
  expect(v.moreRunning).toBe(1)
  expect(v.doneHidden).toBe(2)
})

test('visible fills spare rows with finished agents', () => {
  const v = visible([row('1'), row('d1', 1)])
  expect(v.shown.map(r => r.id)).toEqual(['1', 'd1'])
  expect(v.doneHidden).toBe(0)
})
