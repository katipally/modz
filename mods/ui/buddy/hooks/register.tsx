import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, Timer } from 'claude-code'

import type { Gesture, Mood } from '../types'

// Claude Code's bot as a pixel grid: B body, E eye slot (left empty so the background shows through), . nothing.
// One column of margin each side leaves room for the head shake, one row on top for the jump.
const BOT = [
  '..BBBBBBBBBBB..',
  '..BBEBBBBBEBB..',
  '..BBEBBBBBEBB..',
  'BBBBBBBBBBBBBBB',
  '..BBBBBBBBBBB..',
  '..B.B.....B.B..',
  '..B.B.....B.B..',
]
const W = BOT[0]!.length + 2
const H = BOT.length + 1
const ARM_ROW = 3
const EYE_COLS = [4, 10]
const LEG_ROWS = [5, 6]

// Skins are the styles /buddy skin switches between; classic is Claude orange.
const SKINS: Record<string, number> = {
  classic: 0xd97757,
  ink: 0xe8e6e3,
  mint: 0x7fd1ae,
  sky: 0x7aa2f7,
  berry: 0xe07ab0,
  gold: 0xe5c07b,
}

const TICK_MS: Record<Mood, number> = { idle: 700, working: 200, happy: 160, oops: 90, asleep: 900 }
const HAPPY_FRAMES = 10
const OOPS_FRAMES = 8
const ASLEEP_AFTER_MS = 120_000
// Each idle tick may start one gesture; these are its odds, so the bot never loops mechanically.
const GESTURE_ODDS: [Gesture, number][] = [['blink', 0.1], ['look-left', 0.05], ['look-right', 0.05], ['wave', 0.03]]

const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')
const frame = atom({ plugin: 'buddy', key: 'frame' } as const, 0)
const gesture = atom({ plugin: 'buddy', key: 'gesture' } as const, 'none')
const skin = atom({ plugin: 'buddy', key: 'skin' } as const, 'classic')

type Pixels = boolean[][]

// One frame of the bot: the base grid, then the mood and gesture move eyes, arms, legs and the whole body.
const draw = (m: Mood, f: number, g: Gesture): Pixels => {
  const rows = BOT.map(r => [...r].map(c => c === 'B'))
  const eyesShut = m === 'asleep' || m === 'oops' || g === 'blink'
  const eyeShift = g === 'look-left' ? -1 : g === 'look-right' || m === 'working' ? 1 : 0
  for (const col of EYE_COLS) {
    rows[1]![col] = rows[2]![col] = true
    if (!eyesShut) {
      // A happy bot squints: only the lower half of each eye stays open.
      if (m !== 'happy') rows[1]![col + eyeShift] = false
      rows[2]![col + eyeShift] = false
    }
  }
  const armsUp = (m === 'happy' && f % 2 === 0) || (g === 'wave' && f % 2 === 0)
  if (armsUp) {
    const raised = g === 'wave' ? [13, 14] : [0, 1, 13, 14]
    for (const col of raised) {
      rows[ARM_ROW]![col] = false
      rows[ARM_ROW - 1]![col] = true
    }
  }
  if (m === 'working' && f % 2 === 1) {
    // Walking in place: the outer legs lift while the inner ones stay down.
    for (const col of [2, 12]) rows[LEG_ROWS[1]!]![col] = false
  }
  if (m === 'working' && f % 2 === 0) {
    for (const col of [4, 10]) rows[LEG_ROWS[1]!]![col] = false
  }
  if (m === 'asleep') {
    // Asleep it sits: legs folded under the body.
    for (const col of [2, 4, 10, 12]) rows[LEG_ROWS[1]!]![col] = false
  }
  const dy = m === 'happy' && f % 2 === 0 ? 0 : 1
  const dx = m === 'oops' ? (f % 2 === 0 ? -1 : 1) : 0
  const canvas: Pixels = Array.from({ length: H }, () => Array<boolean>(W).fill(false))
  rows.forEach((r, y) => r.forEach((on, x) => {
    const cx = x + 1 + dx
    const cy = y + dy
    if (on && cy >= 0 && cy < H && cx >= 0 && cx < W) canvas[cy]![cx] = true
  }))
  return canvas
}

