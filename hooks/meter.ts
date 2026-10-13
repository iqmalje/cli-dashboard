export const SOFT_LIMIT = 800_000
// Claude 4.x and older measurably degrade past 256K (Opus 4.6 system card, MRCR v2 8-needle: 93.0 at 256K, 76.0 at 1M):
// at 512K the meter turns Foggy at 256K. Claude 5 cards publish no drop-off point, so they keep SOFT_LIMIT.
export const OLDER_SOFT_LIMIT = 512_000

export const STATES = [
  { name: 'Smart', hue: 160 },
  { name: 'Coasting', hue: 230 },
  { name: 'Foggy', hue: 95 },
  { name: 'Cooked', hue: 55 },
  { name: 'Dumb', hue: 10 },
] as const

export type DumbState = (typeof STATES)[number]

// The model generation is the first number in its id: claude-opus-4-6 → 4, claude-3-7-sonnet → 3, claude-fable-5-1 → 5.
const generation = (model: string) => Number(/^claude-(?:[a-z]+-)?(\d+)/.exec(model)?.[1] ?? Infinity)

export const softLimit = (window: number, model: string, override?: number) => {
  const limit = override !== undefined && override > 0 ? override : generation(model) < 5 ? OLDER_SOFT_LIMIT : SOFT_LIMIT
  return window > 0 ? Math.min(limit, window) : limit
}

export const fill = (tokens: number, limit: number) => (limit > 0 ? Math.min(1, Math.max(0, tokens / limit)) : 0)

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
