import { expect, test } from 'claude-code/testing'
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
