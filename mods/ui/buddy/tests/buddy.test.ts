import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }

test('draws Clawd as an interactive Svg off the terminal, in any skin, and ignores subagents', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)

  const svg = async () => {
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
    const found = await ui.find({ type: 'Svg' })
    expect(await ui.find({ key: 'pet' })).toBeDefined()
    await ui.unmount()
    return found?.props ?? {}
  }

  const first = await svg()
  expect(first.isInteractive).toBe(true)
  expect(String(first.source)).toMatch(/^<svg [^>]*shape-rendering="crispEdges"><style>.*:hover.*:active.*<\/style><g>(<rect [^>]+\/>)+<\/g><\/svg>$/)
  expect(String(first.source)).toContain('fill="#d77757"')
  expect(String(first.source)).toContain('fill="#141414"')

  await $.turn.start({ text: 'hi', turnId: 't' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'x', agentId: 'sub', reason: 'answer' } as never)
  expect(String((await svg()).alt)).toBe('Clawd, working')

  await $.command.run({ command: 'buddy', args: 'skin mint', origin: { kind: 'composer' }, presentation: {} as never })
  expect(String((await svg()).source)).toContain('fill="#7fd1ae"')
})
