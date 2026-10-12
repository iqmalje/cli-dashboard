<div align="center">

# cli-dashboard

**A live session dashboard for Claude Code, drawn right under your prompt.**

Context health, rate limits, subagents, tasks and skills, all in one bordered panel that updates as you work.

**Alpha** · v0.2.0

</div>

> [!NOTE]
> cli-dashboard is in **alpha**. It ships one look, the author's own: one colour palette and one icon set. Settings to change these are planned (see the [Roadmap](#roadmap)). Expect rough edges, and expect the layout to change between releases.

<p align="center">
  <img src="docs/images/full.png" alt="cli-dashboard with every section open: where and who, how full, agents, tasks, and skills and plugins, each labelled" width="100%">
</p>

> Inspired by [**YAS! (Yet Another Statusline)**](https://github.com/tmck-code/yet-another-statusline) by tmck-code. Go give it a star.

## Contents

- [What it shows](#what-it-shows)
  - [The Dumb Meter](#the-dumb-meter)
  - [Full, partial and shrunken](#full-partial-and-shrunken)
- [Installation](#installation)
  - [Fonts](#fonts)
  - [Updating](#updating)
  - [Uninstalling](#uninstalling)
  - [Troubleshooting](#troubleshooting)
- [Using it](#using-it)
- [Development](#development)
- [Known limits](#known-limits)
- [Roadmap](#roadmap)
- [Credits](#credits)
- [License](#license)

## What it shows

| Row | What you see |
| --- | --- |
| **Where and who** | Working directory, session name, git branch with a dirty-file count, model and effort, and your 5-hour and 7-day rate limits with time to reset. The limit percentage shows your burn rate: **blue** under an even pace for the window, **peach** up to 5 points over it, **rose** beyond that. |
| **How full** | The **Dumb Meter** (context fill), the session's total tokens, and a countdown to when the prompt cache expires. |
| **Agents** | One row per subagent: type, model and effort, task, live token count, elapsed time, and a spinner or ✓. Workflow agents get their own section, named after the run. |
| **Tasks** | Progress (`done/total`) and the task in progress. Click to expand the full list. |
| **Skills** | The skills used this session and the enabled plugins. Toggle with `/cli-dashboard-skills` or a click. |

The agents, tasks and skills sections only appear while they have something to show.

### The Dumb Meter

The meter measures context tokens against a **soft limit**, the point the meter treats as full. The default depends on the model:

| Model | Default soft limit | Why |
| --- | --- | --- |
| Claude 5 models (Fable, Opus, Sonnet, Haiku 5.x) on a 1M window | **800K** | Their system cards report long-context results across the full 1M window with no published drop-off point. |
| Claude 4.x and older on a 1M window (Opus 4.6–4.8, Sonnet 4.6) | **512K** | Opus 4.6 measurably degrades past 256K (MRCR v2, 8 needles: 93.0 at 256K, 76.0 at 1M), so the meter turns Foggy at 256K. |
| Any model on a 200K window (Haiku 4.5, Opus 4.5, Sonnet 4.5) | **200K** | The window itself. |

You can set your own soft limit (see [Settings](#settings)). The bar flows in a gradient and is named by how full it is:

| Fill | State |
| --- | --- |
| under 25% | **Smart** |
| 25–50% | **Coasting** |
| 50–70% | **Foggy** |
| 70–90% | **Cooked** |
| 90% and over | **Dumb** |

<p align="center"><img src="docs/images/meter.png" alt="The Dumb Meter in each of its five states, from Smart to Dumb, with the bar's gradient growing warmer as it fills" width="720"></p>

The gradient runs from Smart's green to the colour of the current state and flows along the bar. While the meter is **Smart**, both ends are the same green, so the bar looks still. The flow shows from **Coasting** on, and grows stronger as the meter heads for **Dumb**.

### Full, partial and shrunken

The panel grows and shrinks with what is going on and how wide your terminal is.

**Full**: subagents running, tasks open, skills shown (132 columns).

<p align="center"><img src="docs/images/full.png" alt="Full panel with every section open" width="100%"></p>

**Partial**: the everyday view, with the two fixed rows and the current task (112 columns).

<p align="center"><img src="docs/images/partial.png" alt="Partial panel with the fixed rows and the tasks row" width="100%"></p>

**Shrunken**: a narrow terminal (76 columns).

<p align="center"><img src="docs/images/shrunken.png" alt="Shrunken panel with shortened cells and hidden extras" width="540"></p>

When the top row runs out of room, the panel gives things up in a fixed order: it shortens the directory, then hides the 7-day limit, the session name, the dirty count and the cache countdown. It then takes back anything that fits again, so a long session name never costs you the 7-day limit. Anything still too long is cut with `…`.

## Installation

You need **Claude Code 2.1.295 or later** (`claude --version`; run `claude update` if it is older).

**1. Install the plugin**

```sh
claude plugin marketplace add iqmalje/cli-dashboard
claude plugin install cli-dashboard@cli-dashboard
```

**2. Start a new session**

```sh
claude
```

That's it. The panel appears under the prompt. Sessions that were already open don't pick it up, so restart them.

### Fonts

The panel needs two kinds of glyphs from your terminal font:

- **Icons**: [Nerd Font](https://www.nerdfonts.com/font-downloads) icons for every cell. Without them each icon is a box or a `◆`.
- **The meter bar**: `U+1FB0B`, from Unicode's *Symbols for Legacy Computing* block. Without it the bar is a row of `�`.

Not every Nerd Font has both, and not every terminal falls back to another font for a missing glyph. Windows Terminal, for one, does not reliably fall back.

| Font | Icons | Meter bar |
| --- | --- | --- |
| **Cascadia Mono NF** / **Cascadia Code NF** | ✓ | ✓ |
| FiraCode Nerd Font | ✓ | only through your terminal's font fallback |
| JetBrainsMono Nerd Font | ✓ | ✗ in Windows Terminal |
| Cascadia Mono (Windows Terminal's default) | ✗ | ✓ |

**Cascadia Mono NF** is the safest pick. It is Microsoft's own Nerd Font build of Cascadia, and it ships in the zip on the [Cascadia Code releases page](https://github.com/microsoft/cascadia-code/releases).

**macOS**: install a Nerd Font and select it in your terminal (for example iTerm2: Settings → Profiles → Text → Font).

```sh
brew install --cask font-fira-code-nerd-font
```

**Windows (including WSL)**: the font goes on **Windows**, not inside WSL, because Windows Terminal draws the text.

1. Download the zip from the [Cascadia Code releases page](https://github.com/microsoft/cascadia-code/releases), open `ttf/`, right-click `CascadiaMonoNF.ttf` and choose **Install**.
2. In Windows Terminal, open **Settings → Defaults → Appearance → Font face** and pick **Cascadia Mono NF**. A profile's own font overrides the default, so check your WSL profile too. In `settings.json` the same setting is:

   ```json
   "profiles": { "defaults": { "font": { "face": "Cascadia Mono NF" } } }
   ```

3. Close every Windows Terminal window, then start a new `claude` session.

### Updating

```sh
claude plugin marketplace update cli-dashboard
claude plugin update cli-dashboard@cli-dashboard
```

Restart your sessions to load the new version.

### Uninstalling

```sh
claude plugin uninstall cli-dashboard@cli-dashboard
claude plugin marketplace remove cli-dashboard
```

### Settings

| Setting | What it does | Default |
| --- | --- | --- |
| `softLimit` | Context tokens the Dumb Meter treats as full. Capped at the model's context window. | Per model (see [The Dumb Meter](#the-dumb-meter)) |

Set it from a terminal:

```sh
echo '{"softLimit": "400000"}' | claude plugin configure cli-dashboard@cli-dashboard --values-stdin
```

Or run `/plugin configure cli-dashboard@cli-dashboard` inside Claude Code. Restart your sessions to apply it. To go back to the per-model default, set it to `0`.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| No panel under the prompt | Run `claude plugin list` and check that `cli-dashboard@cli-dashboard` says **enabled**, then start a new session. |
| No panel, and the plugin is enabled | Check `claude --version` is 2.1.295 or later. Older versions don't run mods. |
| Boxes or `◆` instead of icons | Your font has no Nerd Font icons. Install one and select it in your terminal (see [Fonts](#fonts)). |
| `�` along the meter bar | Your font has no `U+1FB0B`. Switch to **Cascadia Mono NF** (see [Fonts](#fonts)). |
| The meter bar doesn't flow | Expected while the meter is **Smart**: the gradient is one colour until **Coasting** (see [The Dumb Meter](#the-dumb-meter)). |
| No branch cell | The panel only shows a branch inside a git repository, with `git` on your `PATH`. |

## Using it

| Action | How |
| --- | --- |
| Expand or collapse the task list | Click the **tasks** row |
| Scroll the agent rows (5 show at a time) | Click the **agents** rows, then press ↑ / ↓ |
| Show or hide skills and plugins | Click **skills** in the bottom border, or run `/cli-dashboard-skills` |

Finished agents stay on the panel with a ✓ until your next prompt, so you can see how they ended.

## Development

To work on the mod, load it from a clone instead of the marketplace (uninstall the marketplace copy first, or the panel draws twice):

```sh
git clone https://github.com/iqmalje/cli-dashboard.git ~/Documents/cli-dashboard
```

Then add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`. Separate several folders with a colon:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/Documents/cli-dashboard"
  }
}
```

Open sessions reload the mod's code by themselves when its files change.

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

Regenerate the README screenshots after a visual change (needs [Bun](https://bun.sh), Google Chrome and FiraCode Nerd Font):

```sh
bun tools/screenshots/render.ts
```

The script draws the panel with the mod's own code at fixed widths and writes `docs/images/*.png`: the full, partial and shrunken panels, and the meter in each state. The data in it is made up. The paths default to macOS. Set `CHROME` to the Chrome binary and `FONTS` to the folder holding `FiraCodeNerdFont-Regular.ttf` and `-Bold.ttf` to render elsewhere.

### A note on events

On Claude Code 2.1.295, the `classic.*` hook events (`SessionStart`, `PostToolUse`, `Stop`, `SubagentStop`, and the rest) never reach a mod, although the API types document them. The panel uses only events that do arrive: `session.start`, `turn.step`, `turn.complete`, `prompt.submit`, `agent.spawn` and `tool.call`. Check that an event fires before you build on it.

## Known limits

- The panel sits below Claude Code's mode line (`auto mode on (shift+tab to cycle)`). The terminal draws that line itself, and a mod cannot draw above it from under the prompt.
- Live agent tokens are read from transcripts on disk every 2 seconds. A transcript over 4 MiB cannot be read, so its count stops at the last value read.
- The cache countdown assumes a 1-hour prompt cache. Sessions on an API key get a 5-minute cache by default, so their countdown runs too long. A fix is planned.
- After `/clear` or `/resume`, the panel catches up within about 2 seconds. The token total restarts at 0 for the resumed session.

## Roadmap

cli-dashboard is in alpha, and today everything is fixed to one style. Planned:

- **Colour palettes**: pick a theme, or set your own colours for the border, meter and sections.
- **Icon packs**: choose between Nerd Font icon sets, or plain text for terminals without a Nerd Font.
- **Meter states**: rename the five states and move their thresholds.
- **Sections and cells**: choose which ones show, and in what order.

Ideas and requests are welcome in [issues](https://github.com/iqmalje/cli-dashboard/issues).

## Credits

- [**YAS! (Yet Another Statusline)**](https://github.com/tmck-code/yet-another-statusline) by tmck-code, the statusline this project grew out of. cli-dashboard started as a mod that shows what YAS shows, live and clickable, under the prompt. If you want a statusline, use YAS.
- [**Dumbometer**](https://github.com/MaximoCorrea1/dumbometer) by Maximo Correa Rosas, for the Smart → Dumb state words and their thresholds, which YAS ported and this project reuses.

## License

[MIT](LICENSE) © 2026 Iqmal Aizat
