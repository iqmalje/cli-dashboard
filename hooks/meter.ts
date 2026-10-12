export const SOFT_LIMIT = 800_000

export const STATES = [
  { name: 'Smart', icon: '\u{F09D1}', hue: 160 },
  { name: 'Coasting', icon: '\u{F015F}', hue: 230 },
  { name: 'Foggy', icon: '\u{F0591}', hue: 95 },
  { name: 'Cooked', icon: '\u{F0238}', hue: 55 },
  { name: 'Dumb', icon: '\u{F068C}', hue: 10 },
] as const

export type DumbState = (typeof STATES)[number]

export const softLimit = (window: number) => (window > 0 ? Math.min(SOFT_LIMIT, window) : SOFT_LIMIT)

export const fill = (tokens: number, window: number) => Math.min(1, Math.max(0, tokens / softLimit(window)))

export const dumbState = (f: number): DumbState =>
  STATES[f < 0.25 ? 0 : f < 0.5 ? 1 : f < 0.7 ? 2 : f < 0.9 ? 3 : 4]

export const FIVE_HOURS = 5 * 3_600_000
export const SEVEN_DAYS = 7 * 86_400_000

// Burn rate against an even pace: under it keeps the cell's own hue, up to 5 points over is peach
// (Cooked's hue), more is rose (Dumb's hue). Without a reset time there is no pace to measure.
export const burnHue = (l: { percent: number; resetsAt?: number }, windowMs: number, now: number, base: number) => {
  if (l.resetsAt === undefined) return base
  const elapsed = Math.min(windowMs, Math.max(0, windowMs - (l.resetsAt - now)))
  const over = l.percent - (elapsed / windowMs) * 100
  return over < 0 ? base : over <= 5 ? 55 : 10
}
