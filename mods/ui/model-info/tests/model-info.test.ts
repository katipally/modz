import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

test('shows model and effort of the main agent only', async ($, on) => {
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 } as never)) void _
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-haiku-4-5', effort: 'low', messageCount: 1, agentId: 'sub' } as never)) void _
  for (const surface of ['terminal', 'desktop'] as const) {
    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
    const ui = await $.ui.mount({ plugin: 'model-info', surface, component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'model-info' }))?.text).toBe('Opus 5.5 · medium')
    expect(await ui.find({ key: 'modz-left' })).toBeUndefined()
    expect(await ui.find({ key: 'modz-right' })).toBeDefined()
    await ui.unmount()
  }
})
