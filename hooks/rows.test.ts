import { expect, test } from 'claude-code/testing'

import type { AgentRow, Task } from '../types'
import { agentSections, fixedRows, sessionNameFrom, taskSection } from './rows'
import type { FixedData } from './rows'
import type { Section } from './frame'

const text = (s: Section) => s.rows.map(r => r.map(c => c.parts.map(p => p.text).join('')).join('|')).join('\n')

const base: FixedData = {
  now: 0,
  cwd: '/Users/a/Documents/cockpit',
  home: '/Users/a',
  sessionName: 'cockpit-1a',
  git: { branch: 'main', dirty: 3 },
  model: 'claude-opus-5-5',
  effort: 'high',
  usage: { contextTokens: 464_000, window: 1_000_000, fiveHour: { percent: 42, resetsAt: 72 * 60_000 }, sevenDay: { percent: 18 } },
  sessionTokens: 412_000,
  cacheLeftMs: 221_000,
}

test('fixedRows: row 1 holds where/who, row 2 holds how full', () => {
  const [r1, r2] = fixedRows(base, new Set())
  expect(text(r1!)).toContain('~/Documents/cockpit')
  expect(text(r1!)).toContain('cockpit-1a')
  expect(text(r1!)).toContain('main')
  expect(text(r1!)).toContain('opus 5.5')
  expect(text(r1!)).toContain('42%')
  expect(text(r2!)).toContain('Foggy')
  expect(text(r2!)).toContain('464k')
  expect(text(r2!)).toContain('3:41')
})

test('fixedRows without rate limits', () => {
  const [r1] = fixedRows({ ...base, usage: { contextTokens: 0, window: 0 } }, new Set())
  expect(text(r1!)).not.toContain('5h')
  expect(text(r1!)).not.toContain('7d')
})

test('fixedRows honours drops: 7d, session name, dirty, cache, dir basename', () => {
  const [r1, r2] = fixedRows(base, new Set(['sevenDay', 'sessionName', 'dirty', 'cache', 'dirBase'] as const))
  expect(text(r1!)).not.toContain('18%')
  expect(text(r1!)).not.toContain('cockpit-1a')
  expect(text(r1!)).not.toContain('•3')
  expect(text(r1!)).toContain('cockpit')
  expect(text(r1!)).not.toContain('~/Documents')
  expect(text(r2!)).not.toContain('3:41')
})

test('a missing git repo leaves the branch cell out', () => {
  expect(text(fixedRows({ ...base, git: null }, new Set())[0]!)).not.toContain('main')
})

test('workflow agents go in their own section, labelled by run name', () => {
  const rows: AgentRow[] = [
    { id: 'a', name: 'Explore', model: 'sonnet', description: 'look', startedAt: 0 },
    { id: 'b', name: 'worker', model: 'haiku', description: 'step', startedAt: 0, runId: 'wf_1' },
  ]
  const secs = agentSections(rows, { wf_1: 'review-changes' }, 1000, 0)
  expect(secs.length).toBe(2)
  expect(text(secs[0]!)).toContain('agents')
  expect(text(secs[1]!)).toContain('review-changes')
})

test('taskSection: collapsed shows one row with done/total and the active task', () => {
  const tasks: Task[] = [
    { id: '1', subject: 'A', status: 'completed' },
    { id: '2', subject: 'B', status: 'in_progress', startedAt: 0 },
    { id: '3', subject: 'C', status: 'pending' },
  ]
  const closed = taskSection(tasks, false, 1000, 0)!
  expect(closed.rows.length).toBe(1)
  expect(text(closed)).toContain('1/3')
  expect(text(closed)).toContain('B')
  expect(closed.press).toBe('tasks')
  expect(taskSection(tasks, true, 1000, 0)!.rows.length).toBe(3)
  expect(taskSection([], false, 0, 0)).toBe(null)
})

test('sessionNameFrom skips malformed files', () => {
  const files = [
    { name: '1.json', text: '{"sessionId":"x","na' },
    { name: '2.json', text: '{"sessionId":"other","name":"nope"}' },
    { name: '3.json', text: '{"sessionId":"me","name":"cockpit-1a"}' },
  ]
  expect(sessionNameFrom(files, 'me')).toBe('cockpit-1a')
  expect(sessionNameFrom(files.slice(0, 2), 'me')).toBe(null)
})
