import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { AgentRow, Limit, Task, Usage } from '../types'
import { agentTokens, onPrompt, scrollBy, setEffort, setTokens, spawn, stop } from './agents'
import { agentDirOf, cacheLeft, effortFromSettings, parseGit } from './format'
import { draw, planDrops, rowWidth } from './frame'
import { softLimit } from './meter'
import type { Drop, Line } from './frame'
import { agentSections, fixedRows, ICON, sessionNameFrom, skillsSection, taskSection } from './rows'
import type { FixedData } from './rows'
import { applyToolCall } from './tasks'
import type { TaskCall } from './tasks'

const frame = atom({ plugin: 'cli-dashboard', key: 'frame' } as const, 0)
const home = atom({ plugin: 'cli-dashboard', key: 'home' } as const, '')
const configDir = atom({ plugin: 'cli-dashboard', key: 'configDir' } as const, '')
const cwd = atom({ plugin: 'cli-dashboard', key: 'cwd' } as const, '')
const usage = atom({ plugin: 'cli-dashboard', key: 'usage' } as const, null as Usage | null)
const model = atom({ plugin: 'cli-dashboard', key: 'model' } as const, '')
const effort = atom({ plugin: 'cli-dashboard', key: 'effort' } as const, null as string | null)
const git = atom({ plugin: 'cli-dashboard', key: 'git' } as const, null as { branch: string; dirty: number } | null)
const sessionName = atom({ plugin: 'cli-dashboard', key: 'sessionName' } as const, null as string | null)
const sessionTokens = atom({ plugin: 'cli-dashboard', key: 'sessionTokens' } as const, 0)
const lastResponseAt = atom({ plugin: 'cli-dashboard', key: 'lastResponseAt' } as const, null as number | null)
const tasks = atom({ plugin: 'cli-dashboard', key: 'tasks' } as const, [] as readonly Task[])
const tasksOpen = atom({ plugin: 'cli-dashboard', key: 'tasksOpen' } as const, false)
const agents = atom({ plugin: 'cli-dashboard', key: 'agents' } as const, [] as readonly AgentRow[])
const agentScroll = atom({ plugin: 'cli-dashboard', key: 'agentScroll' } as const, 0)
const agentDir = atom({ plugin: 'cli-dashboard', key: 'agentDir' } as const, '')
const sessionId = atom({ plugin: 'cli-dashboard', key: 'sessionId' } as const, '')
const runs = atom({ plugin: 'cli-dashboard', key: 'runs' } as const, {} as Readonly<Record<string, string>>)
const skills = atom({ plugin: 'cli-dashboard', key: 'skills' } as const, [] as readonly string[])
const plugins = atom({ plugin: 'cli-dashboard', key: 'plugins' } as const, [] as readonly string[])
const showSkills = atom({ plugin: 'cli-dashboard', key: 'showSkills' } as const, false)

const HINT_MARGIN = 4

type Measure = { context: { tokens?: number; window: number }; rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[] }

const toLimit = (l: Measure['rateLimits'][number] | undefined): Limit | undefined =>
  l === undefined ? undefined : { percent: l.percentUsed, ...(l.resetsAt ? { resetsAt: Date.parse(l.resetsAt) } : {}) }

const toUsage = (m: Measure): Usage => ({
  contextTokens: m.context.tokens ?? 0,
  window: m.context.window,
  fiveHour: toLimit(m.rateLimits.find(l => l.kind === 'five_hour')),
  sevenDay: toLimit(m.rateLimits.find(l => l.kind === 'seven_day')),
})

async function refreshGit($: EngineInterface) {
  const dir = await read($, cwd)
  if (!dir) return
  try {
    const r = await $.process.run(['git', 'status', '--porcelain=v1', '--branch'], { cwd: dir, timeoutMs: 2000 })
    await update($, git, () => parseGit(r.exitCode, r.stdout))
  } catch {
    await update($, git, () => null)
  }
}

async function refreshSessionName($: EngineInterface) {
  try {
    const dir = `${await read($, configDir)}/sessions`
    const id = await $.session.id()
    const names = (await $.fs.list(dir)).filter(f => f.name.endsWith('.json'))
    const files = await Promise.all(names.map(async f => ({ name: f.name, text: await $.fs.read(`${dir}/${f.name}`).catch(() => '') })))
    const name = sessionNameFrom(files, id)
    if (name) await update($, sessionName, () => name)
  } catch {
    // the registry is Claude Code's internal state; without it the cell shows …
  }
}

// classic.* hooks (SessionStart, PostToolUse) never reach this module on 2.1.295, so no event names
// the transcript: find it by session id under any project folder.
async function findAgentDir($: EngineInterface) {
  const run = await $.process.run(['sh', '-c', 'ls -d "$0"/projects/*/"$1".jsonl', await read($, configDir), await $.session.id()])
  const path = run.exitCode === 0 ? run.stdout.split('\n')[0] : undefined
  if (!path) return ''
  const dir = agentDirOf(path)
  await update($, agentDir, () => dir)
  return dir
}

