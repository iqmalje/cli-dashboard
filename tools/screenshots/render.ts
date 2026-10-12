// Renders the README screenshots and GIFs from the mod's own drawing code: bun tools/screenshots/render.ts
// Needs Google Chrome (or Chromium), gifski and FiraCode Nerd Font installed; CHROME and FONTS point elsewhere than macOS. Writes docs/images/*.png and *.gif.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

import type { AgentRow, Task } from '../../types'
import { draw, planDrops, rowWidth } from '../../hooks/frame'
import type { Drop, Line, Section, Seg } from '../../hooks/frame'
import { agentSections, fixedRows, skillsSection, taskSection } from '../../hooks/rows'
import type { FixedData } from '../../hooks/rows'
import { CHOICES, lookOf, picksFrom } from '../../hooks/look'
import type { Look, Picks } from '../../hooks/look'
import { QUESTIONS, STEPS, setupRows } from '../../hooks/setup'
import { MIN, sampleAgents, sampleTasks } from '../../hooks/sample'

const look = lookOf(picksFrom({}))

const ROOT = resolve(import.meta.dir, '../..')
const OUT = join(ROOT, 'docs/images')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FONTS = process.env.FONTS ?? join(process.env.HOME ?? '', 'Library/Fonts')
const CELL_W = 9 // px per terminal column at font-size 15px
const LINE_H = 20
const NOW = 1_800_000_000_000

const data: FixedData = {
  now: NOW,
  cwd: '/Users/dev/code/api-relay',
  home: '/Users/dev',
  sessionName: 'api-relay-15',
  git: { branch: 'feature/webhook-retries', dirty: 3 },
  model: 'claude-opus-5-5',
  effort: 'high',
  usage: {
    contextTokens: 299_000,
    window: 1_000_000,
    fiveHour: { percent: 25, resetsAt: NOW + 132 * MIN },
    sevenDay: { percent: 20, resetsAt: NOW + 3 * 24 * 60 * MIN },
  },
  sessionTokens: 55_400_000,
  cacheLeftMs: 55 * MIN + 45_000,
  softLimit: 800_000,
}

const agents = sampleAgents(NOW)
const tasks = sampleTasks(NOW)

type Colors = { bg: string; fg: string }
type Shot = { name: string; columns: number; agents: boolean; tasks: boolean; skills: boolean; notes: boolean; lines?: (W: number) => Line[]; colors?: Colors }

const panel = (s: Shot): Line[] => {
  const W = s.columns - 4 // the hint line is 4 columns narrower than the terminal
  if (s.lines) return s.lines(W)
  const need = (drops: ReadonlySet<Drop>) => Math.max(...fixedRows(data, drops, look).map(sec => rowWidth(sec.rows[0] ?? [])))
  const drops = planDrops(need, W)
  const skillList = ['superpowers:brainstorming', 'simplify']
  const sections: Section[] = [
    ...fixedRows(data, drops, look),
    ...(s.agents ? agentSections(agents, {}, NOW, 4, 0, look) : []),
    ...(s.tasks ? [taskSection(tasks, false, NOW, 4, look)!] : []),
    ...(s.skills ? [skillsSection(skillList, ['superpowers', 'cli-dashboard', 'codex'], look)] : []),
  ]
  const caption = { text: ` ${look.icon.skills}  ${skillList.length} skills ${s.skills ? '▾' : '▸'} `, press: 'skills' }
  return draw(sections, W, 10, look, caption)
}

// The Dumb Meter row alone, once per state, from Smart to Dumb
const meterStates = (W: number): Line[] =>
  [0.12, 0.38, 0.6, 0.8, 0.96].flatMap(f => {
    const d: FixedData = { ...data, usage: { ...data.usage!, contextTokens: Math.round(f * 800_000) } }
    return draw([fixedRows(d, new Set(), look)[1]!], W, 3, look)
  })

const esc = (c: string) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c)

