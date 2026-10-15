import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { FEET } from '../hooks/clawd-moves'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }

test('off the terminal Clawd is one fixed-size Svg that animates and reacts to clicks by itself', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  let reduced = false
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: { prefersReducedMotion: reduced } }) as never)
  on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)

  const svg = async () => {
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
    const found = await ui.find({ type: 'Svg' })
    expect(await ui.find({ key: 'pet' })).toBeUndefined()
    await ui.unmount()
    return found?.props ?? {}
  }

  const idle = await svg()
  expect([idle.width, idle.height]).toEqual([76, 48])
  expect(idle.isInteractive).toBe(true)
  const source = String(idle.source)
  expect(source.length).toBeLessThan(131072)
  expect(source).toContain('fill="#d77757"')
  expect(source).toContain('repeatCount="indefinite"')
  expect(source).toContain('begin="hit.click"')

  await $.turn.start({ text: 'hi', turnId: 't' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'x', agentId: 'sub', reason: 'answer' } as never)
  expect(String((await svg()).alt)).toBe('Clawd, working')

  await $.command.run({ command: 'buddy', args: 'skin mint', origin: { kind: 'composer' }, presentation: {} as never })
  expect(String((await svg()).source)).toContain('fill="#7fd1ae"')

  reduced = true
  const still = await svg()
  expect(still.isInteractive).toBe(false)
  expect(String(still.source)).not.toContain('<animate')
})

test('pacing moves every leg', () => {
  const legs = [...FEET.stand].flatMap((c, i) => (c === ' ' ? [] : [i]))
  expect(legs.length).toBe(4)
  for (const i of legs) expect(FEET.step[i]).not.toBe(FEET.stand[i])
})
