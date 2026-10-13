import { oklch } from './color'

// Each setting's values, default first; the plugin.json pickers and the setup wizard list them in this order.
export const CHOICES = {
  theme: ['pastel', 'rainbow', 'mono', 'light', 'high-contrast'],
  icons: ['nerd', 'plain'],
  animation: ['full', 'calm', 'off'],
  speed: ['1x', '0.5x', '2x'],
} as const

export type Choices = typeof CHOICES
export type Picks = { [K in keyof Choices]: Choices[K][number] }

const THEMES: Record<Picks['theme'], { color: (h: number) => string; border: string; track: string }> = {
  pastel: { color: h => oklch(0.85, 0.07, h), border: oklch(0.6, 0.05, 280), track: oklch(0.32, 0.02, 280) },
  rainbow: { color: h => oklch(0.75, 0.16, h), border: oklch(0.65, 0.12, 280), track: oklch(0.32, 0.02, 280) },
  mono: { color: () => oklch(0.85, 0.05, 250), border: oklch(0.6, 0.03, 250), track: oklch(0.32, 0.02, 250) },
  light: { color: h => oklch(0.5, 0.12, h), border: oklch(0.55, 0.05, 280), track: oklch(0.88, 0.01, 280) },
  'high-contrast': { color: h => oklch(0.9, 0.18, h), border: oklch(0.95, 0, 0), track: oklch(0.2, 0, 0) },
}

const NERD = {
  dir: '\u{F07B}',
  session: '\u{F0369}',
  branch: '\u{E0A0}',
  model: '\u{F06A9}',
  h5: '\u{F13AB}',
  d7: '\u{F00ED}',
  tokens: '\u{F01BC}',
  cache: '\u{F051B}',
  agents: '\u{F070E}',
  workflow: '\u{F0E43}',
  tasks: '\u{F012C}',
  skills: '\u{F0AD}',
}
export type Icons = typeof NERD

// single-width Unicode for terminals without a Nerd Font; no emoji, their width breaks cell alignment
const PLAIN: Icons = {
  dir: '▤',
  session: '@',
  branch: '⎇',
  model: '◆',
  h5: '◷',
  d7: '▦',
  tokens: '∑',
  cache: '↻',
  agents: '»',
  workflow: '⇶',
  tasks: '▣',
  skills: '✱',
}

// one icon per Dumb State, in STATES order (Smart, Coasting, Foggy, Cooked, Dumb)
const STATE_ICONS: Record<Picks['icons'], readonly string[]> = {
  nerd: ['\u{F09D1}', '\u{F015F}', '\u{F0591}', '\u{F0238}', '\u{F068C}'],
  plain: ['★', '◆', '≈', '▲', '✕'],
}

const SPEED: Record<Picks['speed'], number> = { '0.5x': 0.5, '1x': 1, '2x': 2 }

export type Look = {
  color: (h: number) => string
  border: string
  track: string
  icon: Icons
  states: readonly string[]
  // gradient shift and hue degrees per frame; 0 freezes them
  flow: number
  hue: number
  // false: running agents show a static ● and the frame tick is not started
  spin: boolean
}

// a value outside a setting's choices (unset, mistyped) means its default
export const picksFrom = (o: Readonly<Record<string, unknown>>): Picks => {
  const one = <K extends keyof Choices>(k: K): Picks[K] => {
    const list: readonly string[] = CHOICES[k]
    return (list.includes(o[k] as string) ? o[k] : CHOICES[k][0]) as Picks[K]
  }
  return { theme: one('theme'), icons: one('icons'), animation: one('animation'), speed: one('speed') }
}

export const lookOf = (p: Picks): Look => {
  const moving = p.animation === 'full'
  const s = SPEED[p.speed]
  return {
    ...THEMES[p.theme],
    icon: p.icons === 'plain' ? PLAIN : NERD,
    states: STATE_ICONS[p.icons],
    flow: moving ? 0.125 * s : 0,
    hue: moving ? 6 * s : 0,
    spin: p.animation !== 'off',
  }
}
