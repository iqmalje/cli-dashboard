import { expect, test } from 'claude-code/testing'

import { draw, planDrops, rowWidth } from './frame'
import type { Cell, Line, Section } from './frame'

const cell = (text: string): Cell => ({ parts: [{ text }] })
const lineText = (l: Line) => l.segs.map(s => s.text).join('')
const W = 60

const sections: Section[] = [
  { rows: [[cell('~/cockpit'), cell('name'), cell('opus 5.5')]], flex: 1 },
  { rows: [[cell('meter'), { parts: [{ text: '━', grow: 1 }] }, cell('cache 3:41')]], flex: 1 },
  { rows: [[cell('agents 2'), cell('Explore')], [cell(''), cell('Plan')]], flex: 1, press: 'agents' },
]

// A line one cell too wide or too narrow breaks the frame on screen.
test('every drawn line is exactly W wide', () => {
  for (const l of draw(sections, W, 0)) expect([...lineText(l)].length).toBe(W)
})

test('frame corners and joints: top ┬ under a divider, ┼ where both rows divide', () => {
  const lines = draw(sections, W, 0).map(lineText)
  expect(lines[0]?.startsWith('╭')).toBe(true)
  expect(lines[0]?.endsWith('╮')).toBe(true)
  expect(lines[lines.length - 1]?.startsWith('╰')).toBe(true)
  expect(lines[0]).toContain('┬')
  expect(lines[2]).toMatch(/[┼┴┬]/)
})

test('a section press key reaches each of its row lines, not its rules', () => {
  const lines = draw(sections, W, 0)
  expect(lines.filter(l => l.press === 'agents').length).toBe(2)
})

test('a grow part takes the cell slack', () => {
  const line = lineText(draw(sections, W, 0)[3]!)
  expect(line).toContain('━'.repeat(10))
})

test('the bottom caption sits in the border and carries its press key', () => {
  const lines = draw(sections, W, 0, { text: ' skills ▸ ', press: 'skills' })
  const last = lines[lines.length - 1]!
  expect(lineText(last)).toContain(' skills ▸ ')
  expect(last.press).toBe('skills')
  expect([...lineText(last)].length).toBe(W)
})

test('planDrops drops in order until it fits', () => {
  const widths: Record<string, number> = { sevenDay: 10, sessionName: 20, dirty: 3, cache: 9, dirShort: 8 }
  const need = (drops: ReadonlySet<string>) => 100 - [...drops].reduce((n, d) => n + (widths[d] ?? 0), 0)
  expect([...planDrops(need, 100)]).toEqual([])
  expect([...planDrops(need, 85)]).toEqual(['dirShort', 'sevenDay'])
  expect([...planDrops(need, 10)]).toEqual(['dirShort', 'sevenDay', 'sessionName', 'dirty', 'cache'])
})

// A long session name forces sessionName out; the room it frees must bring 7d back.
test('planDrops restores an earlier drop once a later one frees the room', () => {
  const widths: Record<string, number> = { dirShort: 8, sevenDay: 10, sessionName: 40 }
  const need = (drops: ReadonlySet<string>) => 150 - [...drops].reduce((n, d) => n + (widths[d] ?? 0), 0)
  expect([...planDrops(need, 105)]).toEqual(['dirShort', 'sessionName'])
})

test('rowWidth counts each cell, its dividers and both borders', () => {
  expect(rowWidth([cell('ab'), cell('c')])).toBe(1 + 4 + 1 + 3 + 1)
})