// One fixed-width box per character keeps the terminal grid even where a glyph draws wider.
// a focused row is drawn inverted: the cell's colour becomes its background
type LSeg = Seg & { inverse?: boolean }
const lineHtml = (l: { segs: readonly LSeg[] }) =>
  l.segs
    .map(seg => {
      const style = `${seg.inverse ? `background:${seg.color ?? DARK.fg};color:${DARK.bg};` : `${seg.color ? `color:${seg.color};` : ''}${seg.dim ? 'opacity:.55;' : ''}`}${seg.bold ? 'font-weight:700;' : ''}`
      // the meter's U+1FB0B is not in Fira Code (terminals draw it from a fallback font): draw it as the bar it is
      return [...seg.text].map(ch => (ch === '\u{1FB0B}' ? `<i class="bar" style="${style}"></i>` : `<i style="${style}">${esc(ch)}</i>`)).join('')
    })
    .join('')

// Callouts: each row group of the full panel gets a bracket and a label on the right; row 1's cells get labels above.
type Note = { from: number; to: number; title: string; text: string; hue: string }

const sectionNotes = (lines: Line[]): Note[] => {
  const starts = lines.flatMap((l, i) => (l.segs[0]?.text.match(/^[╭├]/) ? [i] : []))
  const meta = [
    { title: 'Where and who', text: 'directory · session · branch · model · limits', hue: '#b9a7f5' },
    { title: 'How full', text: 'Dumb Meter · session tokens · cache countdown', hue: '#8fd6b4' },
    { title: 'Agents', text: 'type · model · effort · task · tokens · time', hue: '#f2a7c6' },
    { title: 'Tasks', text: 'progress · current task · click to expand', hue: '#9fd1f0' },
    { title: 'Skills and plugins', text: 'used this session · /cli-dashboard-skills', hue: '#f0d08f' },
  ]
  return starts.map((s, k) => ({ from: s + 1, to: (starts[k + 1] ?? lines.length - 1) - 1, ...meta[k]! }))
}

const cellNotes = (lines: Line[]) => {
  const text = lines[1]!.segs.map(s => s.text).join('')
  const bars = [...text].flatMap((c, i) => (c === '│' ? [i] : []))
  const names = ['directory', 'session name', 'git branch · dirty files', 'model · effort', '5-hour limit', '7-day limit']
  return bars.slice(0, -1).map((x, k) => ({ from: x + 1, to: bars[k + 1]! - 1, name: names[k] ?? '' }))
}

const page = (s: Shot) => pageOf(panel(s), s.columns - 4, s.notes, undefined, s.colors)

