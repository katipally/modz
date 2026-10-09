import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, RenderElement, RenderNode } from 'claude-code'

import type { Info } from '../types'

const info = atom({ plugin: 'model-info', key: 'info' } as const, null)
const TINT = 'merged'
const MODELS = ['opus', 'sonnet', 'haiku']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// "claude-opus-5-5" reads "Opus 5.5"; an id in another shape is shown as given.
const modelName = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?![\d])/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id
}

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
    const model = await $.session.model()
    await update($, info, i => ({ ...i, model }))
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
    const i = await read($, info)
    if (!i) return below
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements

    // Both run Claude Code's own /model and /effort, so the change is the session's, not a display.
    const run = async (command: string, args: string) => {
      const { text } = await $.command.run({ command, args })
      if (text) $.ui.toast(text)
    }
    const setModel = async (m: string) => {
      await run('model', m)
      const model = await $.session.model()
      await update($, info, cur => ({ ...cur, model }))
    }
    const setEffort = async (effort: string) => {
      await run('effort', effort)
      await update($, info, cur => ({ model: cur?.model ?? i.model, effort }))
    }
    if (!('Select' in elements)) {
      return pack(Box, below, (
        <Box key="model-info" flexDirection="row">
          <Text bold color={TINT}>{modelName(i.model)}</Text>
          {i.effort && <Text dimColor> · {i.effort}</Text>}
        </Box>
      ))
    }
    const { Select } = elements
    const family = MODELS.find(m => i.model.includes(m)) ?? i.model
    const title = (m: string) => m[0]!.toUpperCase() + m.slice(1)

    return pack(Box, below, (
      <Box key="model-info" flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Select
          key="model"
          value={family}
          options={[...new Set([family, ...MODELS])].map(m => ({ value: m, label: m === family ? modelName(i.model) : title(m) }))}
          onSelect={setModel}
        />
        <Select
          key="effort"
          value={i.effort}
          options={(!i.effort || EFFORTS.includes(i.effort) ? EFFORTS : [i.effort, ...EFFORTS]).map(level => ({ value: level, label: `${level} effort` }))}
          onSelect={setEffort}
        />
      </Box>
    ))
  })
}
