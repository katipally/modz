import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

test('shows hit rate, a warm countdown, and toggles the ttl', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('turn.step', async function* () {
    return {
      turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const,
      usage: { model: 'claude-opus-5-5', input_tokens: 2000, output_tokens: 10, cache_read_input_tokens: 406_000, cache_creation_input_tokens: 2000 },
    }
  })
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 } as never)) void _
  for (const surface of ['terminal', 'desktop'] as const) {
    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
    const ui = await $.ui.mount({ plugin: 'cache-timer', surface, component: 'AbovePrompt', props })
    const row = (await ui.find({ key: 'cache-timer' }))?.text ?? ''
    expect(row).toContain('99% hit')
    expect(row).toContain('406k read / 4k new')
    expect(row).toMatch(/● warm (59m|1h 0m)/)
    const before = (await ui.find({ key: 'ttl' }))?.text
    await ui.press({ key: 'ttl' })
    expect((await ui.find({ key: 'ttl' }))?.text).not.toBe(before)
    await ui.press({ key: 'ttl' })
    await ui.unmount()
  }
})
