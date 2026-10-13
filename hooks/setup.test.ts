import { expect, test } from 'claude-code/testing'
import { picksFrom } from './look'
import { width } from './format'
import { advance, setupRows, configureArgv, optKey, optValue, pick } from './setup'

const start = { step: 0, picks: picksFrom({}) }

test('pick sets the current question, optValue reads a choice key back', () => {
  expect(pick(start, 'mono').picks.theme).toBe('mono')
  expect(pick({ ...start, step: 1 }, 'plain').picks.icons).toBe('plain')
  expect(optValue(0, optKey(0, 'high-contrast'))).toBe('high-contrast')
  expect(optValue(1, optKey(0, 'pastel'))).toBeUndefined()
  expect(optValue(0, 'cancel')).toBeUndefined()
})

test('advance ends after speed, or after animation when it is off', () => {
  expect(advance({ ...start, step: 2 })?.step).toBe(3)
  expect(advance({ ...start, step: 3 })).toBeNull()
  expect(advance({ step: 2, picks: { ...start.picks, animation: 'off' } })).toBeNull()
})

test('configureArgv targets the enabled marketplace copy, else the folder-loaded one', () => {
  expect(configureArgv({ 'a@b': true, 'cli-dashboard@mine': true }, '/x')).toEqual(['claude', 'plugin', 'configure', 'cli-dashboard@mine', '--values-stdin'])
  // a disabled marketplace copy is not the one running
  const inline = ['claude', '--plugin-dir', '/x', 'plugin', 'configure', 'cli-dashboard@inline', '--values-stdin']
  expect(configureArgv({ 'cli-dashboard@mine': false }, '/x')).toEqual(inline)
  expect(configureArgv({}, '/x')).toEqual(inline)
})

const text = (r: { segs: readonly { text: string }[] }) => r.segs.map(g => g.text).join('')
const preview = [{ segs: [{ text: '╭' + '─'.repeat(30) + '╮' }] }]

test('setupRows: every row is exactly W wide, framed, with the draft choice marked', () => {
  for (const W of [60, 100]) {
    const rows = setupRows(start, W, preview)
    for (const r of rows) expect(width(text(r))).toBe(W)
    expect(text(rows[0]!)).toContain('cli-dashboard setup')
    expect(text(rows[0]!).startsWith('╭')).toBe(true)
    expect(text(rows.at(-1)!).startsWith('╰')).toBe(true)
    expect(text(rows.find(r => r.choice === 'pastel')!)).toMatch(/^│ ▸ pastel/)
    expect(text(rows.find(r => r.choice === 'rainbow')!)).toMatch(/^│   rainbow/)
    expect(rows.some(r => r.choice === 'cancel')).toBe(true)
  }
})

test('setupRows: long hints are cut with … at a small W and rows stay W wide', () => {
  const rows = setupRows(start, 30, preview)
  for (const r of rows) expect(width(text(r))).toBe(30)
  expect(text(rows.find(r => r.choice === 'mono')!)).toContain('…')
})
