import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }

// Terminal dropdowns are a button that opens a row of option buttons; elsewhere they are a native Select.
type Ui = {
  press: (t: { key: string }) => Promise<unknown>
  select: (t: { key: string; value: string }) => Promise<unknown>
  find: (q: { key: string }) => Promise<{ text: string; props: Record<string, unknown> } | undefined>
}
const pick = async (ui: Ui, surface: string, key: string, value: string) => {
  if (surface !== 'terminal') return void (await ui.select({ key, value }))
  await ui.press({ key })
  await ui.press({ key: `${key}:${value}` })
}
// What a dropdown shows: the Select's value, or the terminal button's label.
const shown = async (ui: Ui, surface: string, key: string) => {
  const found = await ui.find({ key })
  return surface === 'terminal' ? found?.text ?? '' : String(found?.props.value ?? '')
}
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

  const desktop = await $.ui.mount({ plugin: 'model-info', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const effort = await desktop.find({ key: 'effort' })
  expect((effort?.props.options as { value: string }[]).map(o => o.value)).toEqual(['low', 'medium', 'high', 'max', 'auto'])
  const picker = await desktop.find({ key: 'model' })
  expect((picker?.props.options as { value: string }[]).map(o => o.value)).toEqual(['default', 'opus', 'sonnet', 'haiku'])
  expect(await desktop.find({ key: 'modz-right' })).toBeUndefined()
  await desktop.unmount()

  // The terminal's dropdown opens into clickable options, the current one left out.
  const term = await $.ui.mount({ plugin: 'model-info', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await shown(term, 'terminal', 'model')).toBe('Opus 5.5 ▾')
  await term.press({ key: 'effort' })
  for (const level of ['low', 'high', 'max', 'auto']) expect(await term.find({ key: `effort:${level}` })).toBeDefined()
  expect(await term.find({ key: 'effort:medium' })).toBeUndefined()
  await term.press({ key: 'effort' })
  await term.unmount()

  for (const [surface, effortTo, modelTo] of [['terminal', 'high', 'sonnet'], ['desktop', 'low', 'haiku']] as const) {
    const ui = await $.ui.mount({ plugin: 'model-info', surface, component: 'AbovePrompt', props: PROPS })
    await pick(ui, surface, 'effort', effortTo)
    expect(await shown(ui, surface, 'effort')).toMatch(new RegExp(`^${effortTo}`))
    await pick(ui, surface, 'model', modelTo)
    expect(await shown(ui, surface, 'model')).toMatch(new RegExp(`^(${modelTo}|${modelTo[0]!.toUpperCase()}${modelTo.slice(1)})`))
    await ui.unmount()
  }
  expect(ran).toEqual(['/effort high', '/model sonnet', '/effort low', '/model haiku'])
})
