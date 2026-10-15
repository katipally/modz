import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import type { AgentSpawnInput } from 'claude-code'

// Terminal pickers are a row of option buttons, the chosen one marked; elsewhere they are a native Select.
type Ui = {
  select: (t: { key: string; value: string }) => Promise<unknown>
  press: (t: { key: string }) => Promise<unknown>
  find: (q: { key: string }) => Promise<{ text: string; props: Record<string, unknown> } | undefined>
}
const pick = async (ui: Ui, surface: string, key: string, value: string) =>
  surface === 'terminal' ? ui.press({ key: `${key}:${value}` }) : ui.select({ key, value })
const chosen = async (ui: Ui, surface: string, key: string, value: string) =>
  surface === 'terminal' ? (await ui.find({ key: `${key}:${value}` }))?.text.startsWith('●') : (await ui.find({ key }))?.props.value === value

const orch = ($: { command: { run: (i: never) => Promise<unknown> } }, args: string) =>
  $.command.run({ command: 'orch', args, origin: { kind: 'composer' }, presentation: {} as never } as never)
const step = async ($: { turn: { step: (i: never) => AsyncIterable<unknown> } }, agentId: string) => {
  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId } as never)) void _
}
const send = ($: { session: { send: (i: never) => Promise<{ isDelivered: boolean; reason?: string }> } }, to: string) =>
  $.session.send({ to, text: 'msg', origin: { kind: 'model' } } as never)
