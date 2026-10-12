import { CHOICES } from './look'
import type { Choices, Picks } from './look'

export const STEPS = ['theme', 'icons', 'animation', 'speed'] as const

// the wizard draft: which question is up, and the picks so far
export type Setup = { step: number; picks: Picks }

// ←/→ cycle the current setting's choices, wrapping
export function cycle(s: Setup, by: number): Setup {
  const k: keyof Choices = STEPS[s.step] ?? 'theme'
  const list: readonly string[] = CHOICES[k]
  const at = list.indexOf(s.picks[k])
  const value = list[(at + by + list.length) % list.length]
  return { ...s, picks: { ...s.picks, [k]: value } }
}

// enter: the next question, or null after the last (speed is moot when animation is off)
export function advance(s: Setup): Setup | null {
  const last = s.picks.animation === 'off' ? 2 : 3
  return s.step >= last ? null : { ...s, step: s.step + 1 }
}

// the plugin's key in enabledPlugins ("cli-dashboard@<marketplace>"); the bare name when installed another way
export const pluginId = (enabled: Readonly<Record<string, unknown>>) => Object.keys(enabled).find(k => k.startsWith('cli-dashboard@')) ?? 'cli-dashboard'
