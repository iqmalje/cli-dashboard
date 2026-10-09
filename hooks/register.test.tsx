import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 120 } as never

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
  on('ui.render', { component: 'AbovePrompt' }, ($t, e) => {
    const { Text } = $t.ui.resolve(e)
    return <Text>engine</Text>
  })
  return $.ui.mount({ plugin: 'cockpit', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
}

const drawn = async (ui: { drawn: () => Promise<RenderElement> }) => text(await ui.drawn())

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
