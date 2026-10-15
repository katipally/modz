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

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
const usageWith = (apiUsage: unknown) => ({
  value: { startedAt: 0, context: { window: 200_000, breakdown: { apiUsage } }, rateLimits: [] } as never,
})

test('on resume, shows the time since the last response and its hit rate without a new request', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => usageWith({ model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 99_000, cache_creation_input_tokens: 0 }))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 20 * 60 } as never)
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'cache-timer' }))?.text).toMatch(/^cache +99% · (39|40)m$/)
  await ui.unmount()
})

test('on resume without token counts, the hit rate stays a placeholder and the countdown shows', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => usageWith(null))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 90 * 60 } as never)
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'cache-timer' }))?.text).toMatch(/^cache +– · (29|30)m ago$/)
  await ui.unmount()
})

test('a fresh start has nothing to show, and a rejecting usage call on resume still gives the countdown', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => { throw new Error('session not bound') })
  await $.classic.SessionStart({ source: 'startup' } as never)
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'cache-timer' }))?.text).toBe('cache – · –')
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 60 } as never)
  expect((await ui.find({ key: 'cache-timer' }))?.text).toMatch(/^cache +– · 59m$/)
  await ui.unmount()
})

test('/clear and a resume drop the old cache state without classic hooks', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => usageWith(null))
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 60 } as never)
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'cache-timer' }))?.text).toMatch(/· 59m$/)
  for (const reason of ['clear', 'resume'] as const) {
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 60 } as never)
    await $.session.end({ reason, sessionId: 's', resume: { id: 's' } } as never)
    expect((await ui.find({ key: 'cache-timer' }))?.text).toBe('cache – · –')
  }
  await ui.unmount()
})
