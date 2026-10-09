import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }

test('picks the model and effort through /model and /effort, main agent only', async ($, on) => {
  const ran: string[] = []
  let model = 'claude-opus-5-5'
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.model', () => ({ value: model }))
  on('command.run', (_, e) => {
    ran.push(`/${e.command} ${e.args}`)
    if (e.command === 'model') model = `claude-${e.args}-4-6`
    return { text: '' }
  })
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 } as never)) void _
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-haiku-4-5', effort: 'low', messageCount: 1, agentId: 'sub' } as never)) void _

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'model-info', surface, component: 'AbovePrompt', props: PROPS })
    expect(['medium', 'high']).toContain((await ui.find({ key: 'effort' }))?.props.value)
    expect(await ui.find({ key: 'modz-left' })).toBeUndefined()
    await ui.select({ key: 'effort', value: 'high' })
    expect((await ui.find({ key: 'effort' }))?.props.value).toBe('high')
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'model-info', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'model' }))?.props.value).toBe('opus')
  await ui.select({ key: 'model', value: 'sonnet' })
  expect((await ui.find({ key: 'model' }))?.props.value).toBe('sonnet')
  expect(ran).toContain('/effort high')
  expect(ran).toContain('/model sonnet')
  await ui.unmount()
})
