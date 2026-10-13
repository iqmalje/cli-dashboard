import { expect, test } from 'claude-code/testing'

import type { AgentRow, Task } from '../types'
import { agentSections, fixedRows, sessionNameFrom, taskSection } from './rows'
import type { FixedData } from './rows'
import { draw, planDrops, rowWidth } from './frame'
import { pastel } from './color'
import { lookOf, picksFrom } from './look'
import type { Drop, Section } from './frame'

const look = lookOf(picksFrom({}))
const text = (s: Section) => s.rows.map(r => r.map(c => c.parts.map(p => p.text).join('')).join('|')).join('\n')

const base: FixedData = {
  now: 0,
  cwd: '/Users/a/Documents/cli-dashboard',
  home: '/Users/a',
  sessionName: 'cli-dashboard-1a',
  git: { branch: 'main', dirty: 3 },
  model: 'claude-opus-5-5',
  effort: 'high',
  usage: { contextTokens: 464_000, window: 1_000_000, fiveHour: { percent: 42, resetsAt: 72 * 60_000 }, sevenDay: { percent: 18 } },
  sessionTokens: 412_000,
  cacheLeftMs: 221_000,
  softLimit: 800_000,
}

test('fixedRows: row 1 holds where/who, row 2 holds how full', () => {
  const [r1, r2] = fixedRows(base, new Set(), look)
  expect(text(r1!)).toContain('~/Documents/cli-dashboard')
  expect(text(r1!)).toContain('cli-dashboard-1a')
  expect(text(r1!)).toContain('main')
  expect(text(r1!)).toContain('opus 5.5')
  expect(text(r1!)).toContain('42%')
  expect(text(r2!)).toContain('Foggy')
  // the token count alone does not say how full: the window beside it does
  expect(text(r2!)).toContain('464k/1M')
  expect(text(r2!)).toContain('3:41')
})

test('fixedRows without rate limits', () => {
  const [r1] = fixedRows({ ...base, usage: { contextTokens: 0, window: 0 } }, new Set(), look)
  expect(text(r1!)).not.toContain('5h')
  expect(text(r1!)).not.toContain('7d')
})

test('fixedRows honours drops: short dir, 7d, session name, dirty, cache', () => {
  const deep = { ...base, cwd: '/Users/a/code/work-repos/api-relay' }
  const [r1, r2] = fixedRows(deep, new Set(['dirShort', 'sevenDay', 'sessionName', 'dirty', 'cache'] as const), look)
  expect(text(r1!)).not.toContain('18%')
  expect(text(r1!)).not.toContain('cli-dashboard-1a')
  expect(text(r1!)).not.toContain('•3')
  expect(text(r1!)).toContain('…/work-repos/api-relay')
  expect(text(r2!)).not.toContain('3:41')
})

test('a missing git repo leaves the branch cell out', () => {
  expect(text(fixedRows({ ...base, git: null }, new Set(), look)[0]!)).not.toContain('main')
})

test('workflow agents go in their own section, labelled by run name', () => {
  const rows: AgentRow[] = [
    { id: 'a', name: 'Explore', model: 'sonnet', description: 'look', startedAt: 0 },
    { id: 'b', name: 'worker', model: 'haiku', description: 'step', startedAt: 0, runId: 'wf_1' },
  ]
  const secs = agentSections(rows, { wf_1: 'review-changes' }, 1000, 0, 0, look)
  expect(secs.length).toBe(2)
  expect(text(secs[0]!)).toContain('agents')
  expect(text(secs[1]!)).toContain('review-changes')
})

// Agent rows name the model as the top row does, with effort once the agent's first tool call reports it.
test('agent rows show the short model name and effort', () => {
  const rows: AgentRow[] = [
    { id: 'a', name: 'Explore', model: 'claude-opus-5-5', effort: 'medium', description: 'look', startedAt: 0 },
    { id: 'b', name: 'Plan', model: 'claude-haiku-5-5', description: 'plan', startedAt: 0 },
  ]
  const t = text(agentSections(rows, {}, 1000, 0, 0, look)[0]!)
  expect(t).toContain('opus 5.5 · medium')
  expect(t).toContain('haiku 5.5')
  expect(t).not.toContain('claude-')
})

test('taskSection: collapsed shows one row with done/total and the active task', () => {
  const tasks: Task[] = [
    { id: '1', subject: 'A', status: 'completed' },
    { id: '2', subject: 'B', status: 'in_progress', startedAt: 0 },
    { id: '3', subject: 'C', status: 'pending' },
  ]
  const closed = taskSection(tasks, false, 1000, 0, look)!
  expect(closed.rows.length).toBe(1)
  expect(text(closed)).toContain('1/3')
  expect(text(closed)).toContain('B')
  expect(closed.press).toBe('tasks')
  expect(taskSection(tasks, true, 1000, 0, look)!.rows.length).toBe(3)
  expect(taskSection([], false, 0, 0, look)).toBe(null)
})

test('sessionNameFrom skips malformed files', () => {
  const files = [
    { name: '1.json', text: '{"sessionId":"x","na' },
    { name: '2.json', text: '{"sessionId":"other","name":"nope"}' },
    { name: '3.json', text: '{"sessionId":"me","name":"cli-dashboard-1a"}' },
  ]
  expect(sessionNameFrom(files, 'me')).toBe('cli-dashboard-1a')
  expect(sessionNameFrom(files.slice(0, 2), 'me')).toBe(null)
})

