import { expect, test } from 'claude-code/testing'

import { flow, pastel } from './color'
import { dumbState, fill, softLimit } from './meter'

// The Dumb Meter must turn at exactly these points, or the colour lies about context health.
test('dumbState: 24.9% is Smart, 25% is Coasting', () => {
  expect(dumbState(0.249).name).toBe('Smart')
  expect(dumbState(0.25).name).toBe('Coasting')
})

test('dumbState: 69.9% is Foggy, 70% is Cooked, 90% is Dumb', () => {
  expect(dumbState(0.699).name).toBe('Foggy')
  expect(dumbState(0.7).name).toBe('Cooked')
  expect(dumbState(0.9).name).toBe('Dumb')
})

test('softLimit is 800k on a 1M window, but the window itself when smaller', () => {
  expect(softLimit(1_000_000)).toBe(800_000)
  expect(softLimit(200_000)).toBe(200_000)
})

test('softLimit falls back when the window is 0', () => {
  expect(softLimit(0)).toBe(800_000)
  expect(fill(0, 0)).toBe(0)
})

test('fill is clamped to 1 past the Soft Limit', () => {
  expect(fill(900_000, 1_000_000)).toBe(1)
  expect(fill(400_000, 1_000_000)).toBe(0.5)
})

// The meter gradient is a triangle wave: its ends must sit at the two hues, or the bar never reaches the state colour.
test('flow runs 0 at the start to 1 at the middle; pastel is a hex colour', () => {
  expect(flow(0, 10, 0)).toBe(0)
  expect(flow(5, 10, 0)).toBe(1)
  expect(pastel(160)).toMatch(/^#[0-9a-f]{6}$/)
})
