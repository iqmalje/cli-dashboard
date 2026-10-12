import type { Picks } from './look'

export const STEPS = ['theme', 'icons', 'animation', 'speed'] as const

// the wizard draft: which question is up, and the picks so far
export type Setup = { step: number; picks: Picks }

// the draft with the current question's value set
export function pick(s: Setup, value: string): Setup {
  return { ...s, picks: { ...s.picks, [STEPS[s.step] ?? 'theme']: value } }
}

// each question's words: title, one line saying what it changes, and a short hint per choice
export const QUESTIONS: Record<(typeof STEPS)[number], { title: string; about: string; hints: Record<string, string> }> = {
  theme: {
    title: 'Theme',
    about: "Colours for the panel's icons, values and border.",
    hints: { pastel: 'soft · recommended', rainbow: 'bold and saturated', mono: 'one calm colour, hides burn-rate colours', light: 'for light terminal backgrounds', 'high-contrast': 'brightest on dark backgrounds' },
  },
  icons: { title: 'Icons', about: 'Nerd Font glyphs, or plain symbols if you see boxes.', hints: { nerd: 'needs a Nerd Font', plain: 'works in any font' } },
  animation: { title: 'Animation', about: 'What moves on the panel.', hints: { full: 'colour flow, colour cycling and spinner', calm: 'spinner only', off: 'nothing moves' } },
  speed: {
    title: 'Colour animation speed',
    about: 'How fast the meter gradient and agent colours shift. The spinner keeps its pace.',
    hints: { '1x': 'default', '0.5x': 'slower', '2x': 'faster' },
  },
}

// a choice Button's key, unique per step and value
export const optKey = (step: number, value: string) => `opt-${STEPS[step]}-${value}`

// the value a choice key names on this step, or undefined for any other key (cancel, an old step's)
export const optValue = (step: number, key: string | undefined) => {
  const prefix = `opt-${STEPS[step]}-`
  return key?.startsWith(prefix) ? key.slice(prefix.length) : undefined
}

// enter: the next question, or null after the last (speed is moot when animation is off)
export function advance(s: Setup): Setup | null {
  const last = s.picks.animation === 'off' ? 2 : 3
  return s.step >= last ? null : { ...s, step: s.step + 1 }
}

// the enabled marketplace install ("cli-dashboard@<marketplace>"); otherwise this copy was loaded from its folder,
// which the CLI only knows by that folder passed back as --plugin-dir
export const configureArgv = (enabled: Readonly<Record<string, unknown>>, root: string) => {
  const id = Object.keys(enabled).find(k => k.startsWith('cli-dashboard@') && enabled[k] === true)
  return id
    ? ['claude', 'plugin', 'configure', id, '--values-stdin']
    : ['claude', '--plugin-dir', root, 'plugin', 'configure', 'cli-dashboard@inline', '--values-stdin']
}
