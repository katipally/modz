import type { Activity, Mood, Strain } from '../types'

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

// Two rows above him for hats, hearts and antennas, and a column each side for the head shake.
// Everything he holds stays inside this box, so the tile never changes size.
const TOP = 2
const LEFT = 1
export const W = LEFT + CLAWD[0]!.length + 1
export const H = TOP + CLAWD.length

// Props share Clawd's pixel style; each letter is one palette color, C is the body.
export const PALETTE: Record<string, number> = {
  E: 0x141414, // eyes
  G: 0x3a3a40, // dark metal
  g: 0xb8bcc4, // light metal
  b: 0x7aa2f7, // screen glow
  W: 0xffffff,
  w: 0x8b5a2b, // wood
  y: 0xf5c542,
  r: 0xe5484d,
  n: 0x5fd38d,
  N: 0x5a6fd6, // nightcap
}
export const SKINS: Record<string, number> = {
  classic: 0xd77757,
  ink: 0xe8e6e3,
  mint: 0x7fd1ae,
  sky: 0x7aa2f7,
  berry: 0xe07ab0,
  gold: 0xe5c07b,
}

const LAPTOP = ['GGGGGGGGG', 'GGGGgGGGG', 'GGGGGGGGG', '.ggggggggggg']
const LENS = ['.GG.', 'GbbG', 'GbbG', '.GG.']
const PAPER = ['WWWWW', 'WGGGW', 'WWWWW', 'WGGGW', 'WWWWW']
const MINI = ['CCC', 'C.C']
const HEART = ['rr.rr', '.rrr.']
const CROWN = ['y.y.y', 'yyyyy']
const NIGHTCAP = ['....NNNN.', '.NNNNNNNNW']
const CONFETTI = ['y', 'r', 'n', 'b', 'W']

// How fast each mood plays, and how many frames make one loop of it.
export const FRAME_MS: Record<Mood, number> = { idle: 300, working: 200, happy: 160, oops: 90, asleep: 900, loved: 140 }
export const LOOP: Record<Mood, number> = { idle: 40, working: 8, happy: 8, oops: 8, asleep: 3, loved: 10 }

type Gesture = 'none' | 'blink' | 'look-left' | 'look-right' | 'wave'

// Idle Clawd blinks, glances both ways and waves once per loop, at uneven beats so it never feels mechanical.
const idleGesture = (f: number): Gesture => {
  const beat = f % LOOP.idle
  if (beat === 7 || beat === 23 || beat === 25) return 'blink'
  if (beat >= 12 && beat < 16) return 'look-left'
  if (beat >= 28 && beat < 32) return 'look-right'
  if (beat >= 34 && beat < 38) return 'wave'
  return 'none'
}

// A pixel is empty (undefined) or a palette letter.
export type Pixels = (string | undefined)[][]

const put = (canvas: Pixels, x: number, y: number, c: string) => {
  if (y >= 0 && y < H && x >= 0 && x < W) canvas[y]![x] = c
}

const stamp = (canvas: Pixels, art: string[], x: number, y: number) =>
  art.forEach((row, dy) => [...row].forEach((c, dx) => c !== '.' && put(canvas, x + dx, y + dy, c)))

