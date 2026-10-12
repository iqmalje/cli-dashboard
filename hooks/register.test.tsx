import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

// The Panel sits under the prompt, in the hint line's place (the user's choice over the band above it).
const PROPS = { isDraft: false, isWorking: false, hint: '? for shortcuts' } as never

const text = (node: unknown): string =>
  typeof node === 'string'
    ? node
    : Array.isArray(node)
      ? node.map(text).join('')
      : node && typeof node === 'object' && 'children' in node
        ? text((node as { children: unknown }).children)
        : ''

const setup = async ($: Engine, on: On) => {
  mock.clock(on)
  on('tool.call', { tool: 'TaskCreate' }, (_, e) => ({ result: { task: { id: '1', subject: e.subject } } }))
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  return $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS })
}

const drawn = async (ui: { drawn: () => Promise<RenderElement> }) => text(await ui.drawn())
// the agents rows draw inside their own Client
const drawnAgents = async (ui: { drawn: (scope?: { in: string }) => Promise<RenderElement> }) => text(await ui.drawn({ in: 'agents' }))

// The Panel must draw with no session data yet: a fresh session has none until the first measure.
test('the Panel draws the frame and the Dumb Meter before any data', async ($, on) => {
  const ui = await setup($, on)
  const out = await drawn(ui)
  expect(out).toContain('engine')
  expect(out).toContain('╭')
  expect(out).toContain('Smart')
})

test('a created task adds the tasks section', async ($, on) => {
  const ui = await setup($, on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write plan', description: 'd' } as never)
  expect(await drawn(ui)).toContain('0/1')
})

// SubagentStop is not raised for every agent (workflow agents, stopped agents): the subagent's own
// turn.complete must finish its row, or it spins until the session ends.
test('a subagent turn completing marks its Agent Row done', async ($, on) => {
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const ui = await setup($, on)
  await $.agent.spawn({ tool_use_id: 't1', description: 'look around', subagentType: 'Explore' } as never)
  expect(await drawnAgents(ui)).toContain('agents 1')
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false, turnId: 'u1' } as never)
  expect(await drawnAgents(ui)).toContain('agents 0')
})

// The hint line under the prompt is 4 columns narrower than the terminal (the footer's padding):
// a Panel drawn at full width is cut there, losing its right border and last cell.
test('the Panel is drawn 4 columns narrower than the terminal', async ($, on) => {
  mock.clock(on)
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 100, rows: 40 } as never })
  const out = await drawn(ui)
  const top = out.slice(out.indexOf('╭'), out.indexOf('╮') + 1)
  expect([...top].length).toBe(96)
})

// Five agent rows show; the rest are reached by ↓ once a click focuses the agents rows.
test('down arrow on the agents rows scrolls the 5-row window', async ($, on) => {
  on('agent.spawn', (_, e) => ({ model: 'haiku', agentId: e.tool_use_id }))
  mock.clock(on)
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 120, rows: 40 } as never })
  for (let i = 0; i < 7; i++) await $.agent.spawn({ tool_use_id: `t${i}`, description: `job ${i}`, subagentType: 'Explore', name: `A${i}` } as never)
  const before = await drawnAgents(ui)
  expect(before).toContain('A4')
  expect(before).not.toContain('A5')
  await ui.key({ key: 'down', in: 'agents' })
  const after = await drawnAgents(ui)
  expect(after).toContain('A5')
  expect(after).not.toContain('A0')
  expect(after).toContain('↑ 1')
})

// Background subagents raise no classic PostToolUse; each model request's turn.step carries the
// agent's resolved effort (set or default), so that is where its row learns it.
test("a subagent's turn.step puts its effort on its Agent Row", async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  const ui = await setup($, on)
  await $.agent.spawn({ tool_use_id: 't1', description: 'look around', subagentType: 'Explore' } as never)
  const step = $.turn.step({ turnId: 'u1', index: 0, model: 'claude-sonnet-5-5', effort: 'medium', messageCount: 1, agentId: 'a1' } as never)
  for await (const _ of step);
  expect(await drawnAgents(ui)).toContain('sonnet 5.5 · medium')
})

// classic.PostToolUse and classic.Stop never reach the module; the main loop's own turn.step carries its effort.
test("the main loop's turn.step sets the top row's effort", async ($, on) => {
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  mock.clock(on)
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 160, rows: 40 } as never })
  const step = $.turn.step({ turnId: 'u1', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1 } as never)
  for await (const _ of step);
  expect(await drawn(ui)).toContain('· xhigh')
})

// classic.PostModelSwitch, CwdChanged and SessionStart never reach the module (Claude Code 2.1.295):
// the main loop's turn.step and turn.complete stand in for them.
const wide = async ($: Engine, on: On) => {
  mock.clock(on)
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  return $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 160, rows: 40 } as never })
}
const mainStep = async ($: Engine, model = 'claude-opus-5-5') => {
  for await (const _ of $.turn.step({ turnId: 'u1', index: 0, model, messageCount: 1 } as never));
}