// Terminal: two pixels per cell, the top as the glyph's color and the bottom as the cell's.
const DEFAULT = 0x01000000
const toCells = (px: Pixels, color: number) => {
  const words: number[] = []
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x++) {
      const top = px[y]![x]!
      const bottom = px[y + 1]?.[x] ?? false
      if (top && bottom) words.push(0x2588, color, DEFAULT)
      else if (top) words.push(0x2580, color, DEFAULT)
      else if (bottom) words.push(0x2584, color, DEFAULT)
      else words.push(0x20, DEFAULT, DEFAULT)
    }
  }
  return btoa(Array.from(new Uint8Array(Uint32Array.from(words).buffer), b => String.fromCharCode(b)).join(''))
}

// Everywhere else: one crisp square per pixel.
const PX = 6
const toSvg = (px: Pixels, color: number) => {
  const fill = `#${color.toString(16).padStart(6, '0')}`
  const rects = px.flatMap((r, y) => r.flatMap((on, x) => (on ? [`<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}"/>`] : [])))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PX}" height="${H * PX}" shape-rendering="crispEdges" fill="${fill}">${rects.join('')}</svg>`
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

// One timer drives the bot at the pace its mood needs; a mood change restarts it.
let timer: Timer | undefined
let lastActiveAt = 0

const play = async ($: EngineInterface, next: Mood) => {
  timer?.cancel()
  await update($, mood, () => next)
  await update($, frame, () => 0)
  await update($, gesture, () => 'none' as Gesture)
  timer = $.clock.every(TICK_MS[next], () => void tick($))
}

const tick = async ($: EngineInterface) => {
  const [m, f] = await Promise.all([read($, mood), read($, frame)])
  await update($, frame, n => n + 1)
  if ((m === 'happy' && f + 1 >= HAPPY_FRAMES) || (m === 'oops' && f + 1 >= OOPS_FRAMES)) return play($, 'idle')
  if (m !== 'idle') return
  if (Date.now() - lastActiveAt > ASLEEP_AFTER_MS) return play($, 'asleep')
  const roll = Math.random()
  let edge = 0
  const picked = GESTURE_ODDS.find(([, odds]) => roll < (edge += odds))?.[0] ?? 'none'
  await update($, gesture, () => picked)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'buddy', description: 'Change the bot\'s style', argumentHint: `skin ${Object.keys(SKINS).join(' | ')}` })
    const saved = (await $.store.get('skin')) as string | undefined
    if (saved && saved in SKINS) await update($, skin, () => saved)
    lastActiveAt = Date.now()
    await play($, 'idle')
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const [word, name = ''] = e.args.trim().split(/\s+/)
    if (word !== 'skin' || !(name in SKINS)) return { text: `Usage: /buddy skin ${Object.keys(SKINS).join(' | ')}` }
    await update($, skin, () => name)
    await $.store.set('skin', name)
    return { text: `Buddy is now ${name}.` }
  })

  on('turn.start', async ($, e, next) => {
    lastActiveAt = Date.now()
    await play($, 'working')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      lastActiveAt = Date.now()
      await play($, e.isAborted || e.reason === 'error' ? 'oops' : 'happy')
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const [m, f, g, s] = await Promise.all([read($, mood), read($, frame), read($, gesture), read($, skin)])
    const px = draw(m, f, g)
    const color = SKINS[s] ?? SKINS.classic!
    // The terminal paints cells; every other surface draws an Svg (each table carries the other as an empty stand-in).
    const art = e.surface === 'terminal' && 'Raster' in elements
      ? <elements.Raster key="buddy-art" columns={W} rows={H / 2} cells={toCells(px, color)} />
      : 'Svg' in elements
        ? <elements.Svg source={toSvg(px, color)} alt={`Claude Code bot, ${m}`} />
        : null
    if (!art) return below
    const aside = m === 'working' ? '·'.repeat((f % 3) + 1) : m === 'happy' ? ['✦', '✧', '⋆'][f % 3]! : m === 'asleep' ? ['z', 'zZ', 'zZz'][f % 3]! : ''

    return pack(Box, below, (
      <Box key="buddy" flexDirection="row">
        {art}
        <Text dimColor>{aside.padEnd(3)}</Text>
      </Box>
    ))
  })
}
