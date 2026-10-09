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
    ],
    changed: ['context', 'rateLimits'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
    const ui = await $.ui.mount({ plugin: 'usage-limits', surface, component: 'AbovePrompt', props })
    const row = (await ui.find({ key: 'usage-limits' }))?.text ?? ''
    expect(row).toContain('41%')
    expect(row).toMatch(/5h 42% \(2[67]m left\)/)
    expect(row).toContain('7d 6%')
    await ui.unmount()
  }
})
