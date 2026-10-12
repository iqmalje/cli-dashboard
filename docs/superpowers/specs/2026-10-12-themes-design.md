# Themes, icons and animation: design

Date: 2026-10-12. Status: approved in conversation.

## Purpose

Let users pick how the Panel looks: colour theme, icon set, animation style and speed. They pick at
setup with a guided wizard that previews live, or later through `/plugin configure`. Only data the
Panel already shows is in scope.

Vocabulary is defined in `CONTEXT.md`.

## Settings

Four new `userConfig` fields in `.claude-plugin/plugin.json`, next to `softLimit`. An unknown or unset
value means the default.

| Key | Values | Default |
| --- | --- | --- |
| `theme` | `pastel` (recommended), `rainbow`, `mono`, `light`, `high-contrast` | `pastel` |
| `icons` | `nerd`, `plain` | `nerd` |
| `animation` | `full`, `calm`, `off` | `full` |
| `speed` | `0.5x`, `1x`, `2x` | `1x` |

## Themes

A theme is three things: `color(h)` (how a cell's hue becomes a colour), `border` and `track` (the
empty part of the Dumb Meter). Every cell keeps its own hue; themes only change how hues render.

| Theme | `color(h)` | Notes |
| --- | --- | --- |
| pastel | `oklch(0.85, 0.07, h)` | Today's look. Border `oklch(0.6, 0.05, 280)`, track `oklch(0.32, 0.02, 280)`. |
| rainbow | `oklch(0.75, 0.16, h)` | Static and saturated. |
| mono | one fixed hue, ignores `h` | Calm, low distraction. Colour cycling is invisible here by design. |
| light | `oklch(0.50, 0.12, h)` | For light terminal backgrounds: darker border, light-grey track. |
| high-contrast | `oklch(0.90, 0.18, h)` | Bright border, near-black track. |

Starting values; light and high-contrast are tuned by eye with `tools/screenshots/render.ts`.

## Icons

- `nerd`: today's `ICON` table and `STATES` icons.
- `plain`: single-width Unicode that needs no Nerd Font (for example `▸ ◆ ⎇`). No emoji: their width breaks
  cell alignment.

## Animation

Everything that moves today: the Dumb Meter gradient flow, the hue cycling of running agent names and
the in-progress task `▸`, and the braille spinner on running agents.

- `full`: today's behaviour.
- `calm`: the spinner keeps moving; colour cycling and the meter flow freeze (the meter is a still
  gradient).
- `off`: nothing moves. Running agents show a static `●` instead of the spinner. The 120ms frame tick
  is not started.

Speed scales the motion factors, not the tick: the gradient step (`0.125` per frame in `flow`) becomes
`0.0625` / `0.125` / `0.25`, and the hue step (`6°` per frame) becomes `3` / `6` / `12`. The tick stays
120ms and the spinner keeps its rate, so `1x` is exactly today and `2x` costs no extra redraws.

## Setup wizard: `/cli-dashboard-setup`

- The command opens a focused pane (`$.ui.open({ focus: true, closeOnEscape: true })`). It shows one
  question at a time, in the order theme → icons → animation → speed. Speed is skipped when animation is
  `off`. (Not a question line in the Panel: a `Client` there needs a click for keys and never receives
  Escape.)
- ←/→ cycles the options, enter goes to the next question, esc closes the pane and cancels.
- Under the question, the pane draws a live preview of the Panel with the option currently shown, using
  the same `draw` code and the session's real Fixed Rows data.
- The preview adds sample rows (a running agent, a finished agent, an in-progress task), reusing the
  screenshot renderer's sample data, so the animation and speed steps have something to preview.
- Enter on the last question saves the choices to `userConfig` (`claude plugin configure
  --values-stdin`), so both routes stay in sync. The current session applies them at once; other sessions
  on restart.
- Esc at any step discards every choice and restores the previous look. Nothing is saved before the final
  enter.
- Until the wizard has been completed or cancelled once, the bottom border shows a `◆ /cli-dashboard-setup`
  hint.

## Order of work

1. Themes and settings: swappable colours, plain icons, animation and speed, the `userConfig` fields.
   Usable through `/plugin configure` on its own.
2. The wizard: command, question line, sample rows, saving, first-run hint.

## Checks

Resolved:

- `userConfig` supports pickers: a `string` field with `options` (and a `default` among them) is a picker in
  the config menu, a stored value outside them counts as unset, and a change there reloads the module with
  the new `options`.
- The wizard saves by running `claude plugin configure <id> --values-stdin` through `$.process.run` (it takes
  `stdin`). `<id>` is the `enabledPlugins` key that starts with `cli-dashboard@`. The current session also
  applies the choice at once from a session value, so it never waits on a reload.
- The "wizard done once" flag lives in `$.store` (kept across sessions).

## Out of scope

Custom colours, new information cells, choosing or ordering sections, renaming meter states.