// A fixed canvas (width in columns, height in lines) keeps every frame of a GIF the same size.
const DARK: Colors = { bg: '#1d1b26', fg: '#e4e1f0' }
const pageOf = (lines: Line[], W: number, withNotes: boolean, canvas?: { columns: number; lines: number }, colors: Colors = DARK) => {
  const s = { notes: withNotes }
  const top = s.notes ? 64 : 24
  const left = 24
  const panelW = (canvas ? canvas.columns - 4 : W) * CELL_W
  const notesW = s.notes ? 360 : 0
  const width = left + panelW + 24 + notesW + 24
  const height = top + (canvas ? canvas.lines : lines.length) * LINE_H + 24
  const body = lines.map((l, i) => `<div class="ln" style="top:${top + i * LINE_H}px">${lineHtml(l)}</div>`).join('')
  const notes = s.notes
    ? [
        ...sectionNotes(lines).map(n => {
          const y1 = top + n.from * LINE_H + 3
          const y2 = top + (n.to + 1) * LINE_H - 3
          const x = left + panelW + 14
          return `<div class="br" style="left:${x}px;top:${y1}px;height:${y2 - y1}px;border-color:${n.hue}"></div>
            <div class="nt" style="left:${x + 18}px;top:${(y1 + y2) / 2 - 18}px"><b style="color:${n.hue}">${n.title}</b><span>${n.text}</span></div>`
        }),
        ...cellNotes(lines).map(c => {
          const x1 = left + c.from * CELL_W + 4
          const x2 = left + (c.to + 1) * CELL_W - 4
          return `<div class="cb" style="left:${x1}px;top:${top - 14}px;width:${x2 - x1}px"></div>
            <div class="cl" style="left:${x1}px;top:${top - 36}px;width:${x2 - x1}px">${c.name}</div>`
        }),
      ].join('')
    : ''
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: T; src: url("file://${FONTS}/FiraCodeNerdFont-Regular.ttf"); }
    @font-face { font-family: T; font-weight: 700; src: url("file://${FONTS}/FiraCodeNerdFont-Bold.ttf"); }
    html, body { margin: 0; width: ${width}px; height: ${height}px; background: ${colors.bg}; overflow: hidden; }
    .ln { position: absolute; left: ${left}px; height: ${LINE_H}px; line-height: ${LINE_H}px; white-space: pre; font: 15px T, monospace; color: ${colors.fg}; }
    .ln i { font-style: normal; display: inline-block; width: ${CELL_W}px; text-align: left; overflow: visible; }
    .ln i.bar { height: ${LINE_H}px; vertical-align: top; background: linear-gradient(currentColor, currentColor) center / 100% 4px no-repeat; }
    .br { position: absolute; width: 8px; border: 2px solid; border-left: 0; border-radius: 0 6px 6px 0; }
    .nt { position: absolute; display: flex; flex-direction: column; gap: 2px; font: 13px -apple-system, "Helvetica Neue", sans-serif; color: #b8b4c8; white-space: nowrap; }
    .nt b { font-size: 14px; font-weight: 600; }
    .cb { position: absolute; height: 8px; border: 1.5px solid ${look.border}; border-bottom: 0; border-radius: 5px 5px 0 0; }
    .cl { position: absolute; text-align: center; font: 12px -apple-system, "Helvetica Neue", sans-serif; color: #b8b4c8; white-space: nowrap; }
  </style><body>${body}${notes}</body>`
  return { html, width, height }
}

// ---- the /cli-dashboard-setup pane: question, choices and the live preview, laid out as register.tsx draws it ----

const fit = (l: Look, W: number) => {
  const need = (drops: ReadonlySet<Drop>) => Math.max(...fixedRows(data, drops, l).map(sec => rowWidth(sec.rows[0] ?? [])))
  return fixedRows(data, planDrops(need, W), l)
}

// W is the pane's full width; the draft choice is drawn focused, inverted as a terminal does
const wizard = (step: number, picks: Picks, f: number, W: number): Line[] => {
  const l = lookOf(picks)
  const sections: Section[] = [...fit(l, W - 4), ...agentSections(agents, {}, NOW, f, 0, l), taskSection(tasks, false, NOW, f, l)!]
  const k = STEPS[step]!
  return setupRows({ step, picks }, W, draw(sections, W - 4, f, l)).map(r => ({
    segs: r.choice === picks[k] ? r.segs.map((g, i, all): LSeg => (i === 0 || i === all.length - 1 ? g : { ...g, inverse: true })) : r.segs,
  }))
}

// Each theme's two fixed rows under its name and hint
const themeRows = (names: readonly Picks['theme'][]) => (W: number): Line[] =>
  names.flatMap((theme, i) => {
    const l = lookOf(picksFrom({ theme }))
    return [
      ...(i > 0 ? [{ segs: [{ text: '' }] }] : []),
      { segs: [{ text: theme, bold: true }, { text: `  ${QUESTIONS.theme.hints[theme]}`, dim: true }] },
      ...draw(fit(l, W), W, 4, l),
    ]
  })

const shots: Shot[] = [
  { name: 'full', columns: 132, agents: true, tasks: true, skills: true, notes: true },
  { name: 'partial', columns: 112, agents: false, tasks: true, skills: false, notes: false },
  { name: 'shrunken', columns: 76, agents: false, tasks: false, skills: false, notes: false },
  { name: 'meter', columns: 100, agents: false, tasks: false, skills: false, notes: false, lines: meterStates },
  { name: 'themes', columns: 112, agents: false, tasks: false, skills: false, notes: false, lines: themeRows(['pastel', 'rainbow', 'mono', 'high-contrast']) },
  { name: 'theme-light', columns: 112, agents: false, tasks: false, skills: false, notes: false, lines: themeRows(['light']), colors: { bg: '#f6f4fa', fg: '#2a2733' } },
]

const shoot = (html: string, width: number, height: number, png: string, scale: number) =>
  new Promise<void>((done, fail) => {
    const file = `${png}.html`
    writeFileSync(file, html)
    const p = spawn(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`, `--screenshot=${png}`, `file://${file}`])
    p.on('close', code => (rmSync(file), code === 0 ? done() : fail(new Error(`chrome failed for ${png}`))))
  })

