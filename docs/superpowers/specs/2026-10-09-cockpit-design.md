# cockpit: design

Date: 2026-10-09. Status: approved in conversation, pending written-spec review.

## Purpose

cockpit is a personal Claude Code mod. It replaces the yet-another-statusline (YAS) plugin
with a calmer design that shows the same session information, with fewer rows, pastel colours
and live data from engine events instead of transcript scraping.

Audience: one user, on one machine. A trial of a few days decides if it stays.

Success criteria:

- Every session starts with cockpit loaded, with no manual step.
- The Panel shows all kept YAS information (see "Information kept") with correct live values.
- When no agent, workflow or task is active, the Panel uses 2 content rows.
- The design uses zero model tokens.

Vocabulary is defined in `CONTEXT.md`. This spec uses those terms.

## Decisions

| # | Decision |
|---|----------|
| Placement | The Panel is drawn under the prompt, in the `PromptHint` slot below the engine's hint line (moved from the AbovePrompt band on 2026-10-09, user decision). No status line script. Fast mode is not shown, because the mod API does not expose it. |
| Name | `cockpit`. `claude-panel` is refused by `claude plugin validate`: the `claude-` prefix is reserved. |
| Repo | `~/Documents/cockpit`, a new git repository. |
| Loading | `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, which points to `~/Documents/cockpit`. Interactive sessions hot-reload it. |
| YAS during trial | Remove `statusLine` from `~/.claude/settings.json`. Restore it if the trial fails. Back up settings first. |
| Config | None. Constants live in code. |
| Tests | Minimal: pure-logic checks only (see "Testing"). |

## The Panel

A frame drawn with box-drawing characters in a muted border colour (OKLCH L 0.6, C 0.05).
Each value is in its own Cell. Each section computes its own cell widths, and the separator
rows join the dividers of adjacent sections with `┬ ┴ ┼`. Every row is one `Text` line with
`wrap="truncate-end"`. A `Box` row is not used: it wrapped and broke the frame in the preview.

Colours: comet-style pastels, OKLCH L 0.85, C 0.07, one hue per cell. Icons are Nerd Font
glyphs in the cell's pastel colour. Material Design ("md") icons are followed by two spaces,
because they draw wider than one cell. The powerline branch glyph is followed by one space.

### Fixed Rows (always shown)

Row 1, where and who:

| Cell | Content | Source |
|------|---------|--------|
| Directory | `~/path` (home shortened) | `$.session.cwd()` |
| Session Name | `creating-own-yas-18`. Takes the row's spare width. | `~/.claude/sessions/*.json`, the file whose `sessionId` equals `$.session.id()`, field `name`. Refreshed on `classic.SessionStart` and `turn.start`. Internal file, not an API: on any failure show `…`. |
| Branch | `main •3` (dirty file count) | `git` via `$.process.run`, refreshed on `turn.complete` and `classic.CwdChanged` |
| Model | `opus 5.5 · high` | `$.session.model()`; effort from the last hook input that carries `effort.level`. Shows the last known value. |
| 5h | `5h 42% 1h12m` (used %, time to reset) | `$.session.usage().rateLimits`, `session.measure` |
| 7d | `7d 18% 3d` | same |

Row 2, how full:

| Cell | Content | Source |
|------|---------|--------|
| Dumb Meter | state icon, continuous bar, state word, context tokens. Takes the row's spare width. | `$.session.usage().context.tokens`, `session.measure` |
| Session Tokens | `412k tok`: input + cache-read + output for the session | `turn.complete` `usage`, summed |
| Cache Countdown | `cache 3:41`: time until the prompt cache expires | time of the last main-loop response + cache TTL (5 min, or 1 h when the response wrote 1-hour cache) |

### Dumb Meter

- Soft Limit = min(800,000, context window).
- Fill = context tokens / Soft Limit, clamped to 0..1.
- Dumb State by fill: below 25% Smart, below 50% Coasting, below 70% Foggy, below 90% Cooked,
  otherwise Dumb.
- State colours (hue): Smart 160 (mint), Coasting 230 (sky), Foggy 95 (butter),
  Cooked 55 (peach), Dumb 10 (rose).
- State icons: brain, cloud, fog, fire, skull (Nerd Font md).
- Bar glyph: `🬋` (U+1FB0B), a centred one-third-height block, repeated to fill the cell.
  The filled part is a gradient from mint to the state hue. The empty part is the same glyph
  in a dim slate colour (OKLCH L 0.32, C 0.02).
- The gradient always moves: a triangle wave over position minus time, one loop about every
  5 seconds (frame 120 ms, phase step 0.025 per frame).

### Activity Sections (shown only when non-empty)

Agents:

- Label cell `agents N` (N = running count), then one body cell with no inner dividers.
- One Agent Row per subagent: name, model (dim), description (static, as given at spawn),
  then right-aligned in fixed widths: tokens (5), elapsed (6), and a braille spinner or `✓`.
- Running rows take a flowing pastel hue. Finished rows are dim with `✓`.
- An Agent Row stays until the next user prompt.
- At most 5 rows show at a time, running first. The rest are a scroll away: a click on the
  agents rows focuses them, `↓`/`↑` move the window one row, Esc returns to the prompt. A tail
  row counts what is out of view (`↑ 2  ↓ 3 more`). Mods cannot take arrow keys from the prompt
  itself, so the click comes first. (Changed 2026-10-09, user decision: was `+N more` /
  `✓ N done` with no way to see them.)
- Source: `agent.spawn`, `classic.SubagentStart` / `classic.SubagentStop`, and
  `session.append` rows with `agentId` for token counts.

Workflows: same shape as Agents. The label cell holds the run name and phase. Workflows share
the 5-row cap with Agents.

Tasks:

- Collapsed by default: `tasks 2/5 ▸ │ ▸ active task  3:10`.
- A click on the row, or focus on the band and Enter, toggles it. Expanded (`▾`), it lists
  every task: `✓` done (dim), `▸` active (flowing hue), `○` to do (dim), with right-aligned
  timers.
- The whole row is one `Button` with `plain` and no `hotkey`. A hotkey makes a plain Button
  draw a `t:` prefix.
- Source: `tool.call` for TaskCreate / TaskUpdate / TodoWrite, seeded from `TaskList` on
  `classic.SessionStart` (the comet pattern).

Skills/plugins:

- Hidden by default. Toggled by a click on a small control in the Panel, or by `/cockpit-skills`.
- One row: loaded skills, and enabled plugins.
- Source: skills from `Skill` tool calls this session (`tool.call`); plugins from `enabledPlugins` in `$.settings.read()`.
- Mods cannot bind their own key chords from the prompt, so there is no keyboard shortcut.

### Narrow terminals

When the cells do not fit, first shorten the directory to its last two folders
(`…/work-repos/api-relay`, so sibling repositories still read apart), then drop in this order:
7d, Session Name, branch dirty count, Cache Countdown. The Dumb Meter, Model and 5h cells are
never dropped. (Changed 2026-10-09, user decision: the basename step came last and 7d first.)

### Motion

Only these animate: the Dumb Meter gradient (always), running Agent Rows, and the active
task marker. One `$.clock.every(120)` timer drives a frame counter. Everything else is still.

## Information kept and dropped

Kept from YAS: directory, git branch and dirty count, Cache Countdown, 5h and 7d limits,
model and effort, Dumb Meter, Session Tokens (one total), task list, subagents, workflows,
skills and plugins (behind a toggle).

Added: Session Name, expandable tasks.

Dropped: session and clear timers, cost, lines read/changed, per-tool counts, tokens/min
sparkline, OpenSpec bars, fast mode, context-window percentage.

## Error handling

- Each data source fails alone: a failed read shows `…` in its cell. It never hides the Panel.
- `git` failure or a non-repository directory: the Branch cell is omitted.
- No rate-limit data (an API-key session): the 5h and 7d cells are omitted.
- The Panel draws nothing while `e.props.hasSurvey` is true, and always draws the bands
  beneath it (`next(e)`) first.

## Testing

Pure functions only, run with `claude plugin test`:

1. Dumb State cut-offs: 24.9% is Smart, 25% is Coasting, 90% is Dumb; Soft Limit uses the
   context window when it is smaller than 800k.
2. Narrow-terminal drop order: at a given width, the expected cells remain.
3. Agent Row lifetime: a finished agent stays until the next prompt and then goes.
4. Cache Countdown: 5-minute and 1-hour TTL from the last response time.

No rendering tests.

## Visual reference

The approved throwaway preview: `~/.claude/dev-mods/630be510-971d-4152-b0bd-8c1141a914d7/panel-preview/`.
It uses fake data except for Session Name. It is deleted after the real
build matches it.

## Out of scope

- Forgetting-signal health metrics (the dumb-meter experiment).
- Configuration files, themes, an install wizard, a marketplace entry.
- Cost display.
- A live activity line on the spinner (tried in the preview and dropped: it changed too fast to read).
