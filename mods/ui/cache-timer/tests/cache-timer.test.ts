import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

test('shows hit rate, a warm countdown, and sets the ttl by command', async ($, on) => {
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
    expect(row).toMatch(/^cache +99% [✦✧⋆] · (59m|1h 0m)$/)
    await $.command.run({ command: 'cache-ttl', args: '5m', origin: { kind: 'composer' }, presentation: {} as never })
    expect((await ui.find({ key: 'cache-timer' }))?.text).toMatch(/· [45]m$/)
    await $.command.run({ command: 'cache-ttl', args: '1h', origin: { kind: 'composer' }, presentation: {} as never })
    await ui.unmount()
  }
})

test('draws placeholders before the first request', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', component: 'AbovePrompt', props })
  expect((await ui.find({ key: 'cache-timer' }))?.text).toBe('cache – · –')
  await ui.unmount()
})
