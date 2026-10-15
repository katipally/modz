import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

test('draws the context bar and both limits with time left', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  const resetsAt = new Date(Date.now() + 27 * 60_000).toISOString()
  await $.session.measure({
    context: { window: 200_000, percent: 41 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt },
      { kind: 'seven_day', percentUsed: 6 },
      { kind: 'spend_limit', percentUsed: 90 },
    ],
    changed: ['context', 'rateLimits'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props })
    const row = (await ui.find({ key: 'usage-limits' }))?.text ?? ''
    expect(row).toContain('41%')
    expect(row).toMatch(/5h 42% · 2[67]m(?! left)/)
    expect(row).toContain('7d 6%')
    expect((await ui.find({ type: 'Text', text: /^42%$/ }))?.props.color).toBe('success')
    expect((await ui.find({ type: 'Text', text: /^90%$/ }))?.props.color).toBe('error')
    await ui.unmount()
  }
})

test('joins the shared row other mods drew, first in order', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return h(Box, { key: 'modz-band' }, h(Box, { key: 'orchestrator' }, h(Text, {}, 'ORCH'))) as RenderElement
  })
  await $.session.measure({ context: { window: 200_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  for (const surface of ['terminal', 'desktop'] as const) {
    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props })
    const bands = await ui.findAll({ key: 'modz-band' })
    expect(bands.length).toBe(1)
    expect(bands[0]!.text).toMatch(/ctx.*10%.*ORCH/)
    await ui.unmount()
  }
})

test('draws placeholders before any usage arrives', async ($, on) => {
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  for (const bodyColumns of [100, 10]) {
    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns, scroll: {} as never, view: {} as never }
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props })
    const row = (await ui.find({ key: 'usage-limits' }))?.text ?? ''
    expect(row).toMatch(/ctx +░+ –/)
    expect(row).toContain('5h –')
    expect(row).toContain('7d –')
    expect(row).not.toMatch(/NaN|undefined/)
    await ui.unmount()
  }
})

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
const START = { cwd: '/', surface: 'terminal', isInteractive: true } as never
const usageOf = (percent?: number) => ({
  startedAt: 0,
  context: { window: 200_000, percent },
  rateLimits: [{ kind: 'five_hour', percentUsed: 42 }, { kind: 'seven_day', percentUsed: 6 }],
})

test('shows the numbers at session start, before any model turn', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: usageOf(33) }))
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const row = (await ui.find({ key: 'usage-limits' }))?.text ?? ''
  expect(row).toContain('33%')
  expect(row).toContain('5h 42%')
  expect(row).toContain('7d 6%')
  await ui.unmount()
})

test('refreshes on resume and clears the bar on /clear', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('classic.SessionStart', () => ({}))
  let usage = usageOf(60)
  on('session.usage', () => ({ value: usage }))
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  await $.classic.SessionStart({ source: 'resume' })
  expect((await ui.find({ key: 'usage-limits' }))?.text).toContain('60%')
  usage = { ...usageOf(), rateLimits: [] }
  await $.classic.SessionStart({ source: 'clear' })
  expect((await ui.find({ key: 'usage-limits' }))?.text).toMatch(/ctx +░+ –5h –7d –/)
  await ui.unmount()
})

test('keeps the placeholders when usage rejects at start, then fills in on the next tick', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let calls = 0
  on('session.usage', () => {
    if (calls++ === 0) throw new Error('session not bound')
    return { value: usageOf(21) }
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'usage-limits' }))?.text).toMatch(/ctx +░+ –5h –7d –/)
  await clock.advance(30_000)
  expect((await ui.find({ key: 'usage-limits' }))?.text).toContain('21%')
  await ui.unmount()
})

const END = (reason: 'clear' | 'resume') => ({ reason, sessionId: 's', resume: { id: 's' } }) as never

test('/clear resets the tile without classic hooks, and a failed reload is retried on the tick', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  let usage: ReturnType<typeof usageOf> | undefined = usageOf(60)
  let failures = 0
  on('session.usage', () => {
    if (failures-- > 0) throw new Error('session not bound')
    return { value: usage! }
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'usage-limits' }))?.text).toContain('60%')
  failures = 1
  usage = usageOf(5)
  await $.session.end(END('clear'))
  expect((await ui.find({ key: 'usage-limits' }))?.text).toMatch(/ctx +░+ –5h –7d –/)
  await clock.advance(30_000)
  expect((await ui.find({ key: 'usage-limits' }))?.text).toMatch(/ctx +░+ –5h –7d –/)
  await clock.advance(30_000)
  expect((await ui.find({ key: 'usage-limits' }))?.text).toContain('5%')
  await ui.unmount()
})

const rowOf = async (ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }) => (await ui.find({ key: 'usage-limits' }))?.text ?? ''
const noLimits = { startedAt: 0, context: { window: 200_000 }, rateLimits: [] }

test('a fresh session shows 0% context and the limits the last session saw, marked stale', async ($, on) => {
  mock.clock(on)
  const resetsAt = new Date(Date.now() + 90 * 60_000).toISOString()
  mock.store(on, { limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt }, { kind: 'seven_day', percentUsed: 6 }] })
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: noLimits }))
  on('session.turns', () => ({ value: 0 }))
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  const row = await rowOf(ui)
  expect(row).toMatch(/ctx +░+ 0%/)
  expect(row).toMatch(/5h ~42% · 1h 29m|5h ~42% · 1h 30m/)
  expect(row).toContain('7d ~6%')
  await ui.unmount()
})

test('a stored window that has reset shows its placeholder', async ($, on) => {
  mock.clock(on)
  mock.store(on, { limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: new Date(Date.now() - 60_000).toISOString() }, { kind: 'seven_day', percentUsed: 6 }] })
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: noLimits }))
  on('session.turns', () => ({ value: 0 }))
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await rowOf(ui)).toMatch(/5h –.*7d ~6%/)
  await ui.unmount()
})

test('live limits replace stale ones and are saved for the next session', async ($, on) => {
  mock.clock(on)
  mock.store(on, { limits: [{ kind: 'five_hour', percentUsed: 10 }] })
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: noLimits }))
  on('session.turns', () => ({ value: 0 }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start(START)
  await $.session.measure({ context: { window: 200_000, percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 55 }], changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await rowOf(ui)).toContain('5h 55%')
  await $.session.end(END('clear'))
  expect(await rowOf(ui)).toContain('5h ~55%')
  await ui.unmount()
})

test('a resumed session seeds context from the last response before its first request', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('classic.SessionStart', () => ({}))
  on('session.usage', () => ({ value: noLimits }))
  on('session.turns', () => ({ value: 12 }))
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  await $.classic.SessionStart({ source: 'resume', context_tokens: 80_000 } as never)
  expect(await rowOf(ui)).toContain('40%')
  await ui.unmount()
})

test('with no turns, no window and nothing stored, everything stays a placeholder', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 0 }, rateLimits: [] } }))
  on('session.turns', () => ({ value: 0 }))
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'usage-limits', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await rowOf(ui)).toMatch(/ctx +░+ –5h –7d –/)
  await ui.unmount()
})
