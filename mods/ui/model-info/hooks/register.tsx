import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode } from 'claude-code'

import type { Choices, Info } from '../types'

const info = atom({ plugin: 'model-info', key: 'info' } as const, null)
const choices = atom({ plugin: 'model-info', key: 'choices' } as const, { models: [], efforts: [] })
const isConfirmed = atom({ plugin: 'model-info', key: 'isConfirmed' } as const, false)
const CONFIRM_MS = 1500

const confirm = async ($: EngineInterface) => {
  await update($, isConfirmed, () => true)
  $.clock.after(CONFIRM_MS, () => void update($, isConfirmed, () => false))
}
const TINT = 'merged'

// /effort's hint reads like "[low|medium|high|max|auto|ultracode [on|off]]": its bare words are the levels.
const levelsOf = (hint: string) => hint.replace(/^[[<]|[\]>]$/g, '').split('|').filter(w => /^[a-z]+$/.test(w))
const title = (alias: string) => alias[0]!.toUpperCase() + alias.slice(1)

// "claude-opus-5-5" reads "Opus 5.5"; an id in another shape is shown as given.
const modelName = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?![\d])/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id
}

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


// The model row of /config lists what this account can pick; listing the commands asks /effort for its hint.
const loadChoices = async ($: EngineInterface) => {
  const row = (await $.config.list()).find(r => r.key === 'model')
  await update($, choices, c => ({ ...c, models: [...(row?.options ?? [])] }))
  await $.command.list()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const model = await $.session.model()
    await update($, info, i => ({ ...i, model }))
    await loadChoices($)
    return next(e)
  })

  on('command.describe', { command: 'effort' }, async ($, e, next) => {
    if (e.argumentHint) {
      const efforts = levelsOf(e.argumentHint)
      await update($, choices, c => ({ ...c, efforts }))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await update($, info, () => ({ model: e.model, effort: e.effort === undefined ? undefined : String(e.effort) }))
    }
    return yield* next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const [i, c, ok] = await Promise.all([read($, info), read($, choices), read($, isConfirmed)])
    if (!i) return below
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements

    // Both run Claude Code's own /model and /effort, so the change is the session's, not a display.
    const run = async (command: string, args: string) => {
      const { text } = await $.command.run({ command, args })
      if (text) $.ui.toast(text)
    }
    const setModel = async (alias: string) => {
      await run('model', alias)
      const model = await $.session.model()
      await update($, info, cur => ({ ...cur, model }))
      await $.command.list()
      await confirm($)
    }
    const setEffort = async (effort: string) => {
      await run('effort', effort)
      await update($, info, cur => ({ model: cur?.model ?? i.model, effort }))
      await confirm($)
    }

    const plain = (
      <Box key="model-info" flexDirection="row">
        <Text bold color={TINT}>{modelName(i.model)}</Text>
        {i.effort && <Text dimColor> · {i.effort}</Text>}
      </Box>
    )
    if (!('Select' in elements)) return pack(Box, below, plain)
    const { Select } = elements

    // The alias the current model answers to; "default" only when nothing more specific matches.
    const current = c.models.find(a => a !== 'default' && i.model.includes(a.replace(/\[.*\]$/, ''))) ?? i.model
    const models = c.models.includes(current) ? c.models : [current, ...c.models]
    const efforts = !i.effort || c.efforts.includes(i.effort) ? c.efforts : [i.effort, ...c.efforts]

    return pack(Box, below, (
      <Box key="model-info" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Select
          key="model"
          value={current}
          options={models.map(a => ({ value: a, label: a === current ? modelName(i.model) : title(a) }))}
          onSelect={setModel}
        />
        {efforts.length > 0
          ? <Select key="effort" value={i.effort} options={efforts.map(level => ({ value: level }))} onSelect={setEffort} />
          : i.effort && <Text dimColor>{i.effort}</Text>}
        {ok && <Text color="success">✓</Text>}
      </Box>
    ))
  })
}
