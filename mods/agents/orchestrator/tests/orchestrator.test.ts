import { describe, expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import type { AgentSpawnInput } from 'claude-code'

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

const spawn = (over: Partial<AgentSpawnInput> = {}): AgentSpawnInput => ({
  tool_use_id: 't1',
  prompt: 'do it',
  description: 'sub task',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  model: 'sonnet',
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
  ...over,
})

describe('orchestrator', () => {
  test('adds the brief to the user prompt only', async ($, on) => {
    const seen: (readonly string[] | undefined)[] = []
    on('prompt.submit', (_, e) => (seen.push(e.context), { text: e.text, context: e.context }))
    await $.prompt.submit({ text: 'build it', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'ping', wait: false, origin: { kind: 'plugin', name: 'x' } as never })
    expect(seen[0]?.join('\n')).toContain('You are the orchestrator')
    expect(seen[1]).toBeUndefined()
  })

  test('enforces models, nesting and the agent cap', async ($, on) => {
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a' }))
    on('prompt.submit', (_, e) => ({ text: e.text }))
    await $.command.run({ command: 'orch', args: 'max=1 models=sonnet', origin: { kind: 'composer' }, presentation: {} as never })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })

    expect((await $.agent.spawn(spawn({ model: 'opus' }))).deny).toContain('sonnet')
    expect((await $.agent.spawn(spawn({ parentAgentId: 'a' }))).deny).toContain('only the main agent')
    expect((await $.agent.spawn(spawn())).agentId).toBe('a')
    expect((await $.agent.spawn(spawn())).deny).toContain('limit of 1')
  })

  test('off passes everything through', async ($, on) => {
    on('agent.spawn', () => ({ model: 'opus', agentId: 'b' }))
    await $.command.run({ command: 'orch', args: 'off', origin: { kind: 'composer' }, presentation: {} as never })
    expect((await $.agent.spawn(spawn({ model: 'opus', parentAgentId: 'x' }))).agentId).toBe('b')
  })

  test('one button opens the menu; custom values are typed in', async ($, on) => {
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    for (const surface of ['terminal', 'desktop'] as const) {
      await $.command.run({ command: 'orch', args: 'on models=sonnet,haiku max=2 ctx=200', origin: { kind: 'composer' }, presentation: {} as never })
      const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: {} as never, view: {} as never }
      const ui = await $.ui.mount({ plugin: 'orchestrator', surface, component: 'AbovePrompt', props })
      expect(await shown(ui, surface, 'orch')).toMatch(/\bon\b/)
      expect(await ui.find({ key: 'max' })).toBeUndefined()
      await pick(ui, surface, 'orch', 'settings')
      expect(await shown(ui, surface, 'orch')).toMatch(/\bon\b/)
      await ui.press({ key: 'model-opus' })
      await ui.press({ key: 'model-haiku' })
      await pick(ui, surface, 'max', 'custom')
      await ui.input({ key: 'max-custom', text: '7' })
      await pick(ui, surface, 'ctx', 'custom')
      await ui.input({ key: 'ctx-custom', text: '300k' })
      expect((await ui.find({ key: 'model-opus' }))?.text).toContain('☑ Opus')
      expect((await ui.find({ key: 'model-haiku' }))?.text).toContain('☐ Haiku')
      expect(await shown(ui, surface, 'max')).toMatch(/^7/)
      expect(await shown(ui, surface, 'ctx')).toMatch(/^300/)
      await pick(ui, surface, 'orch', 'off')
      expect(await shown(ui, surface, 'orch')).toMatch(/\boff\b/)
      await pick(ui, surface, 'orch', 'on')
      await pick(ui, surface, 'orch', 'settings')
      expect(await ui.find({ key: 'ctx' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('spins while its subagents run', async ($, on) => {
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
    await $.command.run({ command: 'orch', args: 'on max=3 models=sonnet', origin: { kind: 'composer' }, presentation: {} as never })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await $.agent.spawn(spawn())
    const props = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
    let ui = await $.ui.mount({ plugin: 'orchestrator', surface: 'terminal', component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'orchestrator' }))?.text).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] 1 running/)
    await ui.unmount()
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId: 'a1', reason: 'answer' } as never)
    ui = await $.ui.mount({ plugin: 'orchestrator', surface: 'terminal', component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'orchestrator' }))?.text).not.toContain('running')
    await ui.unmount()
  })
})