// ---- animations: one frame per panel tick (120 ms), as the live panel redraws ----

type Clip = { name: string; columns: number; frames: number; frame: (k: number) => { lines: Line[]; W: number } }

const TICK = 4_000 // session time per frame in the hero clip, so timers and tokens visibly move

// A live session: agents spawn, run and finish, a task completes, tokens and the meter climb.
const hero = (k: number) => {
  const now = NOW + k * TICK
  const W = 128
  const run = (id: string, name: string, model: string, effort: string, description: string, from: number, to: number | undefined, rate: number): AgentRow[] =>
    k < from
      ? []
      : [{ id, name, model, effort, description, startedAt: NOW + from * TICK - 20_000, tokens: Math.round((Math.min(k, to ?? k) - from + 2) * rate), ...(to !== undefined && k >= to ? { endedAt: NOW + to * TICK } : {}) }]
  const rows = [
    ...run('a1', 'general-purpose', 'claude-opus-5-5', 'medium', 'Review the webhook retry plan', 0, 40, 70_000),
    ...run('a2', 'Explore', 'claude-sonnet-5-5', 'low', 'Find every caller of signPayload', 10, undefined, 30_000),
    ...run('a3', 'Plan', 'claude-opus-5-5', 'high', 'Draft the pull request description', 24, undefined, 45_000),
  ]
  const done = k >= 48
  const list: Task[] = [
    tasks[0]!,
    tasks[1]!,
    { ...tasks[2]!, status: done ? 'completed' : 'in_progress', ...(done ? { endedAt: NOW + 48 * TICK } : {}) },
    { ...tasks[3]!, status: done ? 'in_progress' : 'pending', ...(done ? { startedAt: NOW + 48 * TICK } : {}) },
  ]
  const d: FixedData = {
    ...data,
    now,
    usage: { ...data.usage!, contextTokens: 286_000 + k * 2_500 },
    sessionTokens: 55_400_000 + k * 180_000,
    cacheLeftMs: 55 * MIN + 45_000 - k * TICK,
  }
  const sections: Section[] = [...fixedRows(d, new Set(), look), ...agentSections(rows, {}, now, k, 0, look), taskSection(list, false, now, k, look)!]
  return { lines: draw(sections, W, k, look, { text: ` ${look.icon.skills}  2 skills ▸ `, press: 'skills' }), W }
}

// The Dumb Meter climbing from Smart to Dumb, then holding at the top.
const meter = (k: number) => {
  const p = Math.min(0.97, 0.05 + (k / 56) * 0.92)
  const d: FixedData = { ...data, usage: { ...data.usage!, contextTokens: Math.round(p * 800_000) } }
  return { lines: draw([fixedRows(d, new Set(), look)[1]!], 96, k, look), W: 96 }
}

// The 5h limit at an even pace of 50% (2.5h left): usage climbs from under pace, pauses in peach, then turns rose.
const burn = (k: number) => {
  const percent = k < 20 ? 38 + k * 0.7 : k < 34 ? 52 : Math.min(64, 52 + (k - 34) * 1.2)
  const d: FixedData = { ...data, usage: { ...data.usage!, fiveHour: { percent, resetsAt: NOW + 150 * MIN } } }
  return { lines: draw([fixedRows(d, new Set(), look)[0]!], 128, k, look), W: 128 }
}

