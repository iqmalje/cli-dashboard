import { expect, test } from 'claude-code/testing'
import { picksFrom } from './look'
import { advance, optKey, optValue, pick, pluginId } from './setup'

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

test('pluginId finds the marketplace key', () => {
  expect(pluginId({ 'a@b': true, 'cli-dashboard@mine': true })).toBe('cli-dashboard@mine')
  expect(pluginId({})).toBe('cli-dashboard')
})
