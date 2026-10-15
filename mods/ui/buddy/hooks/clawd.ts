import type { Activity, Cue, Mood, Strain } from '../types'

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

const blank = (): Pixels => Array.from({ length: H }, () => Array<string | undefined>(W).fill(undefined))

const put = (canvas: Pixels, x: number, y: number, c: string) => {
  if (y >= 0 && y < H && x >= 0 && x < W) canvas[y]![x] = c
}

const stamp = (canvas: Pixels, art: string[], x: number, y: number) =>
  art.forEach((row, dy) => [...row].forEach((c, dx) => c !== '.' && put(canvas, x + dx, y + dy, c)))

// One frame: Clawd's pose for the mood, then what he holds or wears for what the agent is doing.
// The pixel Clawd has one prop per kind of tool; the newer kinds of work borrow the closest one.
const PIXEL_PROP: Record<Activity, Activity> = {
  think: 'think', laptop: 'laptop', hammer: 'hammer', magnify: 'magnify', notes: 'notes', web: 'web', agents: 'agents',
  test: 'laptop', git: 'laptop', install: 'laptop', build: 'hammer', ask: 'think', mcp: 'web', skill: 'notes', plan: 'think',
}

export const draw = (m: Mood, activity: Activity, f: number, strain: Strain = 'none'): Pixels => {
  const act = PIXEL_PROP[activity]
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
  const canvas = blank()
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

// A cue replaces his whole pose: the same Clawd bent, raised or seated, with what he holds or what moves around him.
// His row list picks which of his rows to draw (repeating one stretches him, skipping one squashes him) and bend
// widens (1) or narrows (-1) everything above his legs. His body is always anchored to the bottom of the box.
type Pose = { c: Pixels; ox: number; oy: number }
const ALL_ROWS = CLAWD.map((_, i) => i)
const BOTH = [...ARM_COLS.left, ...ARM_COLS.right]
const pose = ({ dx = 0, dy = 0, rows = ALL_ROWS, bend = 0 }: { dx?: number; dy?: number; rows?: number[]; bend?: -1 | 0 | 1 } = {}): Pose => {
  const base = draw('idle', 'think', 0)
  const oy = H - rows.length + dy
  const c = blank()
  rows.forEach((src, i) => {
    const row = base[TOP + src]!
    for (let x = 0; x < W; x++) {
      const [l, px, r] = [row[x - 1], row[x], row[x + 1]]
      const v = src >= LEG_ROW - 1 || bend === 0 ? px : bend > 0 ? px ?? (l || r ? 'C' : undefined) : l && px && r ? px : undefined
      if (v) put(c, x + dx, oy + i, v)
    }
  })
  return { c, ox: LEFT + dx, oy }
}
const wipe = (c: Pixels, x: number, y: number) => {
  if (c[y]) c[y]![x] = undefined
}
const eyes = ({ c, ox, oy }: Pose, how: 'shut' | 'down' | 'left' | 'right' | 'x') => {
  for (const col of EYE_COLS) {
    for (const row of EYE_ROWS) put(c, ox + col, oy + row, 'C')
    if (how === 'x') stamp(c, ['E.E', '.E.', 'E.E'], ox + col - 1, oy + EYE_ROWS[0]! - 1)
    else if (how !== 'shut') for (const row of how === 'down' ? [EYE_ROWS[1]!] : EYE_ROWS) put(c, ox + col + (how === 'left' ? -1 : how === 'right' ? 1 : 0), oy + row, 'E')
  }
}
const raise = ({ c, ox, oy }: Pose, cols: number[]) => {
  for (const col of cols) {
    for (const row of ARM_ROWS) wipe(c, ox + col, oy + row)
    for (const row of EYE_ROWS) put(c, ox + col, oy + row, 'C')
  }
}
const tap = ({ c, ox, oy }: Pose, f: number) => {
  for (const col of f % 2 === 0 ? LEGS.inner : LEGS.outer) wipe(c, ox + col, oy + LEG_ROW)
}

const QUESTION = ['yyy', '..y', '.y.', '...', '.y.']
const BANG = ['r', 'r', '.', 'r']
const SMOKE: [number, number][] = [[13, -1], [14, -2], [12, -2], [14, -1]]
const CHECK = ['..n', 'n.n', '.n.']
const CROSS = ['r.r', '.r.', 'r.r']
const TALL = [0, 1, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9]
const SQUASH = [0, 2, 3, 4, 5, 7, 8, 9]
const SQUEEZE: [number[], -1 | 0 | 1, number][] = [
  [ALL_ROWS, 0, 0], [ALL_ROWS, 0, 1], [ALL_ROWS, 0, 1], [ALL_ROWS, -1, 1], [TALL, -1, 1], [SQUASH, 1, 1], [ALL_ROWS, -1, 1], [ALL_ROWS, 0, 0], [ALL_ROWS, 0, 0],
]
const DIGITS = ['yyy/y.y/y.y/y.y/yyy', '.y./yy./.y./.y./yyy', 'yyy/..y/yyy/y../yyy', 'yyy/..y/yyy/..y/yyy', 'y.y/y.y/yyy/..y/..y', 'yyy/y../yyy/..y/yyy', 'yyy/y../yyy/y.y/yyy', 'yyy/..y/..y/.y./.y.', 'yyy/y.y/yyy/y.y/yyy', 'yyy/y.y/yyy/..y/yyy']
const AGENTS_SHOWN = 3
const MUG = ['ww.', 'www', 'ww.']
const PAGE_LINES = [4, 2, 5, 1, 4, 3, 5, 2]
const CLOUD = ['..ggggggg..', '.ggggggggg.']
const RAIN_COLS = [3, 7, 10, 15]
const BURST = [['...', '.o.', '...'], ['.o.', 'ooo', '.o.'], ['o.o', '.o.', 'o.o'], ['o.o', '...', 'o.o']]
const FLAG_DY = [0, 1, 1, 0, 0, -1, 1, 0, 0, 0]
const FLAG_POLE = [0, 2, 5, 8, 10, 10, 10, 10, 10, 10]
const FLAG_CHEER = [4, 5, 7, 8]
const FIREWORK_DY = [0, 1, -1, 0, -1, 0, 0, -1, 0, 0, 0, 0]

// One volley is a rocket that climbs three rows, then a burst that opens and fades; g counts frames since it left.
const fire = (c: Pixels, x: number, g: number, color: string) => {
  if (g >= 0 && g < 3) put(c, x + 1, 5 - g, color)
  else if (g >= 3 && g < 7) stamp(c, BURST[g - 3]!.map(r => r.replaceAll('o', color)), x, 1)
}

// ms and n match the terminal's cue, rest is the frame shown when motion is off, say names it for a screen reader.
export const PIXEL_CUES: Record<Cue, { ms: number; n: number; rest: number; say: string; art: (f: number, clones: number) => Pixels }> = {
  perm: {
    ms: 180, n: 6, rest: 0, say: 'waiting for you',
    art: f => {
      const p = pose()
      raise(p, ARM_COLS.left)
      tap(p, f)
      stamp(p.c, QUESTION, p.ox + 15, f % 2)
      return p.c
    },
  },
  error: {
    ms: 130, n: 8, rest: 6, say: 'error',
    art: f => {
      const p = pose({ dx: [0, 0, 1, -1, 1, 0, 0, 0][f]!, dy: f === 1 ? 1 : 0 })
      if (f > 0) eyes(p, 'x')
      for (const [x, y] of SMOKE.slice(0, [0, 1, 2, 3, 4, 2, 0, 0][f]!)) put(p.c, p.ox + x, p.oy + y, 'g')
      if (f >= 4) stamp(p.c, BANG, W - 1, TOP)
      return p.c
    },
  },
  pass: {
    ms: 140, n: 5, rest: 3, say: 'tests passed',
    art: f => {
      const p = pose({ dy: [1, -1, 0, 0, 0][f]! })
      if (f > 0) {
        raise(p, f === 1 ? ARM_COLS.right : BOTH)
        stamp(p.c, CHECK, p.ox + 15, p.oy - 1)
      }
      return p.c
    },
  },
  fail: {
    ms: 140, n: 5, rest: 2, say: 'tests failed',
    art: f => {
      const p = pose({ dx: [0, -1, 1, -1, 0][f]!, dy: 1 })
      eyes(p, f === 4 ? 'shut' : 'down')
      raise(p, ARM_COLS.right)
      stamp(p.c, CROSS, p.ox + 15, p.oy - 1)
      return p.c
    },
  },
  compact: {
    ms: 120, n: 9, rest: 3, say: 'compacting',
    art: f => {
      const [rows, bend, gap] = SQUEEZE[f]!
      const { c } = pose({ rows, bend })
      stamp(c, ['b.', 'bb', 'b.'], gap, 8)
      stamp(c, ['.b', 'bb', '.b'], W - 2 - gap, 8)
      return c
    },
  },
  limit: {
    ms: 300, n: 8, rest: 3, say: 'rate limited',
    art: f => {
      const p = pose({ rows: ALL_ROWS.slice(0, LEG_ROW) })
      eyes(p, f % 2 ? 'shut' : 'down')
      stamp(p.c, ['ggg', `g${f < 5 ? 'y' : '.'}g`, f < 7 ? '.y.' : '.g.', `g${f >= 3 ? 'y' : '.'}g`, 'ggg'], p.ox + 15, 1)
      return p.c
    },
  },
  agents: {
    ms: 200, n: 4, rest: 1, say: 'subagents running',
    art: (f, clones) => {
      const p = pose()
      if (f === 1) raise(p, BOTH)
      for (let i = 0; i < Math.min(clones, AGENTS_SHOWN); i++) stamp(p.c, [MINI[0]!, (f + i) % 2 ? '.C.' : MINI[1]!], p.ox + 3 + i * 4, 0)
      stamp(p.c, DIGITS[Math.min(clones, 9)]!.split('/'), p.ox + 15, 1)
      return p.c
    },
  },
  coffee: {
    ms: 250, n: 8, rest: 0, say: 'on a long tool run',
    art: f => {
      const p = pose()
      const lift = [0, 0, 1, 2, 2, 1, 0, 0][f]!
      if (lift === 2) eyes(p, 'shut')
      const top = p.oy + 4 - lift
      stamp(p.c, MUG, p.ox + 15, top)
      put(p.c, p.ox + 15 + (f % 2), top - 1, 'g')
      put(p.c, p.ox + 16 - (f % 2), top - 2, 'g')
      return p.c
    },
  },
  bigfile: {
    ms: 120, n: 12, rest: 0, say: 'reading a big file',
    art: f => {
      const p = pose()
      const [first, step] = [Math.floor(f / 4), f % 4]
      eyes(p, step === 3 ? 'left' : 'right')
      const [a, b] = [0, 1].map(i => PAGE_LINES[(first + i) % PAGE_LINES.length]!) as [number, number]
      const done = step < 3 ? Math.ceil((b * (step + 1)) / 3) : b
      const line = (len: number, read = 0) => `W${'n'.repeat(read)}${'G'.repeat(len - read)}${'W'.repeat(5 - len)}W`
      stamp(p.c, ['WWWWWWW', line(a), 'WWWWWWW', line(b, done), 'WWWWWWW'], p.ox + 5, p.oy + 5)
      return p.c
    },
  },
  offline: {
    ms: 160, n: 8, rest: 0, say: 'offline',
    art: f => {
      const p = pose()
      if (f % 4 === 3) eyes(p, 'shut')
      stamp(p.c, CLOUD, p.ox + 4, 0)
      RAIN_COLS.forEach((x, k) => put(p.c, p.ox + x, p.oy + ((f + k) % 4), 'b'))
      if (f === 6) stamp(p.c, ['.y', 'yy', 'y.'], p.ox + 7, p.oy)
      return p.c
    },
  },
  flag: {
    ms: 130, n: 10, rest: 9, say: 'planting a flag',
    art: f => {
      const p = pose({ dy: FLAG_DY[f]! })
      if (FLAG_CHEER.includes(f)) raise(p, BOTH)
      for (let i = 0; i < FLAG_POLE[f]!; i++) put(p.c, W - 1, H - 1 - i, 'w')
      if (FLAG_POLE[f] === 10) stamp(p.c, ['rr', 'rr'], W - 3, TOP)
      return p.c
    },
  },
  hello: {
    ms: 100, n: 18, rest: 12, say: 'saying hello',
    art: f => {
      const p = pose({ dx: f < 5 ? -1 : 0 })
      if (f < 10) {
        tap(p, f)
        eyes(p, 'right')
      } else if (f < 16) {
        const isWave = f % 2 === 0
        if (isWave) raise(p, ARM_COLS.right)
        stamp(p.c, ['WWW', `W${isWave ? 'y' : 'G'}W`, 'WWW'], p.ox + 15, 0)
      }
      return p.c
    },
  },
  fireworks: {
    ms: 110, n: 12, rest: 5, say: 'celebrating',
    art: f => {
      const p = pose({ dy: FIREWORK_DY[f]! })
      if (f > 1 && f < 11) raise(p, BOTH)
      const isSecond = f >= 8
      fire(p.c, W - 3, isSecond ? f - 8 : f, isSecond ? 'b' : 'y')
      fire(p.c, 0, isSecond ? f - 8 : f - 1, isSecond ? 'n' : 'r')
      return p.c
    },
  },
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
// A cue loops its own frames in place of his mood's; with motion off it holds its rest frame.
export const toSvg = (m: Mood, act: Activity, body: number, isStill: boolean, strain: Strain = 'none', cue: { name: Cue; clones: number } | null = null) => {
  const spec = cue && PIXEL_CUES[cue.name]
  const n = isStill ? 1 : spec?.n ?? LOOP[m]
  const frames = Array.from({ length: n }, (_, f) => rectsOf(spec ? spec.art(isStill ? spec.rest : f, cue!.clones) : draw(m, act, f, strain), body))
  const spans: { rects: string; from: number; to: number }[] = []
  frames.forEach((rects, f) => {
    const last = spans.at(-1)
    if (last?.rects === rects) last.to = f + 1
    else spans.push({ rects, from: f, to: f + 1 })
  })
  const dur = (n * (spec?.ms ?? FRAME_MS[m])) / 1000
  const groups = spans.length === 1
    ? `<g>${spans[0]!.rects}</g>`
    : spans.map(s => `<g opacity="0">${s.rects}<animate attributeName="opacity" calcMode="discrete" dur="${dur}s" repeatCount="indefinite" keyTimes="0;${s.from / n};${s.to / n}" values="0;1;0"/></g>`).join('')
  const loved = rectsOf(draw('loved', act, 0), body)
  const tap = isStill ? '' : `<g opacity="0">${loved}<set attributeName="opacity" to="1" begin="hit.click" dur="0.9s"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0;0 -4;0 0" begin="hit.click" dur="0.9s"/></g><animate href="#mood" attributeName="opacity" values="0;0" begin="hit.click" dur="0.9s"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * PX}" height="${H * PX}" shape-rendering="crispEdges"><g id="mood">${groups}</g>${tap}<rect id="hit" width="${W * PX}" height="${H * PX}" fill="transparent" style="cursor:pointer"/></svg>`
}
