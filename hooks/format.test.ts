import { expect, test } from 'claude-code/testing'

import { cacheLeft, CACHE_TTL_MS, effortFromSettings, fmtDuration, fmtModel, fmtTokens, parseGit, shortDir, shortenHome } from './format'

test('fmtTokens: plain under 1k, k under 1M, one-decimal M above', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(412_300)).toBe('412k')
  expect(fmtTokens(1_250_000)).toBe('1.3M')
})

// Short durations read as a clock (0:42), hours as 1h 12m (spaced to read at a glance), days as 3d.
test('fmtDuration: clock under an hour, h+m under a day, days above', () => {
  expect(fmtDuration(42_000)).toBe('0:42')
  expect(fmtDuration(72 * 60_000)).toBe('1h 12m')
  expect(fmtDuration(3 * 86_400_000 + 5_000)).toBe('3d')
  expect(fmtDuration(-5)).toBe('0:00')
})

test('fmtModel: drops the claude- prefix and the context suffix', () => {
  expect(fmtModel('claude-opus-5-5')).toBe('opus 5.5')
  expect(fmtModel('claude-fable-5-1[1m]')).toBe('fable 5.1')
  expect(fmtModel('sonnet')).toBe('sonnet')
})

test('shortenHome', () => {
  expect(shortenHome('/Users/a/Documents/cockpit', '/Users/a')).toBe('~/Documents/cockpit')
  expect(shortenHome('/Users/a', '/Users/a')).toBe('~')
  expect(shortenHome('/Users/ab/x', '/Users/a')).toBe('/Users/ab/x')
})

// Repos side by side (~/Documents/work-repos/a, .../b) must still read apart when shortened:
// keep the last two folders and cut the leading ones.
test('shortDir keeps the last two folders', () => {
  expect(shortDir('~/orca/workspaces/dumb-meter/creating-own-YAS')).toBe('…/dumb-meter/creating-own-YAS')
  expect(shortDir('~/Documents/work-repos/api-relay')).toBe('…/work-repos/api-relay')
  expect(shortDir('~/Documents/cockpit')).toBe('~/Documents/cockpit')
  expect(shortDir('/opt/x')).toBe('/opt/x')
})

test('parseGit reads the branch and counts changed files', () => {
  expect(parseGit(0, '## main...origin/main [ahead 1]\n M a.ts\n?? b.ts\n')).toEqual({ branch: 'main', dirty: 2 })
  expect(parseGit(0, '## HEAD (no branch)\n')).toEqual({ branch: 'HEAD', dirty: 0 })
  expect(parseGit(0, '## No commits yet on main\n')).toEqual({ branch: 'main', dirty: 0 })
})

test('parseGit returns null on a failed run', () => {
  expect(parseGit(128, '')).toBe(null)
})

test('cacheLeft counts down from the last response and stops at 0', () => {
  expect(cacheLeft(null, 1000)).toBe(null)
  expect(cacheLeft(1000, 1000 + 60_000)).toBe(CACHE_TTL_MS - 60_000)
  expect(cacheLeft(1000, 1000 + CACHE_TTL_MS + 1)).toBe(0)
})

// A fresh session has run no tool yet, so no hook has carried the effort: the settings seed it,
// per model first, because a per-model level overrides the global one.
test('effortFromSettings: per-model level, else the global one, else null', () => {
  const s = { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } }
  expect(effortFromSettings(s, 'claude-opus-5-5[1m]')).toBe('medium')
  expect(effortFromSettings(s, 'claude-sonnet-5')).toBe('high')
  expect(effortFromSettings({}, 'claude-sonnet-5')).toBe(null)
})