// One frame: Clawd's pose for the mood, then what he holds or wears for what the agent is doing.
export const draw = (m: Mood, act: Activity, f: number, strain: Strain = 'none'): Pixels => {
  const g = m === 'idle' ? idleGesture(f) : 'none'
  const isWorking = m === 'working'
  const body = CLAWD.map(r => [...r])
  const isShut = m === 'asleep' || m === 'oops' || g === 'blink'
  const isSquint = m === 'happy' || m === 'loved'
  // Over a laptop or a page he looks down; otherwise he glances where the gesture or the work points.
  const isDown = isWorking && (act === 'laptop' || act === 'notes')
  const shift = g === 'look-left' ? -1 : g === 'look-right' || (isWorking && !isDown) ? 1 : 0
  for (const col of EYE_COLS) {
    for (const row of EYE_ROWS) body[row]![col] = 'C'
    if (isShut) continue
    for (const row of isSquint || isDown ? [EYE_ROWS[1]!] : EYE_ROWS) body[row]![col + shift] = 'E'
  }
  const raise = (cols: number[]) => {
    for (const col of cols) {
      for (const row of ARM_ROWS) body[row]![col] = '.'
      for (const row of EYE_ROWS) body[row]![col] = 'C'
    }
  }
  const isBounce = (m === 'happy' || m === 'loved') && f % 2 === 0
  if (isBounce) raise([...ARM_COLS.left, ...ARM_COLS.right])
  if (g === 'wave' && f % 2 === 0) raise(ARM_COLS.right)
  if (isWorking && act === 'hammer' && f % 4 < 2) raise(ARM_COLS.right)
  if (isWorking && act === 'think') for (const col of f % 2 === 0 ? LEGS.inner : LEGS.outer) body[LEG_ROW]![col] = '.'
  if (m === 'asleep') for (const col of [...LEGS.inner, ...LEGS.outer]) body[LEG_ROW]![col] = '.'

  const ox = LEFT + (m === 'oops' ? (f % 2 === 0 ? -1 : 1) : 0)
  const oy = TOP + ((m === 'happy' || m === 'loved') && f % 2 === 1 ? 1 : m === 'asleep' ? 1 : 0)
  const canvas: Pixels = Array.from({ length: H }, () => Array<string | undefined>(W).fill(undefined))
  stamp(canvas, body.map(r => r.join('')), ox, oy)

  if (isWorking && act === 'laptop') {
    // Typing: the lid faces us, his arms tap the keys in turn and the screen's glow flickers on the lid's edge.
    stamp(canvas, LAPTOP, ox + 3, oy + 6)
    put(canvas, ox + (f % 2 === 0 ? 1 : 15), oy + 6, 'C')
    if (f % 3 !== 0) put(canvas, ox + 4 + (f % 7), oy + 5, 'b')
  }
  if (isWorking && act === 'hammer') {
    if (f % 4 < 2) {
      put(canvas, ox + 16, oy + 1, 'w')
      put(canvas, ox + 16, oy, 'w')
      stamp(canvas, ['GGG', 'GGG'], ox + 15, oy - 2)
    } else {
      put(canvas, ox + 17, oy + 5, 'w')
      put(canvas, ox + 17, oy + 6, 'w')
      stamp(canvas, ['GG', 'GG'], ox + 16, oy + 7)
      if (f % 4 === 2) put(canvas, ox + 15, oy + 9, 'y')
    }
  }
  if (isWorking && act === 'magnify') {
    // The lens drifts over his right eye, which looks bigger behind the glass.
    const bob = f % 4 < 2 ? 0 : 1
    stamp(canvas, LENS, ox + 11, oy + 1 + bob)
    stamp(canvas, ['EE', 'EE'], ox + 12, oy + 2 + bob)
    put(canvas, ox + 15, oy + 5 + bob, 'w')
  }
  if (isWorking && act === 'notes') {
    stamp(canvas, PAPER, ox + 6, oy + 5)
    // Ticks land on the page's lines one by one.
    if (f % 3 >= 1) put(canvas, ox + 7, oy + 6, 'n')
    if (f % 3 >= 2) put(canvas, ox + 7, oy + 8, 'n')
  }
  if (isWorking && act === 'web') {
    put(canvas, ox + 8, oy - 1, 'G')
    put(canvas, ox + 8, oy - 2, f % 2 === 0 ? 'r' : 'y')
    if (f % 4 < 2) {
      put(canvas, ox + 6, oy - 2, 'b')
      put(canvas, ox + 10, oy - 2, 'b')
    } else {
      put(canvas, ox + 5, oy - 1, 'b')
      put(canvas, ox + 11, oy - 1, 'b')
    }
  }
  if (isWorking && act === 'agents') {
    // Little helpers hop beside his head while subagents run.
    stamp(canvas, MINI, ox, oy - 2 + (f % 2))
    stamp(canvas, MINI, ox + 14, oy - 1 - (f % 2))
  }
  if (isWorking && act === 'think') {
    const bubbles: [number, number][] = [[ox + 13, oy - 1], [ox + 15, oy - 2], [ox + 17, oy - 2]]
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
  if (m === 'idle' || isWorking) {
    const free = (x: number, y: number, c: string) => canvas[y]?.[x] === undefined && put(canvas, x, y, c)
    // Sweat runs down his left side, snow drifts down his right, a clock hand turns above his shoulder.
    if (strain === 'hot') for (const dy of [0, 1]) free(ox, oy + (f % 4) + dy, 'b')
    if (strain === 'cold') {
      free(ox + 16, oy + (f % 4), 'W')
      free(ox + 17, oy + ((f + 2) % 4), 'W')
    }
    if (strain === 'slow') {
      stamp(canvas, ['ggg', 'gWg', 'ggg'], ox + 15, oy - 2)
      const [hx, hy] = [[1, 0], [2, 1], [1, 2], [0, 1]][f % 4]!
      put(canvas, ox + 15 + hx!, oy - 2 + hy!, 'r')
    }
  }
  return canvas
}

export const colorOf = (c: string | undefined, body: number) => (c === undefined ? undefined : c === 'C' ? body : PALETTE[c])

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

// Each run of same-colored pixels in a row becomes one rect, which keeps a whole loop of frames small.
export const PX = 4
const rectsOf = (px: Pixels, body: number) =>
  px.flatMap((row, y) => {
    const runs: string[] = []
    for (let x = 0; x < W;) {
      const color = colorOf(row[x], body)
      let end = x + 1
      while (end < W && colorOf(row[end], body) === color) end++
      if (color !== undefined) runs.push(`<rect x="${x * PX}" y="${y * PX}" width="${(end - x) * PX}" height="${PX}" fill="${hex(color)}"/>`)
      x = end
    }
    return runs
  }).join('')

// The desktop's Clawd is one Svg that animates itself: each distinct frame is a group shown for its slice of the
// loop, so the page never swaps the picture. A click on him plays the loved jump with a heart, all inside the Svg.
export const toSvg = (m: Mood, act: Activity, body: number, isStill: boolean, strain: Strain = 'none') => {
  const n = isStill ? 1 : LOOP[m]
  const frames = Array.from({ length: n }, (_, f) => rectsOf(draw(m, act, f, strain), body))
  const spans: { rects: string; from: number; to: number }[] = []
  frames.forEach((rects, f) => {
    const last = spans.at(-1)
    if (last?.rects === rects) last.to = f + 1
    else spans.push({ rects, from: f, to: f + 1 })
  })
  const dur = (n * FRAME_MS[m]) / 1000
  const groups = spans.length === 1
    ? `<g>${spans[0]!.rects}</g>`
    : spans.map(s => `<g opacity="0">${s.rects}<animate attributeName="opacity" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" keyTimes="0;${s.from / n};${s.to / n}" values="0;1;0"/></g>`).join('')
  const loved = rectsOf(draw('loved', act, 0), body)
  const tap = isStill ? '' : `<g opacity="0">${loved}<set attributeName="opacity" to="1" begin="hit.click" dur="0.9s"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0;0 -4;0 0" begin="hit.click" dur="0.9s"/></g><animate href="#mood" attributeName="opacity" values="0;0" begin="hit.click" dur="0.9s"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PX}" height="${H * PX}" shape-rendering="crispEdges"><g id="mood">${groups}</g>${tap}<rect id="hit" width="${W * PX}" height="${H * PX}" fill="transparent" style="cursor:pointer"/></svg>`
}
