import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderChildren, RenderElement, RenderNode, SelectOption, Timer } from 'claude-code'

import type { Config, Field, Model } from '../types'

const MODELS: Model[] = ['opus', 'sonnet', 'haiku']
const FALLBACK: Config = { isOn: true, models: ['sonnet', 'haiku'], maxAgents: 2, contextK: 200, delegate: true }
const AGENT_PRESETS = [1, 2, 3, 4]
const CONTEXT_PRESETS = [200, 400]
const CUSTOM = 'custom'
const USER_ORIGINS = new Set(['composer', 'bridge', 'sdk'])
const DELEGATED_TOOLS = new Set(['Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep', 'Bash'])

const CONFIG_REF = { plugin: 'orchestrator', key: 'config' } as const
const config = atom(CONFIG_REF, FALLBACK)
const running = atom({ plugin: 'orchestrator', key: 'running' } as const, [])
const spin = atom({ plugin: 'orchestrator', key: 'spin' } as const, 0)
const spawned = atom({ plugin: 'orchestrator', key: 'spawned' } as const, [])
const retired = atom({ plugin: 'orchestrator', key: 'retired' } as const, [])
const saved = atom({ plugin: 'orchestrator', key: 'saved' } as const, null)

// The spinner turns only while a subagent this session spawned is still running.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPIN_MS = 100
let spinner: Timer | undefined
const track = async ($: EngineInterface, agentId: string, isRunning: boolean) => {
  await update($, running, ids => (isRunning ? [...ids, agentId] : ids.filter(id => id !== agentId)))
  const count = (await read($, running)).length
  if (count > 0 && !spinner) spinner = $.clock.every(SPIN_MS, () => void update($, spin, n => n + 1))
  if (count === 0) {
    spinner?.cancel()
    spinner = undefined
  }
}
// Spawns between the cap check and their agent joining `running`, so parallel Agent calls cannot all pass one check.
let starting = 0
const editing = atom({ plugin: 'orchestrator', key: 'editing' } as const, null)
const isOpen = atom({ plugin: 'orchestrator', key: 'isOpen' } as const, false)

const contextLabel = (k: number) => (k >= 1000 ? `${k / 1000}M` : `${k}k`)
const title = (m: Model) => m[0]!.toUpperCase() + m.slice(1)

const summary = (c: Config) =>
  `${c.isOn ? 'ON' : 'OFF'} | models: ${c.models.join(', ')} | max at once: ${c.maxAgents} | context: ${contextLabel(c.contextK)} | delegate: ${c.delegate ? 'on' : 'off'}`

const same = (a: Config, b: Config) =>
  a.isOn === b.isOn && a.delegate === b.delegate && a.maxAgents === b.maxAgents && a.contextK === b.contextK &&
  MODELS.every(m => a.models.includes(m) === b.models.includes(m))

// Old saved defaults lack newer fields, so they merge over FALLBACK.
const loadDefaults = async ($: EngineInterface) => {
  const stored = (await $.store.get('defaults')) as Partial<Config> | undefined
  return stored ? { ...FALLBACK, ...stored } : null
}
const saveDefaults = async ($: EngineInterface, c: Config) => {
  await $.store.set('defaults', c)
  await update($, saved, () => c)
}
const resetConfig = async ($: EngineInterface) => {
  const stored = await loadDefaults($)
  await update($, saved, () => stored)
  await update($, config, () => stored ?? FALLBACK)
  return stored ?? FALLBACK
}

const brief = (c: Config) =>
  [
    'Orchestrator mode (chosen by the user for this request):',
    '- You are the orchestrator. Break the work down, delegate it to subagents with the Agent tool, then verify and merge their results.',
    c.delegate && '- Do not read, search, edit or run commands yourself. Every read and write, verification included, goes to a subagent; those tools are refused for you.',
    `- Allowed subagent models: ${c.models.join(', ')}. Always set \`model\` on every Agent call to one of these, matched to the difficulty of the subtask.`,
    `- At most ${c.maxAgents} subagents run at the same time. A spawn or a message to a finished subagent past that is refused until one finishes.`,
    `- Each subagent's context is capped at ${contextLabel(c.contextK)} tokens. At the cap its tools are refused and it must report; it cannot be messaged again. Spawn a fresh subagent with a self-contained brief to carry on.`,
    '- Give each subagent one task or a few closely related ones. For unrelated work spawn a fresh subagent instead of messaging an old one.',
    '- Subagents must not spawn subagents. Tell them so in each brief.',
  ].filter(Boolean).join('\n')

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
    else if (k === 'delegate' && (v === 'on' || v === 'off')) next = { ...next, delegate: v === 'on' }
    else if (k === 'models' && picked.length > 0) next = { ...next, models: picked }
    else bad.push(word)
  }
  return { next, bad }
}

const withValue = (presets: number[], value: number) =>
  (presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b))

