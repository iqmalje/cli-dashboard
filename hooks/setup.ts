import { width } from './format'
import type { Line, Seg } from './frame'
import { CHOICES, lookOf } from './look'
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

// cut segs to `max` cells, ending in … when something was cut
const clip = (segs: readonly Seg[], max: number): Seg[] => {
  if (segs.reduce((n, g) => n + width(g.text), 0) <= max) return [...segs]
  const out: Seg[] = []
  let left = max - 1
  for (const g of segs) {
    if (left <= 0) break
    const text = [...g.text].slice(0, left).join('')
    out.push({ ...g, text })
    left -= width(text)
  }
  return [...out, { text: '…' }]
}

export type SetupRow = { segs: Seg[]; choice?: string }

// The pane's rows, framed to W columns (the frame takes 4): register.tsx draws them as Boxes and the README
// render draws them as text, so the two cannot drift. `preview` is already drawn at W - 4.
export function setupRows(s: Setup, W: number, preview: readonly Line[]): SetupRow[] {
  const k = STEPS[s.step] ?? 'theme'
  const q = QUESTIONS[k]
  const look = lookOf(s.picks)
  const inner = Math.max(0, W - 4)
  const edge = (text: string): Seg => ({ text, color: look.border })
  const row = (content: readonly Seg[], choice?: string): SetupRow => {
    const segs = clip(content, inner)
    const pad = inner - segs.reduce((n, g) => n + width(g.text), 0)
    return { segs: [edge('│ '), ...segs, { text: ' '.repeat(pad) }, edge(' │')], ...(choice === undefined ? {} : { choice }) }
  }
  const blank = row([])
  const total = s.picks.animation === 'off' ? 3 : 4
  const title = 'cli-dashboard setup'
  return [
    { segs: [edge(`╭─ ${title} ${'─'.repeat(Math.max(0, W - 5 - title.length))}╮`)] },
    row([{ text: q.title, bold: true }, { text: ` ${s.step + 1}/${total}`, dim: true }]),
    row([{ text: q.about, dim: true }]),
    blank,
    ...CHOICES[k].map(v =>
      row(
        v === s.picks[k]
          ? [{ text: `▸ ${v}`, bold: true, color: look.color(280) }, { text: `  ${q.hints[v]}`, dim: true }]
          : [{ text: `  ${v}` }, { text: `  ${q.hints[v]}`, dim: true }],
        v,
      ),
    ),
    blank,
    row([{ text: '  cancel', dim: true }], 'cancel'),
    blank,
    row([{ text: '↑/↓ choose · enter pick · esc cancel', dim: true }]),
    ...preview.map(l => row(l.segs)),
    { segs: [edge(`╰${'─'.repeat(Math.max(0, W - 2))}╯`)] },
  ]
}