test("a model switch shows on the main loop's next turn.step", async ($, on) => {
  const ui = await wide($, on)
  await mainStep($, 'claude-sonnet-5-5')
  expect(await drawn(ui)).toContain('sonnet 5.5')
})

test('a cwd change shows once the main turn completes', async ($, on) => {
  let dir = '/work/one'
  on('session.cwd', () => ({ value: dir }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const ui = await wide($, on)
  dir = '/work/two'
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 'u1' } as never)
  expect(await drawn(ui)).toContain('/work/two')
})

// A new session id (startup, /clear, resume) seeds tasks from TaskList and drops the old session's agents.
test('a new session id seeds tasks and clears the old agents', async ($, on) => {
  let id = 's1'
  on('session.id', () => ({ value: id }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: [{ id: '1', subject: 'Seeded task', status: 'pending' }] } }) as never)
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  const ui = await wide($, on)
  await mainStep($)
  expect(await drawn(ui)).toContain('0/1')
  await $.agent.spawn({ tool_use_id: 't1', description: 'look', subagentType: 'Explore' } as never)
  expect(await drawnAgents(ui)).toContain('agents 1')
  id = 's2'
  await mainStep($)
  expect(await drawn(ui)).not.toContain('agents')
})

// An in-process /resume raises no session.start and no turn until the next prompt: the 2s poll notices the
// new session id and refreshes the panel by itself.
test('a resumed session is picked up by the poll without a prompt', async ($, on) => {
  let id = 's1'
  let list = [{ id: '1', subject: 'First session task', status: 'pending' }]
  on('session.id', () => ({ value: id }))
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: list } }) as never)
  const clock = mock.clock(on)
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 160, rows: 40 } as never })
  await $.session.start({ cwd: '/work' } as never)
  expect(await drawn(ui)).toContain('0/1')
  id = 's2'
  list = [{ id: '1', subject: 'A', status: 'completed' }, { id: '2', subject: 'B', status: 'pending' }]
  await clock.advance(2000)
  expect(await drawn(ui)).toContain('1/2')
})

// 300K of a 1M window: against the default 800K soft limit that is Coasting (37.5%); a user who set their
// soft limit to 400K through `claude plugin configure` sees Cooked (75%).
const measured = async ($: Engine, on: On) => {
  on('session.measure', () => ({ changed: [] }))
  const ui = await wide($, on)
  await $.session.measure({ context: { tokens: 300_000, window: 1_000_000 }, rateLimits: [] } as never)
  return drawn(ui)
}

test('the meter uses the default soft limit when the option is unset', async ($, on) => {
  expect(await measured($, on)).toContain('Coasting')
})

test('the softLimit option sets the meter', { options: { softLimit: 400_000 } }, async ($, on) => {
  expect(await measured($, on)).toContain('Cooked')
})

// ---- /cli-dashboard-setup: a focused pane with one question and a live preview ----

// the ring landing on a choice, as ↑/↓ do: the engine's ui.focus shape (the kit passes the argument on as the event)
const focus = async ($: Engine, wizard: { redraw: () => Promise<void> }, element: string) => {
  await $.ui.focus({ component: 'Pane', requestId: 'setup', element, origin: { kind: 'person' } } as never)
  await wizard.redraw()
}

const pane = async ($: Engine, on: On, runs: { argv: readonly string[]; stdin?: string }[] = [], store: Record<string, unknown> = {}) => {
  mock.clock(on)
  mock.store(on, store)
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.focus', () => ({}) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('settings.read', () => ({ value: { enabledPlugins: { 'cli-dashboard@mine': true } } }) as never)
  on('ui.render', { component: 'PromptHint' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  const panel = await $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 160, rows: 40 } as never })
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'cli-dashboard-setup' } as never)
  const wizard = await $.ui.mount({ plugin: 'cli-dashboard', surface: 'terminal', component: 'Pane', requestId: 'setup', props: { bodyColumns: 120, isFocused: true, title: 'setup' } as never, viewport: { columns: 160, rows: 40 } as never })
  return { panel, wizard }
}

type Ran = { argv: readonly string[]; stdin?: string }[]
const saved = (runs: Ran) => runs.filter(r => r.stdin)

test('the command opens the setup pane on the first question', async ($, on) => {
  const { wizard } = await pane($, on)
  const out = await drawn(wizard)
  expect(out).toContain('Theme 1/4')
  expect(out).toContain("Colours for the panel's icons, values and border.")
  expect(out).toContain('▸ pastel  soft · recommended')
  expect(out).toContain('  high-contrast  brightest on dark backgrounds')
  expect(out).toContain('↑/↓ choose · enter pick · esc cancel')
})