// Every modz mod places its tile in one shared band: a lead column (the bot), then a column of tiles, then an optional
// right column. A column with no tiles is not drawn, and columns wrap under each other when the width runs out.
const BAND = 'modz-band'
const SLOTS: Record<string, 'lead' | 'left' | 'right'> = {
  buddy: 'lead',
  'usage-limits': 'left',
  'cache-timer': 'left',
  'model-info': 'left',
  orchestrator: 'left',
}
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
  const [lead, left, right] = (['lead', 'left', 'right'] as const).map(slot => all.filter(n => (SLOTS[keyOf(n)] ?? 'left') === slot))
  return (
    <Box key={BAND} flexDirection="row" flexWrap="wrap" columnGap={3}>
      {lead!.length > 0 && <Box key="modz-lead" flexDirection="column" justifyContent="center">{lead}</Box>}
      {left!.length > 0 && <Box key="modz-left" flexDirection="column" flexGrow={right!.length > 0 ? 1 : 0}>{left}</Box>}
      {right!.length > 0 && <Box key="modz-right" flexDirection="column" alignItems="flex-end">{right}</Box>}
    </Box>
  )
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'orch',
      description: 'Orchestrator settings: on, off, max=N, ctx=200k, models=sonnet,haiku, delegate=on|off, save, reset',
      argumentHint: '[on|off] [max=N] [ctx=N] [models=a,b] [delegate=on|off] [save|reset]',
    })
    const held = await $.state.get(CONFIG_REF)
    const stored = await loadDefaults($)
    await update($, saved, () => stored)
    if (held.version === 0 && stored) await update($, config, () => stored)
    return next(e)
  })

  on('command.run', { command: 'orch' }, async ($, e) => {
    const words = e.args.trim()
    if (words === 'save') {
      const c = await read($, config)
      await saveDefaults($, c)
      return { text: `Saved as default: ${summary(c)}` }
    }
    if (words === 'reset') return { text: `Reset: ${summary(await resetConfig($))}` }
    const { next, bad } = parse(words, await read($, config))
    await update($, config, () => next)
    return { text: `Orchestrator ${summary(next)}${bad.length ? `\nIgnored: ${bad.join(' ')}` : ''}` }
  })

  on('prompt.submit', async ($, e, next) => {
    const c = await read($, config)
    if (!c.isOn || !USER_ORIGINS.has(e.origin.kind)) return next(e)
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
    if ((await read($, running)).length + starting >= c.maxAgents) {
      return { deny: `Orchestrator mode: ${c.maxAgents} subagents are already running, the most at once. Wait for one to finish, then spawn this.` }
    }
    starting++
    try {
      const ran = await next(e)
      if (ran.agentId) {
        await update($, spawned, ids => [...ids, ran.agentId!])
        await track($, ran.agentId, true)
      }
      return ran
    } finally {
      starting--
    }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId && (await read($, running)).includes(e.agentId)) await track($, e.agentId, false)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const c = await read($, config)
    if (!c.isOn) return next(e)
    if (e.agentId === undefined) {
      // Only the model's own calls: another mod's $.tool.call on the main loop is not the orchestrator doing the work.
      return c.delegate && DELEGATED_TOOLS.has(e.tool) && next.origin.plugin === 'engine' ? { deny: 'Orchestrator mode: delegate reads, searches, edits and commands to a subagent.' } : next(e)
    }
    if ((await read($, retired)).includes(e.agentId)) {
      return { deny: `Orchestrator mode: this subagent reached its context limit of ${contextLabel(c.contextK)} tokens. Stop using tools and reply now with your report.` }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const id = e.agentId
    const u = response.usage
    if (id && u) {
      const c = await read($, config)
      const [mine, done] = await Promise.all([read($, spawned), read($, retired)])
      const context = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
      if (c.isOn && mine.includes(id) && !done.includes(id) && context >= c.contextK * 1000) await update($, retired, ids => [...ids, id])
    }
    return response
  })

  on('session.send', async ($, e, next) => {
    const c = await read($, config)
    if (!c.isOn || e.agentId !== undefined) return next(e)
    const id = (await $.agent.list()).find(a => a.id === e.to || a.name === e.to)?.id ?? e.to
    if (!(await read($, spawned)).includes(id)) return next(e)
    if ((await read($, retired)).includes(id)) {
      return { isDelivered: false as const, reason: `Orchestrator mode: that subagent reached its context limit of ${contextLabel(c.contextK)} tokens and cannot be messaged. Spawn a fresh subagent with a self-contained brief.` }
    }
    if ((await read($, running)).includes(id)) return next(e)
    if ((await read($, running)).length + starting >= c.maxAgents) {
      return { isDelivered: false as const, reason: `Orchestrator mode: ${c.maxAgents} subagents are already running, the most at once. Wait for one to finish, then send this.` }
    }
    starting++
    try {
      const sent = await next(e)
      if (sent.isDelivered) await track($, id, true)
      return sent
    } finally {
      starting--
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const elements = $.ui.resolve(e)
    if (!('Select' in elements)) return below
    const { Box, Button, Input, Select, Text } = elements
    const [c, edit, open, busy, turn, defaults] = await Promise.all([read($, config), read($, editing), read($, isOpen), read($, running), read($, spin), read($, saved)])
    const isDefault = same(c, defaults ?? FALLBACK)
    const set = (fn: (c: Config) => Config) => update($, config, fn)
    const toggle = (m: Model) =>
      set(c => {
        const models = MODELS.filter(x => (x === m) !== c.models.includes(x))
        return models.length ? { ...c, models } : c
      })

    const LABEL_WIDTH = Math.max(...['Models', 'Agents at once', 'Context limit', 'Main agent'].map(l => l.length))
    const row = (label: string, ...controls: RenderChildren[]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingLeft={2}>
        <Text dimColor>{label.padEnd(LABEL_WIDTH)}</Text>
        {controls}
      </Box>
    )
    const mark = (isChosen: boolean) => (isChosen ? '●' : '○')

    // In the terminal a Select answers only the keyboard, so there every option is a button one click picks, the
    // chosen one marked; every other surface keeps its native Select.
    const choice = (key: string, value: string, options: readonly SelectOption[], onSelect: (v: string) => unknown) =>
      e.surface !== 'terminal' ? (
        <Select key={key} value={value} options={options} onSelect={onSelect} />
      ) : (
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {options.map(o => (
            <Button key={`${key}:${o.value}`} plain dimColor={o.value !== value} label={`${mark(o.value === value)} ${o.label ?? o.value}`} onPress={() => onSelect(o.value)} />
          ))}
        </Box>
      )

    const numberPicker = (key: Field, value: number, presets: number[], label: (n: number) => string, apply: (n: number) => Config) =>
      edit === key ? (
        <Box flexDirection="row" columnGap={2}>
          <Input
            key={`${key}-custom`}
            autoFocus
            placeholder={key === 'max' ? 'agents at once' : 'tokens, e.g. 300k or 1m'}
            submitLabel="Set"
            onSubmit={async v => {
              const n = toNumber(v)
              if (!(n >= 1)) return $.ui.toast(`Not a number: ${v}`)
              await set(() => apply(key === 'max' ? Math.floor(n) : n))
              await update($, editing, () => null)
            }}
          />
          <Button key={`${key}-cancel`} plain dimColor label="Cancel" onPress={() => update($, editing, () => null)} />
        </Box>
      ) : (
        choice(
          key,
          String(value),
          [...withValue(presets, value).map(n => ({ value: String(n), label: label(n) })), { value: CUSTOM, label: 'Custom…' }],
          v => (v === CUSTOM ? update($, editing, () => key) : set(() => apply(Number(v)))),
        )
      )

    return pack(Box, below, (
      <Box key="orchestrator" flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
          <Button key="orch" plain dimColor={!c.isOn} onPress={async () => {
            await set(c => ({ ...c, isOn: !c.isOn }))
            await update($, editing, () => null)
          }}>
            <Text color={c.isOn ? 'success' : 'inactive'}>{mark(c.isOn)}</Text>
            {' Orchestrator '}
            <Text color={c.isOn ? 'success' : 'inactive'} bold={c.isOn}>{c.isOn ? 'ON' : 'OFF'}</Text>
          </Button>
          <Button key="settings" plain dimColor label={`Settings ${open ? '▴' : '▾'}`} onPress={async () => {
            await update($, isOpen, o => !o)
            await update($, editing, () => null)
          }} />
          {busy.length > 0 && <Text color="planMode">{SPINNER[turn % SPINNER.length]} {busy.length}/{c.maxAgents} running</Text>}
          {open && isDefault && <Text dimColor>✓ Default</Text>}
          {open && !isDefault && (
            <Button key="save" plain label="Save as default" onPress={async () => {
              await saveDefaults($, c)
              $.ui.toast(`Saved: ${summary(c)}`)
            }} />
          )}
          {open && !isDefault && (
            <Button key="reset" plain dimColor label="Reset" onPress={async () => $.ui.toast(`Reset: ${summary(await resetConfig($))}`)} />
          )}
        </Box>
        {open && row('Models', ...MODELS.map(m => (
          <Button key={`model-${m}`} plain label={`${c.models.includes(m) ? '☑' : '☐'} ${title(m)}`} dimColor={!c.models.includes(m)} onPress={() => toggle(m)} />
        )))}
        {open && row('Agents at once', numberPicker('max', c.maxAgents, AGENT_PRESETS, String, n => ({ ...c, maxAgents: n })))}
        {open && row('Context limit', numberPicker('ctx', c.contextK, CONTEXT_PRESETS, contextLabel, n => ({ ...c, contextK: n })))}
        {open && row('Main agent', (
          <Button key="delegate" plain dimColor={!c.delegate} label={`${c.delegate ? '☑' : '☐'} Delegates reads & writes`} onPress={() => set(c => ({ ...c, delegate: !c.delegate }))} />
        ))}
      </Box>
    ))
  })
}
