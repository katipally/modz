import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
const ENGINE = { plugin: 'engine', tier: 'core' } as const

test('lists models and efforts from Claude Code and switches them through /model and /effort', async ($, on) => {
  const ran: string[] = []
  let model = 'claude-opus-5-5'
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: model }))
  on('config.list', () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice' as const, value: 'opus', options: ['default', 'opus', 'sonnet', 'haiku'], provider: ENGINE, isLocked: false }],
  }))
  on('command.list', () => ({ value: [] }))
  on('command.describe', (_, e) => ({ description: e.description, argumentHint: e.argumentHint, isHidden: e.isHidden }))
  on('command.run', (_, e) => {
    ran.push(`/${e.command} ${e.args}`)
    if (e.command === 'model') model = `claude-${e.args}-4-6`
    return { text: '' }
  })
  on('turn.step', async function* () {
    return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
  await $.command.describe({ command: 'effort', description: 'Set effort', argumentHint: '[low|medium|high|max|auto|ultracode [on|off]]', isHidden: false, immediate: false, provider: ENGINE })
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 } as never)) void _
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-haiku-4-5', effort: 'low', messageCount: 1, agentId: 'sub' } as never)) void _

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'model-info', surface, component: 'AbovePrompt', props: PROPS })
    const effort = await ui.find({ key: 'effort' })
    expect((effort?.props.options as { value: string }[]).map(o => o.value)).toEqual(['low', 'medium', 'high', 'max', 'auto'])
    const picker = await ui.find({ key: 'model' })
    expect((picker?.props.options as { value: string }[]).map(o => o.value)).toEqual(['default', 'opus', 'sonnet', 'haiku'])
    expect(await ui.find({ key: 'modz-left' })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'model-info', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect((await ui.find({ key: 'effort' }))?.props.value).toBe('medium')
  expect((await ui.find({ key: 'model' }))?.props.value).toBe('opus')
  await ui.select({ key: 'effort', value: 'high' })
  expect((await ui.find({ key: 'effort' }))?.props.value).toBe('high')
  await ui.select({ key: 'model', value: 'sonnet' })
  expect((await ui.find({ key: 'model' }))?.props.value).toBe('sonnet')
  expect(ran).toEqual(['/effort high', '/model sonnet'])
  await ui.unmount()
})