// A new session id (startup, /clear, resume) seeds the tasks and drops the old session's agents and tokens;
// classic.SessionStart, which did this, never reaches the module. Answers whether the session changed.
async function syncSession($: EngineInterface) {
  const id = await $.session.id()
  const was = await read($, sessionId)
  if (id === was) return false
  await update($, sessionId, () => id)
  await update($, agentDir, () => '')
  if (was) {
    await update($, sessionTokens, () => 0)
    await update($, agents, () => [])
  }
  try {
    const res = await $.tool.call({ tool: 'TaskList' })
    if ('result' in res && res.result !== undefined && !res.isError) {
      const seeded = res.result.tasks.map(t => ({ id: t.id, subject: t.subject, status: t.status }))
      await update($, tasks, () => seeded)
    }
  } catch {
    // keep the current list until the next task call
  }
  return true
}

// Live subagent tokens: re-read each running agent's transcript (a read over 4 MiB rejects; keep the last count).
async function refreshAgentTokens($: EngineInterface) {
  const rows = await read($, agents)
  if (rows.length === 0) return
  const dir = (await read($, agentDir)) || (await findAgentDir($))
  if (!dir) return
  for (const r of rows) {
    if (r.endedAt !== undefined && r.tokens !== undefined) continue
    try {
      // workflow agents sit one level deeper: subagents/workflows/<runId>/agent-<id>.jsonl (from YAS; unverified here)
      const file = r.runId === undefined ? `${dir}/agent-${r.id}.jsonl` : `${dir}/workflows/${r.runId}/agent-${r.id}.jsonl`
      const n = agentTokens(await $.fs.read(file))
      await update($, agents, rows => setTokens(rows, r.id, n))
    } catch {
      // not written yet, or too large to read
    }
  }
}

async function refreshSession($: EngineInterface) {
  const env = await $.process.run(['sh', '-c', 'printf "%s\\n%s" "$HOME" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"'])
  const [h = '', c = ''] = env.stdout.split('\n')
  await update($, home, () => h)
  await update($, configDir, () => c)
  const dir = await $.session.cwd()
  await update($, cwd, () => dir)
  const m = await $.session.model()
  await update($, model, () => m)
  const u = await $.session.usage()
  await update($, usage, () => toUsage(u))
  const settings = await $.settings.read()
  const enabled = (settings.enabledPlugins ?? {}) as Record<string, unknown>
  await update($, plugins, () => Object.keys(enabled).filter(k => enabled[k] === true).map(k => k.split('@')[0] ?? k))
  // no hook carries effort until the first tool call or turn end; seed it from settings meanwhile
  const seed = effortFromSettings(settings, m)
  if (seed) await update($, effort, v => v ?? seed)
  await refreshGit($)
  await refreshSessionName($)
}

