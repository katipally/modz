import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, RenderChildren, RenderElement, RenderNode } from 'claude-code'

import type { Config, Field, Model } from '../types'

const MODELS: Model[] = ['opus', 'sonnet', 'haiku']
const FALLBACK: Config = { isOn: true, models: ['sonnet', 'haiku'], maxAgents: 2, contextK: 200 }
const AGENT_PRESETS = [1, 2]
const CONTEXT_PRESETS = [200, 400]
const CUSTOM = 'custom'
const SETTINGS = 'settings'
const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const CONFIG_REF = { plugin: 'orchestrator', key: 'config' } as const
const config = atom(CONFIG_REF, FALLBACK)
const spawned = atom({ plugin: 'orchestrator', key: 'spawned' } as const, 0)
const editing = atom({ plugin: 'orchestrator', key: 'editing' } as const, null)
const isOpen = atom({ plugin: 'orchestrator', key: 'isOpen' } as const, false)

const contextLabel = (k: number) => (k >= 1000 ? `${k / 1000}M` : `${k}k`)
const title = (m: Model) => m[0]!.toUpperCase() + m.slice(1)

const summary = (c: Config) =>
  `${c.isOn ? 'ON' : 'OFF'} | models: ${c.models.join(', ')} | max agents: ${c.maxAgents} | context: ${contextLabel(c.contextK)}`

const brief = (c: Config) =>
  [
    'Orchestrator mode (chosen by the user for this request):',
    '- You are the orchestrator. Break the work down, delegate it to subagents with the Agent tool, then verify and merge their results.',
    `- Allowed subagent models: ${c.models.join(', ')}. Always set \`model\` on every Agent call to one of these, matched to the difficulty of the subtask.`,
    `- Spawn at most ${c.maxAgents} subagents for this request. Calls past that are refused.`,
    `- Keep each subagent within about ${contextLabel(c.contextK)} tokens of context: give it a self-contained brief, ask for a compact report, and split any subtask that needs more.`,
    '- Subagents must not spawn subagents of their own. Tell them so in each brief.',
  ].join('\n')

// "300", "300k" and "1m" all read as thousands of tokens for ctx.
const toNumber = (v: string) => Number(v.trim().replace(/k$/i, '').replace(/m$/i, '000'))

// `/orch max=4 ctx=200 models=sonnet,haiku on` style edits; unknown words are reported back.
const parse = (args: string, c: Config): { next: Config; bad: string[] } => {
  const bad: string[] = []
  let next = c
  for (const word of args.split(/\s+/).filter(Boolean)) {
    const [k, v = ''] = word.split('=')
    const n = toNumber(v)
    const picked = v.split(',').filter((m): m is Model => MODELS.includes(m as Model))
    if (k === 'on' || k === 'off') next = { ...next, isOn: k === 'on' }
    else if (k === 'max' && n >= 1) next = { ...next, maxAgents: Math.floor(n) }
    else if (k === 'ctx' && n > 0) next = { ...next, contextK: n }
    else if (k === 'models' && picked.length > 0) next = { ...next, models: picked }
    else bad.push(word)
  }
  return { next, bad }
}

const withValue = (presets: number[], value: number) =>
  (presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b))

