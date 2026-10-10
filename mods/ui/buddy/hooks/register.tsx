import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, Timer } from 'claude-code'

import type { Activity, Gesture, Mood } from '../types'

// Clawd exactly as Claude Code draws him (its built-in mods guide's CLAWD_POSES): C body, E eye, . nothing.
const CLAWD = [
  '..CCCCCCCCCCCCC..',
  '..CCCCCCCCCCCCC..',
  '..CCCECCCCCCCEC..',
  '..CCCECCCCCCCEC..',
  'CCCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCC',
  '..CCCCCCCCCCCCC..',
  '..CCCCCCCCCCCCC..',
  '..C.C.......C.C..',
  '..C.C.......C.C..',
]
const EYE_ROWS = [2, 3]
const EYE_COLS = [5, 13]
const ARM_ROWS = [4, 5]
const ARM_COLS = { left: [0, 1], right: [15, 16] }
const LEG_ROW = 9
const LEGS = { outer: [2, 14], inner: [4, 12] }

// The canvas leaves two rows above Clawd for hats and hearts, room on the right for what he holds,
// and a column each side for the head shake.
const TOP = 2
const LEFT = 1
const W = LEFT + CLAWD[0]!.length + 9
const H = TOP + CLAWD.length

// Props are drawn in the same pixel style; each letter is one palette color.
const PALETTE: Record<string, number> = {
  E: 0x141414, // eyes
  G: 0x3a3a40, // dark metal
  g: 0xb8bcc4, // light metal
  b: 0x7aa2f7, // screen glow
  W: 0xffffff,
  w: 0x8b5a2b, // wood
  y: 0xf5c542,
  r: 0xe5484d,
  n: 0x5fd38d,
  p: 0xe07ab0,
  N: 0x5a6fd6, // nightcap
}
const LAPTOP = [
  'GGGGGGG',
  'GbbbbbG',
  'GbbbbbG',
  'GbbbbbG',
  'GGGGGGG',
  'ggggggggg',
]
const LENS = ['.GG.', 'GbbG', 'GbbG', '.GG.']
const HEART = ['rr.rr', '.rrr.']
const CROWN = ['y.y.y', 'yyyyy']
const NIGHTCAP = ['....NNNN.', '.NNNNNNNNW']
const CONFETTI = ['y', 'r', 'n', 'p', 'b']

// Skins are the styles /buddy skin switches between; classic is Clawd's own body color.
const SKINS: Record<string, number> = {
  classic: 0xd77757,
  ink: 0xe8e6e3,
  mint: 0x7fd1ae,
  sky: 0x7aa2f7,
  berry: 0xe07ab0,
  gold: 0xe5c07b,
}

// Which prop Clawd picks up for which tool the main agent runs.
const TOOL_PROPS: Record<string, Activity> = {
  Bash: 'laptop',
  Edit: 'hammer',
  Write: 'hammer',
  NotebookEdit: 'hammer',
  Read: 'magnify',
  Grep: 'magnify',
  Glob: 'magnify',
  WebFetch: 'magnify',
  WebSearch: 'magnify',
}

const TICK_MS: Record<Mood, number> = { idle: 700, working: 220, happy: 170, oops: 90, asleep: 900, loved: 150 }
// Moods that play once and settle back to idle, and for how many frames.
const PLAY_ONCE: Partial<Record<Mood, number>> = { happy: 14, oops: 8, loved: 10 }
const ASLEEP_AFTER_MS = 120_000
// Each idle tick may start one gesture; these are its odds, so Clawd never loops mechanically.
const GESTURE_ODDS: [Gesture, number][] = [['blink', 0.1], ['look-left', 0.05], ['look-right', 0.05], ['wave', 0.03]]

const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')
const frame = atom({ plugin: 'buddy', key: 'frame' } as const, 0)
const gesture = atom({ plugin: 'buddy', key: 'gesture' } as const, 'none')
const skin = atom({ plugin: 'buddy', key: 'skin' } as const, 'classic')
const activity = atom({ plugin: 'buddy', key: 'activity' } as const, 'think')

// A pixel is empty (undefined), Clawd's body ('C'), or a palette letter.
type Pixels = (string | undefined)[][]

const put = (canvas: Pixels, x: number, y: number, c: string) => {
  if (y >= 0 && y < H && x >= 0 && x < W) canvas[y]![x] = c
}

