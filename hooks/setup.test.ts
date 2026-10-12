import { expect, test } from 'claude-code/testing'
import { picksFrom } from './look'
import { advance, cycle, pluginId } from './setup'

const start = { step: 0, picks: picksFrom({}) }

test('cycle steps through the current setting and wraps', () => {
  expect(cycle(start, 1).picks.theme).toBe('rainbow')
  expect(cycle(start, -1).picks.theme).toBe('high-contrast')
  expect(cycle({ ...start, step: 1 }, 1).picks.icons).toBe('plain')
})

test('advance ends after speed, or after animation when it is off', () => {
  expect(advance({ ...start, step: 2 })?.step).toBe(3)
  expect(advance({ ...start, step: 3 })).toBeNull()
  expect(advance({ step: 2, picks: { ...start.picks, animation: 'off' } })).toBeNull()
})

test('pluginId finds the marketplace key', () => {
  expect(pluginId({ 'a@b': true, 'cli-dashboard@mine': true })).toBe('cli-dashboard@mine')
  expect(pluginId({})).toBe('cli-dashboard')
})