test('every question draws its title and description', async ($, on) => {
  const { wizard } = await pane($, on)
  const steps = [
    ['opt-theme-pastel', 'Icons 2/4', 'Nerd Font glyphs, or plain symbols if you see boxes.'],
    ['opt-icons-nerd', 'Animation 3/4', 'What moves on the panel.'],
    ['opt-animation-full', 'Colour animation speed 4/4', 'How fast the meter gradient and agent colours shift. The spinner keeps its pace.'],
  ] as const
  for (const [key, title, about] of steps) {
    await wizard.press({ key })
    const out = await drawn(wizard)
    expect(out).toContain(title)
    expect(out).toContain(about)
  }
})

test('focusing a choice changes the preview', async ($, on) => {
  const { wizard } = await pane($, on)
  const before = JSON.stringify(await wizard.drawn())
  await focus($, wizard, 'opt-theme-rainbow')
  expect(await drawn(wizard)).toContain('▸ rainbow')
  expect(JSON.stringify(await wizard.drawn())).not.toBe(before)
})

test('pressing a choice picks it and advances', async ($, on) => {
  const { wizard } = await pane($, on)
  await wizard.press({ key: 'opt-theme-mono' })
  const out = await drawn(wizard)
  expect(out).toContain('Icons 2/4')
  expect(out).toContain('▸ nerd')
})

test('pressing a choice on the last step saves the picks and the Panel then draws with them', async ($, on) => {
  const runs: Ran = []
  const { panel, wizard } = await pane($, on, runs)
  await wizard.press({ key: 'opt-theme-rainbow' })
  await wizard.press({ key: 'opt-icons-plain' })
  await wizard.press({ key: 'opt-animation-full' })
  await wizard.press({ key: 'opt-speed-2x' })
  expect(saved(runs)).toHaveLength(1)
  expect(saved(runs)[0]!.argv).toEqual(['claude', 'plugin', 'configure', 'cli-dashboard@mine', '--values-stdin'])
  expect(JSON.parse(saved(runs)[0]!.stdin!)).toEqual({ theme: 'rainbow', icons: 'plain', animation: 'full', speed: '2x' })
  expect(await drawn(panel)).toContain('✱')
})

test('animation off makes the total 3 and skips speed', async ($, on) => {
  const runs: Ran = []
  const { wizard } = await pane($, on, runs)
  await wizard.press({ key: 'opt-theme-pastel' })
  await wizard.press({ key: 'opt-icons-nerd' })
  await focus($, wizard, 'opt-animation-off')
  expect(await drawn(wizard)).toContain('Animation 3/3')
  await wizard.press({ key: 'opt-animation-off' })
  expect(JSON.parse(saved(runs)[0]!.stdin!)).toEqual({ theme: 'pastel', icons: 'nerd', animation: 'off', speed: '1x' })
})

test('a session.start reload drops the picks saved this session', async ($, on) => {
  const { panel, wizard } = await pane($, on)
  await wizard.press({ key: 'opt-theme-pastel' })
  await wizard.press({ key: 'opt-icons-plain' })
  await wizard.press({ key: 'opt-animation-full' })
  await wizard.press({ key: 'opt-speed-1x' })
  expect(await drawn(panel)).toContain('✱')
  await $.session.start({ cwd: '/work' } as never)
  expect(await drawn(panel)).not.toContain('✱')
})

// The kit cannot raise a person's Esc (ui.close with origin person); the cancel Button runs the same closeWizard
test('cancel saves nothing, leaves the Panel as it was and clears the hint', async ($, on) => {
  const runs: Ran = []
  const { panel, wizard } = await pane($, on, runs)
  await wizard.press({ key: 'opt-theme-pastel' })
  await focus($, wizard, 'opt-icons-plain') // in the draft only
  await wizard.press({ key: 'cancel' })
  expect(saved(runs)).toHaveLength(0)
  const out = await drawn(panel)
  expect(out).not.toContain('✱')
  expect(out).not.toContain('/cli-dashboard-setup')
})

test('the setup hint shows until the wizard is finished', async ($, on) => {
  const { panel, wizard } = await pane($, on)
  expect(await drawn(panel)).toContain('/cli-dashboard-setup')
  for (const k of ['opt-theme-pastel', 'opt-icons-nerd', 'opt-animation-full', 'opt-speed-1x']) await wizard.press({ key: k })
  expect(await drawn(panel)).not.toContain('/cli-dashboard-setup')
})

test('the hint stays hidden once the store says it was seen', async ($, on) => {
  const { panel } = await pane($, on, [], { setupSeen: true })
  expect(await drawn(panel)).not.toContain('/cli-dashboard-setup')
})
