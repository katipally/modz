import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }

test('idles, works while a turn runs, and hops when it is done', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'buddy', surface, component: 'AbovePrompt', props: PROPS })
    expect((await ui.find({ key: 'buddy' }))?.text).toContain('▐▛███▜▌')
    await ui.unmount()
  }

  await $.turn.start({ text: 'hi', turnId: 't' } as never)
  let ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'buddy' }))?.text).toMatch(/[·]/)
  await ui.unmount()

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'buddy' }))?.text).toMatch(/▗▟█████▙▖|[✦✧⋆]/)
  await ui.unmount()

  // A subagent finishing does not make the bot hop.
  await $.turn.start({ text: 'hi', turnId: 't2' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'x', agentId: 'sub', reason: 'answer' } as never)
  ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'buddy' }))?.text).toMatch(/[·]/)
  await ui.unmount()
})
