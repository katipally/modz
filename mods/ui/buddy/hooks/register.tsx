import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, Timer } from 'claude-code'

import type { Mood } from '../types'

const TINT = 'claude'
const WALK_MS = 250
const HOP_MS = 180
const HOP_FRAMES = 8
const BLINK_MS = 160
// A blink lands somewhere in this window so the bot never looks mechanical.
const BLINK_GAP_MS: [number, number] = [2500, 6500]

const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')
const frame = atom({ plugin: 'buddy', key: 'frame' } as const, 0)
const isBlinking = atom({ plugin: 'buddy', key: 'isBlinking' } as const, false)

// Three rows tall; every frame is padded to the same width so nothing beside it shifts.
const HEAD = ' ▗▄▄▄▖ '
const FACE = { idle: ' ▐●‿●▌ ', blink: ' ▐-‿-▌ ', working: ' ▐•_•▌ ', happy: ' ▐^‿^▌ ' }
const FEET = ['  ▝▘ ▝▘', ' ▘▝ ▘▝ ']
const THINK = ['·  ', '·· ', '···', ' ··', '  ·', '   ']
const SPARKLE = ['✦', '✧', '⋆', '✧']

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

// One timer at a time drives the bot: walking while a turn runs, a short hop when it ends, blinks in between.
let timer: Timer | undefined

const stop = () => {
  timer?.cancel()
  timer = undefined
}

const scheduleBlink = ($: EngineInterface) => {
  stop()
  const [lo, hi] = BLINK_GAP_MS
  timer = $.clock.after(lo + Math.random() * (hi - lo), async () => {
    await update($, isBlinking, () => true)
    timer = $.clock.after(BLINK_MS, async () => {
      await update($, isBlinking, () => false)
      scheduleBlink($)
    })
  })
}

const walk = async ($: EngineInterface) => {
  stop()
  await update($, mood, () => 'working' as Mood)
  timer = $.clock.every(WALK_MS, () => void update($, frame, f => f + 1))
}

const hop = async ($: EngineInterface) => {
  stop()
  await update($, mood, () => 'happy' as Mood)
  await update($, frame, () => 0)
  timer = $.clock.every(HOP_MS, async () => {
    const f = await read($, frame)
    if (f + 1 < HOP_FRAMES) return void (await update($, frame, n => n + 1))
    await update($, mood, () => 'idle' as Mood)
    scheduleBlink($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, mood, () => 'idle' as Mood)
    scheduleBlink($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await walk($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await hop($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text } = $.ui.resolve(e)
    const [m, f, blink] = await Promise.all([read($, mood), read($, frame), read($, isBlinking)])
    const isHopUp = m === 'happy' && f % 2 === 0
    const face = blink && m === 'idle' ? FACE.blink : FACE[m]
    const feet = m === 'working' ? FEET[f % 2]! : FEET[0]!
    const aside = m === 'working' ? THINK[f % THINK.length]! : m === 'happy' ? SPARKLE[f % SPARKLE.length]! : ' '.repeat(THINK[0]!.length)
    const rows = [HEAD, face, isHopUp ? ' '.repeat(feet.length) : feet]

    return pack(Box, below, (
      <Box key="buddy" flexDirection="column">
        <Text color={TINT}>{rows[0]}<Text dimColor>{aside}</Text></Text>
        <Text color={TINT}>{rows[1]}</Text>
        <Text color={TINT}>{rows[2]}</Text>
      </Box>
    ))
  })
}