export const register: Register = (on, options) => {
  // the userConfig softLimit (claude plugin configure); unset means the per-model default
  const userLimit = Number(options.softLimit ?? 0)
  let tick: Timer | undefined
  let poll: Timer | undefined

  on('session.start', async ($, e, next) => {
    tick ??= $.clock.every(120, () => update($, frame, n => n + 1))
    // an in-process /resume raises no session.start and no turn until the next prompt: the poll spots the new id
    poll ??= $.clock.every(2000, async () => {
      if (await syncSession($).catch(() => false)) await refreshSession($).catch(() => {})
      await refreshAgentTokens($)
    })
    try {
      await refreshSession($)
    } catch {
      // each cell shows … until its own event fills it
    }
    await syncSession($).catch(() => {})
    await $.command.register({ name: 'cli-dashboard-skills', description: 'Toggle the skills/plugins row in the cli-dashboard panel' }).catch(() => {})
    return next(e)
  })

  // ↑/↓ from the focused agents rows (scroll.tsx)
  on('ui.message', async ($, e, next) => {
    const by = (e.data as { by?: unknown } | null)?.by
    if (e.element === 'agents' && typeof by === 'number') {
      const n = (await read($, agents)).length
      await update($, agentScroll, o => scrollBy(o, by, n))
    }
    return next(e)
  })

  on('command.run', { command: 'cli-dashboard-skills' }, async $ => {
    await update($, showSkills, v => !v)
    return { text: 'Toggled the cli-dashboard skills/plugins row.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e))
    return next(e)
  })

  // Agent Rows live until the next user prompt
  on('prompt.submit', async ($, e, next) => {
    await update($, agents, rows => onPrompt(rows))
    await update($, agentScroll, () => 0)
    await refreshSessionName($)
    return next(e)
  })

  // model and effort ride on each model request's turn.step: classic.* hooks never reach this module
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    const level = e.effort === undefined ? undefined : String(e.effort)
    if (id) {
      if (level) await update($, agents, rows => setEffort(rows, id, level))
    } else {
      await syncSession($).catch(() => {})
      await update($, model, () => e.model)
      if (level) await update($, effort, () => level)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    const n = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
    await update($, sessionTokens, t => t + n)
    const now = await $.clock.now()
    // a subagent run is one turn; SubagentStop is not raised for every agent (workflow, stopped)
    const id = e.agentId
    if (id) {
      await update($, agents, rows => stop(rows, id, now))
    } else {
      await update($, lastResponseAt, () => now)
      const dir = await $.session.cwd().catch(() => '')
      if (dir) await update($, cwd, () => dir)
      await refreshGit($)
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    // the engine's own unnamed forks (compaction, memory) are not the user's agents
    if (e.fork && !e.name) return r
    const now = await $.clock.now()
    const row: AgentRow = {
      id: r.agentId ?? e.tool_use_id,
      name: e.name ?? e.subagentType,
      model: r.model,
      description: e.description,
      startedAt: now,
      ...(e.workflow ? { runId: e.workflow.runId } : {}),
    }
    await update($, agents, rows => spawn(rows, row))
    return r
  })

  on('tool.call', { tool: ['TaskCreate', 'TaskUpdate', 'TodoWrite'] }, async ($, e, next) => {
    const r = await next(e)
    if ('result' in r && r.result !== undefined && !r.isError) {
      const now = await $.clock.now()
      await update($, tasks, list => applyToolCall(list, e as unknown as TaskCall, r.result, now))
    }
    return r
  })

  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    const r = await next(e)
    if ('result' in r && r.result !== undefined && !r.isError) {
      const w = r.result as { runId?: string; workflowName?: string }
      if (w.runId && w.workflowName) {
        const id = w.runId
        const name = w.workflowName
        await update($, runs, m => ({ ...m, [id]: name }))
      }
    }
    return r
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const r = await next(e)
    const name = String((e as unknown as { skill?: unknown }).skill ?? '')
    if (name) await update($, skills, list => (list.includes(name) ? list : [...list, name]))
    return r
  })

  // under the prompt, in the hint line's place; the engine's hint line stays above the Panel
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // the engine's hint line and other plugins draw first; never replace them
    const below = await next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Client = 'Client' in elements ? elements.Client : undefined
    const f = await read($, frame)
    const now = await $.clock.now()
    // ponytail: the hint line is 4 columns narrower than the terminal (measured live); a Client region reports its real width if this drifts
    const W = (e.viewport?.columns ?? 80) - HINT_MARGIN

    const m = await read($, model)
    const u = await read($, usage)
    const data: FixedData = {
      now,
      cwd: await read($, cwd),
      home: await read($, home),
      sessionName: await read($, sessionName),
      git: await read($, git),
      model: m,
      effort: await read($, effort),
      usage: u,
      sessionTokens: await read($, sessionTokens),
      cacheLeftMs: cacheLeft(await read($, lastResponseAt), now),
      softLimit: softLimit(u?.window ?? 0, m, userLimit),
    }
    const need = (drops: ReadonlySet<Drop>) => Math.max(...fixedRows(data, drops).map(s => rowWidth(s.rows[0] ?? [])))
    const drops = planDrops(need, W)

    const list = await read($, tasks)
    const tasksSec = taskSection(list, await read($, tasksOpen), now, f)
    const skillList = await read($, skills)
    const sections = [
      ...fixedRows(data, drops),
      ...agentSections(await read($, agents), await read($, runs), now, f, await read($, agentScroll)),
      ...(tasksSec ? [tasksSec] : []),
      ...((await read($, showSkills)) ? [skillsSection(skillList, await read($, plugins))] : []),
    ]
    const caption = { text: ` ${ICON.skills}  ${skillList.length} skills ${(await read($, showSkills)) ? '▾' : '▸'} `, press: 'skills' }
    const press: Record<string, () => void> = {
      tasks: () => void update($, tasksOpen, v => !v),
      skills: () => void update($, showSkills, v => !v),
    }

    const toRow = (l: Line, i: number) => {
      const row = (
        <Text wrap="truncate-end">
          {l.segs.map(s => (
            <Text color={s.color} dimColor={s.dim} bold={s.bold}>
              {s.text}
            </Text>
          ))}
        </Text>
      )
      const onPress = l.press ? press[l.press] : undefined
      return onPress ? (
        <Button key={`${l.press}-${i}`} plain onPress={onPress}>
          {row}
        </Button>
      ) : (
        row
      )
    }

    // the agents rows (and the rules between their sections) go in one Client, so a click focuses them for ↑/↓
    // (props are plain JSON: the round trip drops the segments' undefined fields)
    const lines = draw(sections, W, f, caption)
    const first = lines.findIndex(l => l.press === 'agents')
    const last = lines.findLastIndex(l => l.press === 'agents')
    const panel =
      first < 0 || !Client
        ? lines.map(toRow)
        : [
            ...lines.slice(0, first).map(toRow),
            <Client key="agents" module="./scroll.tsx" props={{ lines: JSON.parse(JSON.stringify(lines.slice(first, last + 1).map(l => l.segs))) }} />,
            ...lines.slice(last + 1).map((l, i) => toRow(l, last + 1 + i)),
          ]

    return (
      <Box flexDirection="column">
        {below}
        {panel}
      </Box>
    )
  })
}
