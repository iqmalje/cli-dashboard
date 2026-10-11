<div align="center">

# cli-dashboard

**A live session dashboard for Claude Code, drawn right under your prompt.**

Context health, rate limits, subagents, tasks and skills, all in one bordered panel that updates as you work.

</div>

```
╭─────────────────────────┬────────────────┬───────────────────┬──────────────────┬────────────────╮
│ …/work-repos/api-relay  │ api-relay-15   │ feature/webhooks  │ opus 5.5 · high  │ 5h 25% 43:52   │
├─────────────────────────┴────────────────┴───────────────────┴─────────┬────────┴─┬──────────────┤
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━────────────  Coasting · 299k/1M             │ 55M tok  │ cache 55:45  │
├────────────┬───────────────────────────────────────────────────────────┴──────────┴──────────────┤
│ agents 1   │ general-purpose  opus 5.5 · medium  Final review          3.9M  4:35  ⠋             │
│            │ general-purpose  opus 5.5 · medium  Review Task A6        1.6M  2:12  ✓             │
├────────────┴┬────────────────────────────────────────────────────────────────────────────────────┤
│ tasks 5/6 ▸ │ ▸ Final whole-branch reviews                                                       │
╰─────────────┴─────────────────────────────────────────────────────────────────────── 1 skills ▸ ─╯
```

## What it shows

| Row | What you see |
| --- | --- |
| **Where and who** | Working directory, session name, git branch with a dirty-file count, model and effort, and your 5-hour and 7-day rate limits with time to reset. |
| **How full** | The **Dumb Meter** (context fill), the session's total tokens, and a countdown to when the prompt cache expires. |
| **Agents** | One row per subagent: type, model and effort, task, live token count, elapsed time, and a spinner or ✓. Workflow agents get their own section, named after the run. |
| **Tasks** | Progress (`done/total`) and the task in progress. Click to expand the full list. |
| **Skills** | The skills used this session and the enabled plugins. Toggle with `/cli-dashboard-skills` or a click. |

The agents, tasks and skills sections only appear while they have something to show.

### The Dumb Meter

The meter measures context tokens against a **soft limit**: 800k tokens, or the model's context window if that is smaller. The bar flows in a gradient and is named by how full it is:

| Fill | State |
| --- | --- |
| under 25% | **Smart** |
| 25–50% | **Coasting** |
| 50–70% | **Foggy** |
| 70–90% | **Cooked** |
| 90% and over | **Dumb** |

### Fits any terminal width

When the top row runs out of room, the panel gives things up in a fixed order: it shortens the directory, then hides the 7-day limit, the session name, the dirty count and the cache countdown. It then takes back anything that fits again, so a long session name never costs you the 7-day limit.

## Requirements

- **Claude Code 2.1.295 or later**, with function-hook mods. The mod API is early access and may change between releases.
- **A Nerd Font** in your terminal (for example JetBrains Mono Nerd Font). Without one, the icons show as boxes.
- **git** on your `PATH`, for the branch cell.

## Installation

**1. Clone the repository**

```sh
git clone https://github.com/iqmalje/cli-dashboard.git ~/Documents/cli-dashboard
```

Any folder works. The steps below assume `~/Documents/cli-dashboard`.

**2. Point Claude Code at the folder**

Add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/Documents/cli-dashboard"
  }
}
```

If you already load other mods, separate the folders with a colon:

```json
"CLAUDE_CODE_PLUGIN_DIRS": "~/Documents/other-mod:~/Documents/cli-dashboard"
```

**3. Start a new Claude Code session**

```sh
claude
```

The panel appears under the prompt. Sessions that were already open do not load it; restart them.

### Updating

```sh
git -C ~/Documents/cli-dashboard pull
```

Open sessions reload the mod's code by themselves when its files change.

### Uninstalling

Remove the folder from `CLAUDE_CODE_PLUGIN_DIRS`, restart your sessions, then delete the folder.

## Using it

| Action | How |
| --- | --- |
| Expand or collapse the task list | Click the **tasks** row |
| Scroll the agent rows (5 show at a time) | Click the **agents** rows, then press ↑ / ↓ |
| Show or hide skills and plugins | Click **skills** in the bottom border, or run `/cli-dashboard-skills` |

Finished agents stay on the panel with a ✓ until your next prompt, so you can see how they ended.

## Development

The code is plain TypeScript: pure functions over immutable data, with the I/O in one hooks module.

```
hooks/
  register.tsx   event hooks and the panel render (the only module with I/O)
  rows.ts        builds the panel's rows and cells from session data
  frame.ts       lays out cells into a bordered frame that fits the width
  meter.ts       Dumb Meter maths
  agents.ts      agent rows: spawn, stop, tokens, effort, scrolling
  tasks.ts       task list from TaskCreate / TaskUpdate / TodoWrite calls
  format.ts      durations, token counts, model names, paths
  color.ts       OKLCH colours and the flowing gradient
  scroll.tsx     the focusable agents region (↑ / ↓)
types/           the panel's own types and its state shape
CONTEXT.md       the project's vocabulary (Panel, Cell, Dumb Meter, ...)
```

Run the tests:

```sh
claude plugin test .
```

Type-check:

```sh
npx -p typescript tsc --noEmit -p .
```

`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`. Claude Code writes that folder (the engine's API types) the first time it loads the mod, so start one session with the mod installed before you type-check. It is git-ignored.

### A note on events

On Claude Code 2.1.295, the `classic.*` hook events (`SessionStart`, `PostToolUse`, `Stop`, `SubagentStop`, and the rest) never reach a mod, although the API types document them. The panel uses only events that do arrive: `session.start`, `turn.step`, `turn.complete`, `prompt.submit`, `agent.spawn` and `tool.call`. Check that an event fires before you build on it.

## Known limits

- The panel sits below Claude Code's mode line (`auto mode on (shift+tab to cycle)`). The terminal draws that line itself, and a mod cannot draw above it from under the prompt.
- Live agent tokens are read from transcripts on disk every 2 seconds. A transcript over 4 MiB cannot be read, so its count stops at the last value read.
- After `/clear`, the task list is reloaded with the first request after your next prompt.
