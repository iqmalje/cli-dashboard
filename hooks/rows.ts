import type { AgentRow, Git, Limit, Task, Usage } from '../types'
import { visible } from './agents'
import { fmtDuration, fmtModel, fmtTokens, shortDir, shortenHome, width } from './format'
import type { Cell, Drop, Part, Section } from './frame'
import type { Look } from './look'
import { burnHue, dumbState, STATES, fill, FIVE_HOURS, SEVEN_DAYS } from './meter'
import { active } from './tasks'

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export type FixedData = {
  now: number
  cwd: string
  home: string
  sessionName: string | null
  git: Git | null
  model: string
  effort: string | null
  usage: Usage | null
  sessionTokens: number
  cacheLeftMs: number | null
  softLimit: number
}

// md icons draw wider than one cell; the powerline branch glyph does not
const ic = (icon: string, h: number, look: Look): Part => ({ text: icon === look.icon.branch ? `${icon} ` : `${icon}  `, color: look.color(h) })
const cell = (...parts: Part[]): Cell => ({ parts })
const blank = cell({ text: '' })

const limit = (label: string, l: Limit, windowMs: number, icon: string, h: number, now: number, look: Look) =>
  cell(
    ic(icon, h, look),
    { text: `${label} ` },
    { text: `${Math.round(l.percent)}%`, color: look.color(burnHue(l, windowMs, now, h)) },
    ...(l.resetsAt === undefined ? [] : [{ text: ` ${fmtDuration(l.resetsAt - now)}`, dim: true }]),
  )

export function fixedRows(d: FixedData, drops: ReadonlySet<Drop>, look: Look): Section[] {
  const row1: Cell[] = [cell(ic(look.icon.dir, 280, look), { text: drops.has('dirShort') ? shortDir(shortenHome(d.cwd, d.home)) : shortenHome(d.cwd, d.home) })]
  const named = !drops.has('sessionName')
  if (named) row1.push(cell(ic(look.icon.session, 20, look), { text: d.sessionName ?? '…', color: look.color(20) }))
  if (d.git) {
    const dirty = d.git.dirty > 0 && !drops.has('dirty') ? [{ text: ` •${d.git.dirty}`, color: look.color(55) }] : []
    row1.push(cell(ic(look.icon.branch, 140, look), { text: d.git.branch }, ...dirty))
  }
  row1.push(cell(ic(look.icon.model, 300, look), { text: fmtModel(d.model) }, ...(d.effort ? [{ text: ` · ${d.effort}`, dim: true }] : [])))
  if (d.usage?.fiveHour) row1.push(limit('5h', d.usage.fiveHour, FIVE_HOURS, look.icon.h5, 200, d.now, look))
  if (d.usage?.sevenDay && !drops.has('sevenDay')) row1.push(limit('7d', d.usage.sevenDay, SEVEN_DAYS, look.icon.d7, 250, d.now, look))

  const tokens = d.usage?.contextTokens ?? 0
  const f = fill(tokens, d.softLimit)
  const st = dumbState(f)
  const meter = cell(
    { text: `${look.states[STATES.indexOf(st)]}  `, color: look.color(st.hue) },
    { text: '\u{1FB0B}', grow: f, hues: [160, st.hue] },
    { text: '\u{1FB0B}', grow: 1 - f, color: look.track },
    { text: `  ${st.name}`, color: look.color(st.hue), bold: true },
    { text: ` · ${fmtTokens(tokens)}${d.usage?.window ? `/${fmtTokens(d.usage.window)}` : ''}`, dim: true },
  )
  const row2: Cell[] = [meter, cell(ic(look.icon.tokens, 180, look), { text: fmtTokens(d.sessionTokens) }, { text: ' tok', dim: true })]
  if (d.cacheLeftMs !== null && !drops.has('cache')) {
    row2.push(cell(ic(look.icon.cache, 120, look), { text: 'cache ' }, { text: fmtDuration(d.cacheLeftMs), color: look.color(120) }))
  }
  return [
    { rows: [row1], flex: named ? 1 : 0 },
    { rows: [row2], flex: 0 },
  ]
}

const agentModel = (r: AgentRow) => fmtModel(r.model) + (r.effort ? ` · ${r.effort}` : '')

const agentBody = (r: AgentRow, i: number, nameW: number, modelW: number, now: number, f: number, look: Look): Cell => {
  const done = r.endedAt !== undefined
  const h = (i * 70 + f * look.hue) % 360
  return cell(
    { text: r.name.padEnd(nameW), color: done ? undefined : look.color(h), dim: done },
    { text: agentModel(r).padEnd(modelW), dim: true },
    { text: r.description, dim: done },
    { text: ' ', grow: 1 },
    { text: (r.tokens === undefined ? '' : fmtTokens(r.tokens)).padStart(5), dim: true },
    { text: fmtDuration((r.endedAt ?? now) - r.startedAt).padStart(6), dim: true },
    { text: '  ' },
    done ? { text: '✓', color: look.color(150) } : { text: look.spin ? (SPIN[(f + i * 3) % SPIN.length] ?? '⠋') : '●', color: look.color(h) },
  )
}

