<div align="center">

# cli-dashboard

**A live session dashboard for Claude Code, drawn right under your prompt.**

Context health, rate limits, subagents, tasks and skills, all in one bordered panel that updates as you work.

</div>

<p align="center">
  <img src="docs/images/full.png" alt="cli-dashboard with every section open: where and who, how full, agents, tasks, and skills and plugins, each labelled" width="100%">
</p>

> Inspired by [**YAS! (Yet Another Statusline)**](https://github.com/tmck-code/yet-another-statusline) by tmck-code. Go give it a star.


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

### Full, partial and shrunken

The panel grows and shrinks with what is going on and how wide your terminal is.

| State | When | Screenshot |
| --- | --- | --- |
| **Full** | Subagents running, tasks open, skills shown (132 columns) | <img src="docs/images/full.png" alt="Full panel" width="520"> |
| **Partial** | The everyday view: the two fixed rows and the current task (112 columns) | <img src="docs/images/partial.png" alt="Partial panel with the fixed rows and the tasks row" width="520"> |
| **Shrunken** | A narrow terminal (76 columns) | <img src="docs/images/shrunken.png" alt="Shrunken panel with shortened cells and hidden extras" width="360"> |

When the top row runs out of room, the panel gives things up in a fixed order: it shortens the directory, then hides the 7-day limit, the session name, the dirty count and the cache countdown. It then takes back anything that fits again, so a long session name never costs you the 7-day limit. Anything still too long is cut with `…`.

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
tools/
  screenshots/   renders the README images from the drawing code
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

Regenerate the README screenshots after a visual change (needs Google Chrome and FiraCode Nerd Font):

```sh
bun tools/screenshots/render.ts
```

The script draws the panel with the mod's own code at fixed widths and writes `docs/images/*.png`. The data in it is made up.

### A note on events

On Claude Code 2.1.295, the `classic.*` hook events (`SessionStart`, `PostToolUse`, `Stop`, `SubagentStop`, and the rest) never reach a mod, although the API types document them. The panel uses only events that do arrive: `session.start`, `turn.step`, `turn.complete`, `prompt.submit`, `agent.spawn` and `tool.call`. Check that an event fires before you build on it.

## Known limits

- The panel sits below Claude Code's mode line (`auto mode on (shift+tab to cycle)`). The terminal draws that line itself, and a mod cannot draw above it from under the prompt.
- Live agent tokens are read from transcripts on disk every 2 seconds. A transcript over 4 MiB cannot be read, so its count stops at the last value read.
- After `/clear`, the task list is reloaded with the first request after your next prompt.

## Credits

- [**YAS! (Yet Another Statusline)**](https://github.com/tmck-code/yet-another-statusline) by tmck-code, the statusline this project grew out of. cli-dashboard started as a mod that shows what YAS shows, live and clickable, under the prompt. If you want a statusline, use YAS.
- [**Dumbometer**](https://github.com/MaximoCorrea1/dumbometer) by Maximo Correa Rosas, for the Smart → Dumb state words and their thresholds, which YAS ported and this project reuses.

## License

[MIT](LICENSE) © 2026 Iqmal Aizat
