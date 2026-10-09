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
  return $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'PromptHint', props: PROPS })
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
  const ui = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 100, rows: 40 } as never })
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
  const ui = await $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'PromptHint', props: PROPS, viewport: { columns: 120, rows: 40 } as never })
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
