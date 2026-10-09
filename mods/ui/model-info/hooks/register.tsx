import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, RenderElement, RenderNode } from 'claude-code'

const info = atom({ plugin: 'model-info', key: 'info' } as const, null)
const style = atom({ plugin: 'model-info', key: 'style' } as const, null)

const EFFORT_COLORS: Record<string, string> = { low: 'subtle', medium: 'success', high: 'warning', xhigh: 'claude', max: 'error' }

// "claude-opus-5-5" reads "Opus 5.5"; an id in another shape is shown as given.
const modelName = (id: string) => {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?![\d])/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : id
}

// Every modz mod adds its tile to one shared wrapping row, so tiles pack side by side and reflow as the width changes.
const BAND = 'modz-band'
const ORDER = ['usage-limits', 'cache-timer', 'model-info', 'orchestrator']
const rank = (n: RenderNode) => {
  const i = typeof n !== 'string' && n.type === 'Box' ? ORDER.indexOf(String(n.props?.key)) : -1
  return i < 0 ? ORDER.length : i
}
const pack = (Box: ElementConstructor<BoxProps>, below: RenderElement, tile: RenderElement) => {
  const isBand = below.type === 'Box' && below.props?.key === BAND
  const isEmpty = below.type === 'Box' && !below.children?.length
  const tiles = isBand ? (below.children ?? []) : isEmpty ? [] : [below]
  return (
    <Box key={BAND} flexDirection="row" flexWrap="wrap" columnGap={3}>
      {[...tiles, tile].sort((a, b) => rank(a) - rank(b))}
    </Box>
  )
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    await update($, style, () => e.outputStyle?.name ?? null)
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
    const [i, s] = await Promise.all([read($, info), read($, style)])
    if (!i) return below
    const { Box, Text } = $.ui.resolve(e)
    const dot = <Text color="claude" bold> · </Text>

    return pack(Box, below, (
      <Box key="model-info" flexDirection="row" flexWrap="wrap">
        <Text color="claude">{modelName(i.model)}</Text>
        {i.effort && dot}
        {i.effort && <Text color={EFFORT_COLORS[i.effort] ?? 'text'}>{i.effort}</Text>}
        {dot}
        <Text bold>{s ?? 'default'}</Text>
      </Box>
    ))
  })
}
