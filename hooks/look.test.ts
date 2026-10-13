import { expect, test } from 'claude-code/testing'

import { oklch, pastel } from './color'
import { lookOf, picksFrom } from './look'
import { width } from './format'

test('picksFrom: unset or mistyped values fall back to the default', () => {
  expect(picksFrom({})).toEqual({ theme: 'pastel', icons: 'nerd', animation: 'full', speed: '1x' })
  expect(picksFrom({ theme: 'neon', icons: 'plain' })).toEqual({ theme: 'pastel', icons: 'plain', animation: 'full', speed: '1x' })
})

test('lookOf: the default reproduces today\'s look', () => {
  const look = lookOf(picksFrom({}))
  expect(look.color(20)).toBe(pastel(20))
  expect(look.border).toBe(oklch(0.6, 0.05, 280))
  expect(look.track).toBe(oklch(0.32, 0.02, 280))
  expect(look.flow).toBe(0.125)
  expect(look.hue).toBe(6)
  expect(look.spin).toBe(true)
})

test('lookOf: speed scales flow and hue', () => {
  expect(lookOf(picksFrom({ speed: '2x' })).flow).toBe(0.25)
  expect(lookOf(picksFrom({ speed: '2x' })).hue).toBe(12)
  expect(lookOf(picksFrom({ speed: '0.5x' })).flow).toBe(0.0625)
  expect(lookOf(picksFrom({ speed: '0.5x' })).hue).toBe(3)
})

test('lookOf: calm freezes the motion but keeps the spinner, off stops both', () => {
  const calm = lookOf(picksFrom({ animation: 'calm' }))
  expect([calm.flow, calm.hue, calm.spin]).toEqual([0, 0, true])
  const off = lookOf(picksFrom({ animation: 'off' }))
  expect([off.flow, off.hue, off.spin]).toEqual([0, 0, false])
})

test('lookOf: mono ignores the hue', () => {
  const mono = lookOf(picksFrom({ theme: 'mono' }))
  expect(mono.color(10)).toBe(mono.color(200))
})

test('icon sets share keys and the plain set is single-width', () => {
  const nerd = lookOf(picksFrom({})).icon
  const plain = lookOf(picksFrom({ icons: 'plain' })).icon
  expect(Object.keys(plain).sort()).toEqual(Object.keys(nerd).sort())
  for (const s of Object.values(plain)) expect(width(s)).toBe(1)
  for (const s of lookOf(picksFrom({ icons: 'plain' })).states) expect(width(s)).toBe(1)
})