const usage = (n: number) => ({
  turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const,
  usage: { model: 'claude-sonnet-5-5', input_tokens: n, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})
const done = (agentId: string) => ({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId, reason: 'answer' }) as never
const bandProps = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: {} as never, view: {} as never }

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

  test('enforces models, nesting and how many run at once', async ($, on) => {
    let n = 0
    on('agent.spawn', () => ({ model: 'sonnet', agentId: `a${++n}` }))
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
    await $.command.run({ command: 'orch', args: 'max=2 models=sonnet', origin: { kind: 'composer' }, presentation: {} as never })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })

    expect((await $.agent.spawn(spawn({ model: 'opus' }))).deny).toContain('sonnet')
    expect((await $.agent.spawn(spawn({ parentAgentId: 'a' }))).deny).toContain('only the main agent')
    const parallel = await Promise.all([1, 2, 3].map(() => $.agent.spawn(spawn())))
    expect(parallel.filter(r => r.agentId).length).toBe(2)
    expect(parallel.find(r => r.deny)?.deny).toContain('2 subagents are already running')

    // One finishing frees a slot, even within the same request.
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId: 'a1', reason: 'answer' } as never)
    expect((await $.agent.spawn(spawn())).agentId).toBe('a3')
    expect((await $.agent.spawn(spawn())).deny).toContain('already running')
  })

  test('off passes everything through', async ($, on) => {
    on('agent.spawn', () => ({ model: 'opus', agentId: 'b' }))
    await $.command.run({ command: 'orch', args: 'off', origin: { kind: 'composer' }, presentation: {} as never })
    expect((await $.agent.spawn(spawn({ model: 'opus', parentAgentId: 'x' }))).agentId).toBe('b')
  })

  test('settings open from their own button; picks are one click; custom values are typed in', async ($, on) => {
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    for (const surface of ['terminal', 'desktop'] as const) {
      await $.command.run({ command: 'orch', args: 'on models=sonnet,haiku max=2 ctx=200', origin: { kind: 'composer' }, presentation: {} as never })
      const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: {} as never, view: {} as never }
      const ui = await $.ui.mount({ plugin: 'orchestrator', surface, component: 'AbovePrompt', props })
      expect((await ui.find({ key: 'orch' }))?.text).toContain('● Orchestrator ON')
      expect(await ui.find({ key: 'model-opus' })).toBeUndefined()
      await ui.press({ key: 'settings' })
      expect(await chosen(ui, surface, 'max', '2')).toBe(true)
      expect(await chosen(ui, surface, 'max', '1')).toBe(false)
      await pick(ui, surface, 'max', '4')
      expect(await chosen(ui, surface, 'max', '4')).toBe(true)
      await ui.press({ key: 'model-opus' })
      await ui.press({ key: 'model-haiku' })
      await pick(ui, surface, 'max', 'custom')
      await ui.press({ key: 'max-cancel' })
      expect(await chosen(ui, surface, 'max', '4')).toBe(true)
      await pick(ui, surface, 'max', 'custom')
      await ui.input({ key: 'max-custom', text: '7' })
      await pick(ui, surface, 'ctx', 'custom')
      await ui.input({ key: 'ctx-custom', text: '300k' })
      expect((await ui.find({ key: 'model-opus' }))?.text).toContain('☑ Opus')
      expect((await ui.find({ key: 'model-haiku' }))?.text).toContain('☐ Haiku')
      expect(await chosen(ui, surface, 'max', '7')).toBe(true)
      expect(await chosen(ui, surface, 'ctx', '300')).toBe(true)
      await ui.press({ key: 'orch' })
      expect((await ui.find({ key: 'orch' }))?.text).toContain('○ Orchestrator OFF')
      expect(await ui.find({ key: 'model-opus' })).toBeDefined()
      await ui.press({ key: 'orch' })
      await ui.press({ key: 'settings' })
      expect(await ui.find({ key: 'model-opus' })).toBeUndefined()
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
    expect((await ui.find({ key: 'orchestrator' }))?.text).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] 1\/3 running/)
    await ui.unmount()
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId: 'a1', reason: 'answer' } as never)
    ui = await $.ui.mount({ plugin: 'orchestrator', surface: 'terminal', component: 'AbovePrompt', props })
    expect((await ui.find({ key: 'orchestrator' }))?.text).not.toContain('running')
    await ui.unmount()
  })

  test('main delegates reads and writes; subagents and delegate=off are unaffected', async ($, on) => {
    on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
    const call = (tool: string, agentId?: string) => $.tool.call({ tool, file_path: '/x', command: 'ls', pattern: 'p', ...(agentId ? { agentId } : {}) } as never) as Promise<{ deny?: string }>
    for (const tool of ['Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep', 'Bash']) expect((await call(tool)).deny).toContain('delegate')
    expect((await call('Read', 'a1')).deny).toBeUndefined()
    expect((await call('WebSearch')).deny).toBeUndefined()
    await orch($, 'delegate=off')
    expect((await call('Read')).deny).toBeUndefined()
    await orch($, 'delegate=on off')
    expect((await call('Read')).deny).toBeUndefined()
  })

  test('a subagent at its context limit loses its tools and cannot be messaged', async ($, on) => {
    mock.clock(on)
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
    on('agent.list', () => ({ value: [{ id: 'a1', name: 'worker', description: '', type: 'general-purpose', status: 'running' }] }) as never)
    on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
    on('session.send', () => ({ isDelivered: true }))
    let tokens = 150_000
    on('turn.step', async function* () { return usage(tokens) })
    await orch($, 'ctx=200 delegate=off max=2 models=sonnet')
    await $.agent.spawn(spawn())
    const read = () => $.tool.call({ tool: 'Read', file_path: '/x', agentId: 'a1' } as never) as Promise<{ deny?: string }>
    await step($, 'a1')
    expect((await read()).deny).toBeUndefined()
    tokens = 200_000
    await step($, 'a1')
    expect((await read()).deny).toContain('context limit of 200k')
    for (const to of ['a1', 'worker']) {
      const sent = await send($, to)
      expect(sent).toMatchObject({ isDelivered: false })
      expect(sent.reason).toContain('fresh subagent')
    }
    expect((await send($, 'other')).isDelivered).toBe(true)
  })

  test('resuming a finished subagent counts against how many run at once', async ($, on) => {
    mock.clock(on)
    let n = 0
    on('agent.spawn', () => ({ model: 'sonnet', agentId: `a${++n}` }))
    on('agent.list', () => ({ value: [1, 2].map(i => ({ id: `a${i}`, name: `w${i}`, description: '', type: 'general-purpose', status: 'running' })) }) as never)
    on('session.send', () => ({ isDelivered: true }))
    on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
    await orch($, 'max=1 models=sonnet')
    await $.agent.spawn(spawn())
    await $.turn.complete(done('a1'))
    await $.agent.spawn(spawn())
    expect((await send($, 'w1')).reason).toContain('already running')
    await $.turn.complete(done('a2'))
    expect((await send($, 'w1')).isDelivered).toBe(true)
    expect((await $.agent.spawn(spawn())).deny).toContain('already running')
    expect((await send($, 'a1')).isDelivered).toBe(true)
    await $.turn.complete(done('a1'))
    expect((await $.agent.spawn(spawn())).agentId).toBe('a3')
  })

  test('the switch is green ON or grey OFF, and one press flips it', async ($, on) => {
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    await orch($, 'on')
    const ui = await $.ui.mount({ plugin: 'orchestrator', surface: 'terminal', component: 'AbovePrompt', props: bandProps })
    expect((await ui.find({ key: 'orch' }))?.text).toBe('● Orchestrator ON')
    expect(await ui.find({ type: 'Text', text: 'ON' })).toMatchObject({ props: { color: 'success', bold: true } })
    await ui.press({ key: 'orch' })
    expect((await ui.find({ key: 'orch' }))?.text).toBe('○ Orchestrator OFF')
    expect(await ui.find({ type: 'Text', text: 'OFF' })).toMatchObject({ props: { color: 'inactive' } })
    await ui.unmount()
  })

  test('save marks the settings as the default; a change offers save and reset', async ($, on) => {
    mock.store(on)
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    await orch($, 'on models=sonnet,haiku max=2 ctx=200 delegate=on')
    const ui = await $.ui.mount({ plugin: 'orchestrator', surface: 'terminal', component: 'AbovePrompt', props: bandProps })
    await ui.press({ key: 'settings' })
    expect(await ui.find({ key: 'save' })).toBeUndefined()
    await ui.press({ key: 'max:4' })
    await ui.press({ key: 'save' })
    expect(await ui.find({ key: 'save' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '✓ Default' })).toBeDefined()
    await ui.press({ key: 'delegate' })
    expect((await ui.find({ key: 'delegate' }))?.text).toContain('☐ Delegates reads & writes')
    expect(await ui.find({ key: 'save' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ Default' })).toBeUndefined()
    await ui.press({ key: 'reset' })
    expect((await ui.find({ key: 'delegate' }))?.text).toContain('☑ Delegates reads & writes')
    expect((await ui.find({ key: 'max:4' }))?.text.startsWith('●')).toBe(true)
    expect(await ui.find({ type: 'Text', text: '✓ Default' })).toBeDefined()
    await ui.unmount()
  })

  test('closing settings or turning off drops an open custom input', async ($, on) => {
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    await orch($, 'on')
    const ui = await $.ui.mount({ plugin: 'orchestrator', surface: 'terminal', component: 'AbovePrompt', props: bandProps })
    await ui.press({ key: 'settings' })
    await ui.press({ key: 'max:custom' })
    expect(await ui.find({ key: 'max-custom' })).toBeDefined()
    await ui.press({ key: 'settings' })
    await ui.press({ key: 'settings' })
    expect(await ui.find({ key: 'max-custom' })).toBeUndefined()
    await ui.press({ key: 'ctx:custom' })
    await ui.press({ key: 'orch' })
    await ui.press({ key: 'orch' })
    expect(await ui.find({ key: 'ctx-custom' })).toBeUndefined()
    await ui.unmount()
  })
})