// Every modz mod places its tile in one shared band: live metrics stack in a left column, identity and controls in a
// right one. A column with no tiles is not drawn, and the right column drops under the left when the width runs out.
const BAND = 'modz-band'
const SLOTS: Record<string, 'left' | 'right'> = { 'usage-limits': 'left', 'cache-timer': 'left', 'model-info': 'right', orchestrator: 'right' }
const ORDER = Object.keys(SLOTS)
const keyOf = (n: RenderNode) => (typeof n !== 'string' && n.type === 'Box' ? String(n.props?.key ?? '') : '')
const rank = (n: RenderNode) => {
  const i = ORDER.indexOf(keyOf(n))
  return i < 0 ? ORDER.length : i
}
const pack = (Box: ElementConstructor<BoxProps>, below: RenderElement, tile: RenderElement) => {
  const isEmpty = below.type === 'Box' && !below.children?.length
  const tiles = keyOf(below) === BAND
    ? (below.type === 'Box' ? below.children ?? [] : []).flatMap(col => (typeof col !== 'string' && col.type === 'Box' ? col.children ?? [] : [col]))
    : isEmpty ? [] : [below]
  const all = [...tiles, tile].sort((a, b) => rank(a) - rank(b))
  const left = all.filter(n => SLOTS[keyOf(n)] !== 'right')
  const right = all.filter(n => SLOTS[keyOf(n)] === 'right')
  const isSplit = left.length > 0 && right.length > 0
  return (
    <Box key={BAND} flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={4}>
      {left.length > 0 && <Box key="modz-left" flexDirection="column">{left}</Box>}
      {right.length > 0 && <Box key="modz-right" flexDirection="column" alignItems={isSplit ? 'flex-end' : 'flex-start'}>{right}</Box>}
    </Box>
  )
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'orch',
      description: 'Orchestrator settings: on, off, max=N, ctx=200k, models=sonnet,haiku, save, reset',
      argumentHint: '[on|off] [max=N] [ctx=N] [models=a,b] [save|reset]',
    })
    const held = await $.state.get(CONFIG_REF)
    if (held.version === 0) {
      const saved = (await $.store.get('defaults')) as Config | undefined
      if (saved) await update($, config, () => saved)
    }
    return next(e)
  })

  on('command.run', { command: 'orch' }, async ($, e) => {
    const words = e.args.trim()
    if (words === 'save') {
      await $.store.set('defaults', await read($, config))
      return { text: `Saved as default: ${summary(await read($, config))}` }
    }
    if (words === 'reset') {
      const saved = ((await $.store.get('defaults')) as Config | undefined) ?? FALLBACK
      await update($, config, () => saved)
      return { text: `Reset: ${summary(saved)}` }
    }
    const { next, bad } = parse(words, await read($, config))
    await update($, config, () => next)
    return { text: `Orchestrator ${summary(next)}${bad.length ? `\nIgnored: ${bad.join(' ')}` : ''}` }
  })

  on('prompt.submit', async ($, e, next) => {
    const c = await read($, config)
    if (!c.isOn || !USER_ORIGINS.has(e.origin.kind)) return next(e)
    await update($, spawned, () => 0)
    return next({ ...e, context: [...(e.context ?? []), brief(c)] })
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const c = await read($, config)
    if (!c.isOn || e.workflow) return next(e)
    if (e.parentAgentId !== undefined) {
      return { deny: 'Orchestrator mode: only the main agent may spawn subagents. Do this work yourself.' }
    }
    if (!e.fork && !c.models.some(m => e.model?.includes(m))) {
      return { deny: `Orchestrator mode: set model to one of ${c.models.join(', ')}.` }
    }
    if ((await read($, spawned)) >= c.maxAgents) {
      return { deny: `Orchestrator mode: the limit of ${c.maxAgents} subagents for this request is reached.` }
    }
    const ran = await next(e)
    if (ran.deny === undefined) await update($, spawned, n => n + 1)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const c = await read($, config)
    const elements = $.ui.resolve(e)
    if (!('Select' in elements)) return below
    const { Box, Button, Input, Select, Text } = elements
    const edit = await read($, editing)
    const open = await read($, isOpen)
    const set = (fn: (c: Config) => Config) => update($, config, fn)
    const toggle = (m: Model) =>
      set(c => {
        const models = MODELS.filter(x => (x === m) !== c.models.includes(x))
        return models.length ? { ...c, models } : c
      })

    const LABEL_WIDTH = Math.max(...['Models', 'Max agents', 'Context limit'].map(l => l.length))
    const row = (label: string, ...controls: RenderChildren[]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingLeft={2}>
        <Text dimColor>{label.padEnd(LABEL_WIDTH)}</Text>
        {controls}
      </Box>
    )

    const numberPicker = (key: Field, value: number, presets: number[], label: (n: number) => string, apply: (n: number) => Config) =>
      edit === key ? (
        <Input
          key={`${key}-custom`}
          autoFocus
          placeholder={key === 'max' ? 'number of agents' : 'tokens, e.g. 300k or 1m'}
          submitLabel="Set"
          onSubmit={async v => {
            const n = toNumber(v)
            if (!(n >= 1)) return $.ui.toast(`Not a number: ${v}`)
            await set(() => apply(key === 'max' ? Math.floor(n) : n))
            await update($, editing, () => null)
          }}
        />
      ) : (
        <Select
          key={key}
          value={String(value)}
          options={[...withValue(presets, value).map(n => ({ value: String(n), label: label(n) })), { value: CUSTOM, label: 'Custom…' }]}
          onSelect={v => (v === CUSTOM ? update($, editing, () => key) : set(() => apply(Number(v))))}
        />
      )

    return pack(Box, below, (
      <Box key="orchestrator" flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          <Select
            key="orch"
            value={c.isOn ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Orchestrator on' },
              { value: 'off', label: 'Orchestrator off' },
              { value: SETTINGS, label: open ? 'Hide settings' : 'Settings…' },
            ]}
            onSelect={v => (v === SETTINGS ? update($, isOpen, o => !o) : set(c => ({ ...c, isOn: v === 'on' })))}
          />
          {open && (
            <Button key="save" plain dimColor label="Save as default" onPress={async () => {
              await $.store.set('defaults', c)
              $.ui.toast(`Saved: ${summary(c)}`)
            }} />
          )}
        </Box>
        {open && c.isOn && row('Models', ...MODELS.map(m => (
          <Button key={`model-${m}`} plain label={`${c.models.includes(m) ? '☑' : '☐'} ${title(m)}`} dimColor={!c.models.includes(m)} onPress={() => toggle(m)} />
        )))}
        {open && c.isOn && row('Max agents', numberPicker('max', c.maxAgents, AGENT_PRESETS, n => `${n} ${n === 1 ? 'agent' : 'agents'}`, n => ({ ...c, maxAgents: n })))}
        {open && c.isOn && row('Context limit', numberPicker('ctx', c.contextK, CONTEXT_PRESETS, k => `${contextLabel(k)} tokens`, n => ({ ...c, contextK: n })))}
      </Box>
    ))
  })
}