const group = (label: Cell, rows: readonly AgentRow[], tail: string | null, now: number, f: number, look: Look): Section => {
  const nameW = Math.max(...rows.map(r => width(r.name))) + 2
  const modelW = Math.max(...rows.map(r => width(agentModel(r)))) + 2
  const body: Cell[][] = rows.map((r, i) => [i === 0 ? label : blank, agentBody(r, i, nameW, modelW, now, f, look)])
  if (tail) body.push([blank, cell({ text: tail, dim: true })])
  return { rows: body, flex: 1, press: 'agents' }
}

export function agentSections(rows: readonly AgentRow[], runs: Readonly<Record<string, string>>, now: number, f: number, offset: number, look: Look): Section[] {
  const v = visible(rows, offset)
  if (v.shown.length === 0) return []
  const tail = [v.above > 0 ? `↑ ${v.above}` : '', v.below > 0 ? `↓ ${v.below} more` : '']
    .filter(Boolean)
    .join('  ')
  const plain = v.shown.filter(r => r.runId === undefined)
  const sections: Section[] = []
  if (plain.length > 0) {
    const running = rows.filter(r => r.runId === undefined && r.endedAt === undefined).length
    sections.push(group(cell(ic(look.icon.agents, 330, look), { text: 'agents ' }, { text: String(running), bold: true }), plain, null, now, f, look))
  }
  for (const runId of [...new Set(v.shown.flatMap(r => (r.runId === undefined ? [] : [r.runId])))]) {
    const members = v.shown.filter(r => r.runId === runId)
    sections.push(group(cell(ic(look.icon.workflow, 270, look), { text: runs[runId] ?? 'workflow' }), members, null, now, f, look))
  }
  const last = sections.pop()
  if (last) sections.push(tail ? { ...last, rows: [...last.rows, [blank, cell({ text: tail, dim: true })]] } : last)
  return sections
}

const taskLine = (t: Task, now: number, f: number, look: Look): Cell => {
  const timer = t.startedAt === undefined ? '' : fmtDuration((t.endedAt ?? now) - t.startedAt)
  if (t.status === 'completed') return cell({ text: '✓ ', color: look.color(150) }, { text: t.subject, dim: true }, { text: ' ', grow: 1 }, { text: timer.padStart(6), dim: true })
  if (t.status === 'in_progress') return cell({ text: '▸ ', color: look.color((f * look.hue) % 360) }, { text: t.subject }, { text: ' ', grow: 1 }, { text: timer.padStart(6), dim: true })
  return cell({ text: '○ ', dim: true }, { text: t.subject, dim: true }, { text: ' ', grow: 1 }, { text: ''.padStart(6) })
}

export function taskSection(tasks: readonly Task[], open: boolean, now: number, f: number, look: Look): Section | null {
  if (tasks.length === 0) return null
  const done = tasks.filter(t => t.status === 'completed').length
  const label = cell(ic(look.icon.tasks, 150, look), { text: 'tasks ' }, { text: `${done}/${tasks.length}`, bold: true }, { text: open ? ' ▾' : ' ▸', dim: true })
  const current = active(tasks)
  const rows: Cell[][] = open
    ? tasks.map((t, i) => [i === 0 ? label : blank, taskLine(t, now, f, look)])
    : [[label, current ? taskLine(current, now, f, look) : cell({ text: 'all done', dim: true })]]
  return { rows, flex: 1, press: 'tasks' }
}

export function skillsSection(skills: readonly string[], plugins: readonly string[], look: Look): Section {
  return {
    rows: [[
      cell(ic(look.icon.skills, 60, look), { text: 'skills ' }, { text: String(skills.length), bold: true }),
      cell({ text: skills.join(' · ') || 'none yet', dim: true }),
      cell(ic(look.icon.skills, 20, look), { text: 'plugins ' }, { text: plugins.join(' · '), dim: true }),
    ]],
    flex: 1,
  }
}

// Claude Code's session registry (~/.claude/sessions/<pid>.json) holds the Session Name beside the session id.
export function sessionNameFrom(files: readonly { name: string; text: string }[], sessionId: string): string | null {
  for (const f of files) {
    try {
      const s = JSON.parse(f.text) as { sessionId?: unknown; name?: unknown }
      if (s.sessionId === sessionId && typeof s.name === 'string') return s.name
    } catch {
      // a registry file mid-write: skip it; the next turn reads it again
    }
  }
  return null
}