// The terminal narrowing from 132 to 72 columns and widening back: cells drop out and return in order.
const resize = (k: number) => {
  const hold = 6
  const steps = 20
  const at = k < hold ? 0 : k < hold + steps ? k - hold : k < 2 * hold + steps ? steps : Math.max(0, 2 * steps + 2 * hold - k)
  const W = 128 - at * 3
  const need = (drops: ReadonlySet<Drop>) => Math.max(...fixedRows(data, drops, look).map(sec => rowWidth(sec.rows[0] ?? [])))
  const sections: Section[] = [...fixedRows(data, planDrops(need, W), look), taskSection(tasks, false, NOW, k, look)!]
  return { lines: draw(sections, W, k, look, { text: ` ${look.icon.skills}  2 skills ▸ `, press: 'skills' }), W }
}

// Walking the setup wizard: the preview follows each highlighted choice, enter moves on.
const WALK: [number, string, number][] = [
  [0, 'pastel', 10], [0, 'rainbow', 10], [0, 'mono', 10], [0, 'light', 10], [0, 'high-contrast', 10], [0, 'rainbow', 14],
  [1, 'nerd', 10], [1, 'plain', 12], [1, 'nerd', 12],
  [2, 'full', 10], [2, 'calm', 12], [2, 'full', 12],
  [3, '1x', 12], [3, '0.5x', 14], [3, '2x', 18],
]
const walkStates = WALK.reduce<{ step: number; picks: Picks; hold: number }[]>((acc, [step, value, hold]) => {
  const prev = acc.at(-1)?.picks ?? picksFrom({})
  return [...acc, { step, picks: { ...prev, [STEPS[step]!]: value } as Picks, hold }]
}, [])
const walkFrames = walkStates.flatMap(st => Array.from({ length: st.hold }, () => st))
const setup = (k: number) => {
  const st = walkFrames[k]!
  return { lines: wizard(st.step, st.picks, k, 96), W: 96 }
}

const clips: Clip[] = [
  { name: 'hero', columns: 132, frames: 64, frame: hero },
  { name: 'meter', columns: 100, frames: 68, frame: meter },
  { name: 'burn', columns: 132, frames: 56, frame: burn },
  { name: 'resize', columns: 132, frames: 52, frame: resize },
  { name: 'setup', columns: 100, frames: walkFrames.length, frame: setup },
]

const inBatches = async <T,>(items: readonly T[], size: number, run: (t: T) => Promise<void>) => {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(run))
}

// ONLY=hero,meter renders just those
const only = process.env.ONLY?.split(',')
const wanted = (name: string) => !only || only.includes(name)

mkdirSync(OUT, { recursive: true })
for (const s of shots.filter(s => wanted(s.name))) {
  const { html, width, height } = page(s)
  const png = join(OUT, `${s.name}.png`)
  await shoot(html, width, height, png, 2)
  console.log(`${png} (${width}×${height})`)
}
for (const c of clips.filter(c => wanted(c.name))) {
  const dir = mkdtempSync(join(tmpdir(), `cli-dashboard-${c.name}-`))
  const frames = Array.from({ length: c.frames }, (_, k) => ({ k, ...c.frame(k) }))
  const canvas = { columns: c.columns, lines: Math.max(...frames.map(f => f.lines.length)) }
  await inBatches(frames, 8, async f => {
    const { html, width, height } = pageOf(f.lines, f.W, false, canvas)
    await shoot(html, width, height, join(dir, `f${String(f.k).padStart(3, '0')}.png`), 1.5)
  })
  const gif = join(OUT, `${c.name}.gif`)
  const pngs = frames.map(f => join(dir, `f${String(f.k).padStart(3, '0')}.png`))
  const r = spawnSync('gifski', ['--fps', String(1000 / 120), '--quality', '90', '-o', gif, ...pngs])
  rmSync(dir, { recursive: true })
  if (r.status !== 0) throw new Error(`gifski failed for ${c.name}: ${r.stderr}`)
  console.log(`${gif} (${c.frames} frames)`)
}