const stamp = (canvas: Pixels, art: string[], x: number, y: number) =>
  art.forEach((row, dy) => [...row].forEach((c, dx) => c !== '.' && put(canvas, x + dx, y + dy, c)))

// One frame: Clawd's pose for the mood and gesture, then what he is holding or wearing.
const draw = (m: Mood, f: number, g: Gesture, act: Activity): Pixels => {
  const body = CLAWD.map(r => [...r])
  const isShut = m === 'asleep' || m === 'oops' || g === 'blink'
  const isSquint = m === 'happy' || m === 'loved'
  const shift = g === 'look-left' ? -1 : g === 'look-right' || m === 'working' ? 1 : 0
  for (const col of EYE_COLS) {
    for (const row of EYE_ROWS) body[row]![col] = 'C'
    if (isShut) continue
    for (const row of isSquint ? [EYE_ROWS[1]!] : EYE_ROWS) body[row]![col + shift] = 'E'
  }
  const raise = (cols: number[]) => {
    for (const col of cols) {
      for (const row of ARM_ROWS) body[row]![col] = '.'
      for (const row of EYE_ROWS) body[row]![col] = 'C'
    }
  }
  const isBouncing = (m === 'happy' || m === 'loved') && f % 2 === 0
  if (isBouncing) raise([...ARM_COLS.left, ...ARM_COLS.right])
  if (g === 'wave' && f % 2 === 0) raise(ARM_COLS.right)
  if (m === 'working' && act === 'think') for (const col of f % 2 === 0 ? LEGS.inner : LEGS.outer) body[LEG_ROW]![col] = '.'
  if (m === 'asleep') for (const col of [...LEGS.inner, ...LEGS.outer]) body[LEG_ROW]![col] = '.'

  // Crouching between bounces, or sitting asleep, drops him a row; a shake moves him side to side.
  const ox = LEFT + (m === 'oops' ? (f % 2 === 0 ? -1 : 1) : 0)
  const oy = TOP + ((m === 'happy' || m === 'loved') && f % 2 === 1 ? 1 : m === 'asleep' ? 1 : 0)
  const canvas: Pixels = Array.from({ length: H }, () => Array<string | undefined>(W).fill(undefined))
  stamp(canvas, body.map(r => r.join('')), ox, oy)

  const arm = { x: ox + 17, y: oy + 4 }
  if (m === 'working' && act === 'laptop') {
    stamp(canvas, LAPTOP, ox + 18, oy + 3)
    // Typing: the arm taps the keys while a line of text fills the screen.
    put(canvas, arm.x, arm.y + (f % 2), 'C')
    for (let i = 0; i <= f % 5; i++) put(canvas, ox + 19 + i, oy + 4 + (Math.floor(f / 5) % 3), 'W')
  }
  if (m === 'working' && act === 'hammer') {
    const isDown = f % 2 === 1
    if (isDown) {
      for (let i = 0; i < 3; i++) put(canvas, arm.x + i, arm.y + 1, 'w')
      stamp(canvas, ['GG', 'GG', 'GG'], arm.x + 3, arm.y)
      put(canvas, arm.x + 5, arm.y + 3, 'y')
      put(canvas, arm.x + 6, arm.y + 2, 'y')
    } else {
      for (let i = 0; i < 3; i++) put(canvas, arm.x + i, arm.y - i, 'w')
      stamp(canvas, ['GGG', 'GGG'], arm.x + 2, arm.y - 4)
    }
  }
  if (m === 'working' && act === 'magnify') {
    const bob = f % 4 < 2 ? 0 : 1
    put(canvas, arm.x, arm.y + 1, 'w')
    stamp(canvas, LENS, arm.x + 1, arm.y - 3 + bob)
  }
  if (m === 'working' && act === 'think') {
    // Thought bubbles drift up and to the right of his head.
    const bubbles: [number, number][] = [[ox + 15, oy - 1], [ox + 17, oy - 2], [ox + 19, oy - 2]]
    bubbles.slice(0, (f % 4) + 1).forEach(([x, y]) => put(canvas, x, y, 'W'))
  }
  if (m === 'happy') {
    stamp(canvas, CROWN, ox + 6, oy - 2)
    for (let k = 0; k < 6; k++) {
      const x = (f * 5 + k * 7) % W
      const y = (f + k * 3) % H
      if (canvas[y]![x] === undefined) put(canvas, x, y, CONFETTI[k % CONFETTI.length]!)
    }
  }
  if (m === 'loved') stamp(canvas, HEART, ox + 6, oy - 2)
  if (m === 'asleep') stamp(canvas, NIGHTCAP, ox + 3, oy - 2)
  if (m === 'oops') put(canvas, ox + 15, oy + 1 + (f % 2), 'b')
  return canvas
}