// The frame must stay straight at any width: a line wider than the terminal is cut at its right edge,
// which takes the border and the 5h cell the spec says is never dropped.
const panelLines = (d: FixedData, W: number, extra: Section[] = []) => {
  const need = (drops: ReadonlySet<Drop>) => Math.max(...fixedRows(d, drops, look).map(s => rowWidth(s.rows[0] ?? [])))
  return draw([...fixedRows(d, planDrops(need, W), look), ...extra], W, 0, look).map(l => l.segs.map(s => s.text).join(''))
}

// Below about 55 columns row 1 cannot hold dir, model and 5h whole; there it is cut, never wider than W.
test('a long branch is cut to fit; every line stays W wide and 5h stays', () => {
  const d = { ...base, git: { branch: 'feature/abc-12453-payment-webhook-signature', dirty: 3 } }
  for (const W of [40, 60, 80]) {
    const lines = panelLines(d, W)
    for (const l of lines) expect([...l].length).toBe(W)
    if (W >= 60) expect(lines[1]).toContain('5h 42%')
    expect(lines[1]?.endsWith('│')).toBe(true)
  }
})

test('an agent row with a long description fits at 80 columns and keeps its spinner', () => {
  const long: AgentRow = { id: 'a', name: 'Explore', model: 'sonnet', description: 'x'.repeat(120), startedAt: 0 }
  const lines = panelLines(base, 80, agentSections([long], {}, 1000, 0, 0, look))
  for (const l of lines) expect([...l].length).toBe(80)
  expect(lines.some(l => l.includes('⠋'))).toBe(true)
})

test('the meter shows tokens alone while the window is unknown', () => {
  const [, r2] = fixedRows({ ...base, usage: { contextTokens: 5000, window: 0 } }, new Set(), look)
  expect(text(r2!)).toContain('· 5k')
  expect(text(r2!)).not.toContain('5k/')
})

// Scrolled down, the label still heads the window, and the tail says what is above and below.
test('agentSections scrolled: label on the first shown row, tail counts above and below', () => {
  const rows: AgentRow[] = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `A${i}`, model: 'haiku', description: 'd', startedAt: 0 }))
  const s = agentSections(rows, {}, 1000, 0, 1, look)[0]!
  expect(text(s).split('\n')[0]).toContain('agents 7')
  expect(text(s).split('\n')[0]).toContain('A1')
  expect(text(s)).not.toContain('A0')
  expect(text(s)).toContain('↑ 1')
  expect(text(s)).toContain('↓ 1 more')
  expect(s.press).toBe('agents')
})

// The label is the running count, not the rows that fit: 10 running agents with 5 shown read "agents 10".
test('the agents label counts every running agent, not only the rows shown', () => {
  const rows: AgentRow[] = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: 'Explore', model: 'haiku', description: 'd', startedAt: 0 }))
  expect(text(agentSections(rows, {}, 1000, 0, 0, look)[0]!)).toContain('agents 7')
})

// 90% used with 4h of the 5h window left (pace 20%) is far over pace: the 5h percentage turns rose.
test('the 5h percentage is coloured by burn rate', () => {
  const hot = { ...base, now: 0, usage: { ...base.usage!, fiveHour: { percent: 90, resetsAt: 4 * 3_600_000 } } }
  const [r1] = fixedRows(hot, new Set(), look)
  const parts = r1!.rows[0]!.flatMap(c => c.parts)
  expect(parts.find(p => p.text === '90%')?.color).toBe(pastel(10))
})

const running: AgentRow = { id: 'a', name: 'Explore', model: 'claude-opus-5-5', description: 'look', startedAt: 0 }
const flat = (ss: readonly Section[]) => ss.flatMap(s => s.rows.flat().flatMap(c => c.parts))

test('a mono look draws the meter state name in the same colour as the dir icon', () => {
  const mono = lookOf(picksFrom({ theme: 'mono' }))
  const [r1, r2] = fixedRows(base, new Set(), mono)
  const dir = r1!.rows[0]![0]!.parts[0]!.color
  expect(r2!.rows[0]![0]!.parts.find(p => p.text.includes('Foggy'))?.color).toBe(dir)
})

test('plain icons put look.icon.dir in the first Fixed Row', () => {
  const plain = lookOf(picksFrom({ icons: 'plain' }))
  expect(text(fixedRows(base, new Set(), plain)[0]!)).toContain(plain.icon.dir)
})

test('animation off draws a static ● for a running agent', () => {
  const off = lookOf(picksFrom({ animation: 'off' }))
  expect(text(agentSections([running], {}, 1000, 0, 0, off)[0]!)).toContain('●')
})

test('calm draws the same lines at frame 0 and frame 5', () => {
  const calm = lookOf(picksFrom({ animation: 'calm' }))
  const tasks: Task[] = [{ id: '1', subject: 'work', status: 'in_progress', startedAt: 0 }]
  const at = (f: number) => draw([...fixedRows({ ...base, usage: { contextTokens: 300_000, window: 1_000_000 } }, new Set(), calm), taskSection(tasks, false, 1000, f, calm)!], 80, f, calm)
  expect(at(5)).toEqual(at(0))
})
