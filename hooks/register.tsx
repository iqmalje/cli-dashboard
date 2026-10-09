import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { AgentRow, Limit, Task, Usage } from '../types'
import { agentTokens, onPrompt, setTokens, spawn, stop } from './agents'
import { agentDirOf, cacheLeft, effortFromSettings, parseGit } from './format'
import { draw, planDrops, rowWidth } from './frame'
import type { Drop, Line } from './frame'
import { agentSections, fixedRows, ICON, sessionNameFrom, skillsSection, taskSection } from './rows'
import type { FixedData } from './rows'
import { applyToolCall } from './tasks'
import type { TaskCall } from './tasks'

const frame = atom({ plugin: 'cockpit', key: 'frame' } as const, 0)
const home = atom({ plugin: 'cockpit', key: 'home' } as const, '')
const configDir = atom({ plugin: 'cockpit', key: 'configDir' } as const, '')
const cwd = atom({ plugin: 'cockpit', key: 'cwd' } as const, '')
const usage = atom({ plugin: 'cockpit', key: 'usage' } as const, null as Usage | null)
const model = atom({ plugin: 'cockpit', key: 'model' } as const, '')
const effort = atom({ plugin: 'cockpit', key: 'effort' } as const, null as string | null)
const git = atom({ plugin: 'cockpit', key: 'git' } as const, null as { branch: string; dirty: number } | null)
const sessionName = atom({ plugin: 'cockpit', key: 'sessionName' } as const, null as string | null)
const sessionTokens = atom({ plugin: 'cockpit', key: 'sessionTokens' } as const, 0)
const lastResponseAt = atom({ plugin: 'cockpit', key: 'lastResponseAt' } as const, null as number | null)
const tasks = atom({ plugin: 'cockpit', key: 'tasks' } as const, [] as readonly Task[])
const tasksOpen = atom({ plugin: 'cockpit', key: 'tasksOpen' } as const, false)
const agents = atom({ plugin: 'cockpit', key: 'agents' } as const, [] as readonly AgentRow[])
const agentDir = atom({ plugin: 'cockpit', key: 'agentDir' } as const, '')
const runs = atom({ plugin: 'cockpit', key: 'runs' } as const, {} as Readonly<Record<string, string>>)
const skills = atom({ plugin: 'cockpit', key: 'skills' } as const, [] as readonly string[])
const plugins = atom({ plugin: 'cockpit', key: 'plugins' } as const, [] as readonly string[])
const showSkills = atom({ plugin: 'cockpit', key: 'showSkills' } as const, false)

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

// Live subagent tokens: re-read each running agent's transcript (a read over 4 MiB rejects; keep the last count).
async function refreshAgentTokens($: EngineInterface) {
  const dir = await read($, agentDir)
  if (!dir) return
  for (const r of await read($, agents)) {
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

export const register: Register = on => {
  let tick: Timer | undefined
  let poll: Timer | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit-skills', description: 'Toggle the skills/plugins row in the cockpit panel' })
    tick ??= $.clock.every(120, () => update($, frame, n => n + 1))
    poll ??= $.clock.every(2000, () => refreshAgentTokens($))
    try {
      await refreshSession($)
    } catch {
      // each cell shows … until its own event fills it
    }
    return next(e)
  })

  on('command.run', { command: 'cockpit-skills' }, async $ => {
    await update($, showSkills, v => !v)
    return { text: 'Toggled the cockpit skills/plugins row.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e))
    return next(e)
  })

  // Agent Rows live until the next user prompt
  on('prompt.submit', async ($, e, next) => {
    await update($, agents, rows => onPrompt(rows))
    await refreshSessionName($)
    return next(e)
  })

  // turn.step is a streaming event; effort rides on classic hook inputs instead
  on('classic.PostToolUse', async ($, e, next) => {
    const level = e.agent_id ? undefined : e.effort?.level
    if (level) await update($, effort, () => level)
    // a hot-reloaded cockpit never saw SessionStart; any main-loop tool call tells it where transcripts live
    if (!e.agent_id) await update($, agentDir, d => d || agentDirOf(e.transcript_path))
    return next(e)
  })

  // a turn with no tool call still ends with Stop, which carries the effort too
  on('classic.Stop', async ($, e, next) => {
    const level = e.effort?.level
    if (level) await update($, effort, () => level)
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    await update($, model, () => e.to_model)
    return next(e)
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
      await refreshGit($)
    }
    return next(e)
  })

  on('classic.CwdChanged', async ($, e, next) => {
    await update($, cwd, () => e.new_cwd)
    await refreshGit($)
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

  on('classic.SubagentStop', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, agents, rows => stop(rows, e.agent_id, now))
    await refreshAgentTokens($)
    return next(e)
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

  // session.start never fires on /clear or an in-process resume; the classic event does
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const dir = agentDirOf(e.transcript_path)
    await update($, agentDir, () => dir)
    try {
      const res = await $.tool.call({ tool: 'TaskList' })
      if ('result' in res && res.result !== undefined && !res.isError) {
        const seeded = res.result.tasks.map(t => ({ id: t.id, subject: t.subject, status: t.status }))
        await update($, tasks, () => seeded)
      }
    } catch {
      // keep the current list until the next task call
    }
    if (e.source === 'clear') {
      await update($, sessionTokens, () => 0)
      await update($, agents, () => [])
    }
    return r
  })

  // under the prompt, in the hint line's place; the engine's hint line stays above the Panel
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // the engine's hint line and other plugins draw first; never replace them
    const below = await next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const f = await read($, frame)
    const now = await $.clock.now()
    // ponytail: the hint line is 4 columns narrower than the terminal (measured live); a Client region reports its real width if this drifts
    const W = (e.viewport?.columns ?? 80) - HINT_MARGIN

    const data: FixedData = {
      now,
      cwd: await read($, cwd),
      home: await read($, home),
      sessionName: await read($, sessionName),
      git: await read($, git),
      model: await read($, model),
      effort: await read($, effort),
      usage: await read($, usage),
      sessionTokens: await read($, sessionTokens),
      cacheLeftMs: cacheLeft(await read($, lastResponseAt), now),
    }
    const need = (drops: ReadonlySet<Drop>) => Math.max(...fixedRows(data, drops).map(s => rowWidth(s.rows[0] ?? [])))
    const drops = planDrops(need, W)

    const list = await read($, tasks)
    const tasksSec = taskSection(list, await read($, tasksOpen), now, f)
    const skillList = await read($, skills)
    const sections = [
      ...fixedRows(data, drops),
      ...agentSections(await read($, agents), await read($, runs), now, f),
      ...(tasksSec ? [tasksSec] : []),
      ...((await read($, showSkills)) ? [skillsSection(skillList, await read($, plugins))] : []),
    ]
    const caption = { text: ` ${ICON.skills}  ${skillList.length} skills ${(await read($, showSkills)) ? '▾' : '▸'} `, press: 'skills' }
    const press: Record<string, () => void> = {
      tasks: () => void update($, tasksOpen, v => !v),
      skills: () => void update($, showSkills, v => !v),
    }

    const panel = draw(sections, W, f, caption).map((l, i) => {
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
    })

    return (
      <Box flexDirection="column">
        {below}
        {panel}
      </Box>
    )
  })
}