const colorOf = (c: string | undefined, body: number) => (c === undefined ? undefined : c === 'C' ? body : PALETTE[c])

// Terminal: two pixels per cell, as Claude Code paints Clawd: the top pixel is the glyph, the bottom the cell.
const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const toCells = (px: Pixels, body: number) => {
  const words: number[] = []
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x++) {
      const top = colorOf(px[y]![x], body)
      const bottom = colorOf(px[y + 1]?.[x], body)
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(LOWER, bottom!, DEFAULT)
      else words.push(UPPER, top, bottom ?? DEFAULT)
    }
  }
  return btoa(Array.from(new Uint8Array(Uint32Array.from(words).buffer), b => String.fromCharCode(b)).join(''))
}

// Everywhere else: one crisp square per pixel; he lifts a little under the pointer and squishes when pressed.
const PX = 5
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
const toSvg = (px: Pixels, body: number) => {
  const rects = px.flatMap((r, y) => r.flatMap((c, x) => {
    const color = colorOf(c, body)
    return color === undefined ? [] : [`<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${hex(color)}"/>`]
  }))
  const style = '<style>g{transition:transform .15s;transform-origin:50% 100%}svg:hover g{transform:translateY(-3px)}svg:active g{transform:scale(1.06,.9)}</style>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PX}" height="${H * PX}" shape-rendering="crispEdges">${style}<g>${rects.join('')}</g></svg>`
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

// One timer drives Clawd at the pace his mood needs; a mood change restarts it.
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
  const plays = PLAY_ONCE[m]
  if (plays !== undefined && f + 1 >= plays) return play($, 'idle')
  if (m !== 'idle') return
  if (Date.now() - lastActiveAt > ASLEEP_AFTER_MS) return play($, 'asleep')
  const roll = Math.random()
  let edge = 0
  const picked = GESTURE_ODDS.find(([, odds]) => roll < (edge += odds))?.[0] ?? 'none'
  await update($, gesture, () => picked)
}

const pet = async ($: EngineInterface) => {
  lastActiveAt = Date.now()
  if ((await read($, mood)) !== 'working') await play($, 'loved')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'buddy', description: 'Change how Clawd looks', argumentHint: `skin ${Object.keys(SKINS).join(' | ')}` })
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
    return { text: `Clawd is now ${name}.` }
  })

  on('turn.start', async ($, e, next) => {
    lastActiveAt = Date.now()
    await update($, activity, () => 'think' as Activity)
    await play($, 'working')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const prop = e.agentId === undefined ? TOOL_PROPS[e.tool] : undefined
    if (prop) await update($, activity, () => prop)
    const ran = await next(e)
    if (prop) await update($, activity, () => 'think' as Activity)
    return ran
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
    const { Box, Button, Text } = elements
    const [m, f, g, s, act] = await Promise.all([read($, mood), read($, frame), read($, gesture), read($, skin), read($, activity)])
    const px = draw(m, f, g, act)
    const body = SKINS[s] ?? SKINS.classic!
    // The terminal paints cells; every other surface draws an Svg (each table carries the other as an empty stand-in).
    const art = e.surface === 'terminal' && 'Raster' in elements
      ? <elements.Raster key="buddy-art" columns={W} rows={H / 2} cells={toCells(px, body)} />
      : 'Svg' in elements
        ? <elements.Svg source={toSvg(px, body)} alt={`Clawd, ${m}`} isInteractive />
        : null
    if (!art) return below
    const aside = m === 'asleep' ? ['z', 'zZ', 'zZz'][f % 3]! : ''

    return pack(Box, below, (
      <Box key="buddy" flexDirection="row" alignItems="flex-end">
        {art}
        <Box flexDirection="column">
          <Text dimColor>{aside.padEnd(3)}</Text>
          <Button key="pet" plain dimColor label="♥" onPress={() => pet($)} />
        </Box>
      </Box>
    ))
  })
}
