import { expect, test } from 'claude-code/testing'

import { basename, cacheLeft, CACHE_TTL_MS, fmtDuration, fmtModel, fmtTokens, parseGit, shortenHome } from './format'

test('fmtTokens: plain under 1k, k under 1M, one-decimal M above', () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(412_300)).toBe('412k')
  expect(fmtTokens(1_250_000)).toBe('1.3M')
})

// Short durations read as a clock (0:42), hours as 1h12m, days as 3d, as YAS did.
test('fmtDuration: clock under an hour, h+m under a day, days above', () => {
  expect(fmtDuration(42_000)).toBe('0:42')
  expect(fmtDuration(72 * 60_000)).toBe('1h12m')
  expect(fmtDuration(3 * 86_400_000 + 5_000)).toBe('3d')
  expect(fmtDuration(-5)).toBe('0:00')
})

test('fmtModel: drops the claude- prefix and the context suffix', () => {
  expect(fmtModel('claude-opus-5-5')).toBe('opus 5.5')
  expect(fmtModel('claude-fable-5-1[1m]')).toBe('fable 5.1')
  expect(fmtModel('sonnet')).toBe('sonnet')
})

test('shortenHome and basename', () => {
  expect(shortenHome('/Users/a/Documents/cockpit', '/Users/a')).toBe('~/Documents/cockpit')
  expect(shortenHome('/Users/a', '/Users/a')).toBe('~')
  expect(shortenHome('/Users/ab/x', '/Users/a')).toBe('/Users/ab/x')
  expect(basename('/Users/a/Documents/cockpit')).toBe('cockpit')
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
