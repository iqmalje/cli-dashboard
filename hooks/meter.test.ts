import { expect, test } from 'claude-code/testing'

import { flow, pastel } from './color'
import { burnHue, dumbState, fill, FIVE_HOURS, SEVEN_DAYS, softLimit } from './meter'

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

// Burn rate: used % against the share of the window gone by. Under pace keeps the cell's own blue,
// up to 5 points over is peach (Cooked's hue), more is rose (Dumb's hue).
test('burnHue: 5h window half gone, under pace / on pace / over pace', () => {
  const half = { now: 0, resetsAt: FIVE_HOURS / 2 }
  expect(burnHue({ percent: 49.9, resetsAt: half.resetsAt }, FIVE_HOURS, half.now, 200)).toBe(200)
  expect(burnHue({ percent: 50, resetsAt: half.resetsAt }, FIVE_HOURS, half.now, 200)).toBe(55)
  expect(burnHue({ percent: 55, resetsAt: half.resetsAt }, FIVE_HOURS, half.now, 200)).toBe(55)
  expect(burnHue({ percent: 55.1, resetsAt: half.resetsAt }, FIVE_HOURS, half.now, 200)).toBe(10)
})

test('burnHue: 7d window uses its own length', () => {
  const resetsAt = SEVEN_DAYS * 0.75 // a quarter of the week gone: pace is 25%
  expect(burnHue({ percent: 20, resetsAt }, SEVEN_DAYS, 0, 250)).toBe(250)
  expect(burnHue({ percent: 28, resetsAt }, SEVEN_DAYS, 0, 250)).toBe(55)
  expect(burnHue({ percent: 31, resetsAt }, SEVEN_DAYS, 0, 250)).toBe(10)
})

test('burnHue: no reset time means no pace, so the cell keeps its blue', () => {
  expect(burnHue({ percent: 99 }, FIVE_HOURS, 0, 200)).toBe(200)
})
