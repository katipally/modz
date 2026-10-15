import type { Cue } from '../types'
import { AIR, BODY, CHEER, COLS, FEET, HEAD, marksOf, place, ROWS, SHUT, STAND } from './clawd-moves'
import type { Frame, Sprite } from './clawd-moves'

// A cue is Clawd's whole look for a state: his sprite in the middle, a column of cells on each side, and pins drawn over him.
// Every cell is one character, so a cue never leaves the box of its two columns and nine cells.
export type Tint = number | 'body'
export type Seg = [text: string, tint?: Tint]
export type Col = (Seg[] | '')[]
export type Pin = [row: number, col: number, text: string, tint: number]
export type CueFrame = Frame & { left?: Col; right?: Col; pins?: Pin[] }
export type Cell = { ch: string; tint?: Tint; isDim?: boolean }
type Ctx = { clones: number; hash: string }
export type CueDef = { ms: number; lw: number; rw: number; tint: number; rest: number; frames: (ctx: Ctx) => CueFrame[] }

const GREY = 0xb8bcc4
const AMBER = 0xf5c542
const GREEN = 0x5fd38d
const RED = 0xff6b6b
const BLUE = 0x7aa2f7
const CYAN = 0x9ad0ff
const PINK = 0xe07ab0
const ORANGE = 0xf0883e
const PURPLE = 0xc792ea
const MINT = 0x7fd1ae
const DIM = 0x7d7d85
const BROWN = 0xc8935a
const CLOUD = 0x9aa0aa

const SKIN = 'body'
const t = (text: string, tint?: Tint): Seg => [text, tint]
const frame = (rows: Sprite, extra: Omit<CueFrame, 'rows'> = {}): CueFrame => ({ rows, ...extra })
const crouch = (rows: Sprite, extra: Omit<CueFrame, 'rows'> = {}) => frame(rows, { offset: 1, dust: true, ...extra })

// Waiting on you: an arm up and a ? bouncing beside it.
const ASK_UP: Col = [[t('▗', SKIN), t('   ?', PINK)], [t('▐', SKIN)], '']
const ASK_MID: Col = [[t('▗', SKIN)], [t('▐', SKIN), t('  ?', PINK)], '']
const asking = (feet: string, head: string, right: Col) => frame([head, BODY.left, feet], { right })
const PERM = [
  asking(FEET.tapLeft, HEAD.open, ASK_MID), asking(FEET.tapLeft, HEAD.open, ASK_UP), asking(FEET.tapRight, HEAD.open, ASK_UP),
  asking(FEET.tapRight, HEAD.open, ASK_MID), asking(FEET.tapLeft, HEAD.right, ASK_MID), asking(FEET.tapRight, HEAD.right, ASK_UP),
]

// Tool error: x eyes over the head cells, a smoke puff, then a red ! that holds.
const X_EYES: Pin[] = [[0, 3, 'x', RED], [0, 5, 'x', RED]]
const dead = (extra: Omit<CueFrame, 'rows'>, right: Col) => frame(STAND, { pins: X_EYES, right, ...extra })
const ERROR = [
  frame(STAND),
  dead({ offset: 1, dust: true }, ['', '', [t(' ∘', GREY)]]),
  dead({ x: 1 }, ['', [t(' ○', GREY)], '']),
  dead({ x: -1 }, [[t(' ◯', GREY)], [t(' ○', GREY)], '']),
  dead({ x: 1 }, [[t('  ◯', GREY)], [t(' !', RED)], '']),
  dead({}, [[t('  ◌', GREY)], [t(' !', RED)], '']),
  dead({}, ['', [t(' !', RED)], '']),
  dead({}, ['', [t(' !', RED)], '']),
  dead({}, ['', [t(' !', RED)], '']),
]

// Test verdict: a hop and a check, or a droop and a cross, on a little sign.
const sign = (mark: string, tint: number): Col => [[t(' ┌─┐', GREY)], [t(' │', GREY), t(mark, tint), t('│', GREY)], [t(' └┬┘', GREY)]]
const SLUMP: Sprite = [HEAD.down, BODY.rest, FEET.stand]
const ticked = (rows: Sprite) => frame(rows, { right: sign('✔', GREEN) })
const PASS = [crouch(STAND), ticked(AIR), ticked(CHEER), ticked(CHEER), ticked(AIR), ticked(CHEER), ticked(CHEER), ticked(CHEER)]
const crossed = (rows: Sprite, x = 0) => frame(rows, { x, right: sign('✘', RED) })
const FAIL = [crossed(SLUMP), crossed(SLUMP, -1), crossed(SLUMP, 1), crossed(SLUMP, -1), crossed(SLUMP, 1), crossed(SHUT), crossed(SHUT), crossed(SHUT)]

// Compacting: arrows close in on him, he pinches tall, then springs wide.
const PINCH: Sprite = ['  ▐▛█▜▌  ', ' ▝▜███▛▘ ', '  ▘▘ ▝▝  ']
const PINCH_TALL: Sprite = ['   ▐█▌   ', '  ▝▜█▛▘  ', '   ▘ ▝   ']
const SQUASH: Sprite = ['         ', '▐▛█████▜▌', ' ▀▀▀▀▀▀▀ ']
const squeeze = (gap: number, rows: Sprite) => frame(rows, { left: ['', [t(' '.repeat(gap) + '▶', CYAN)], ''], right: ['', [t(' '.repeat(3 - gap) + '◀', CYAN)], ''] })
const COMPACT = [
  squeeze(0, STAND), squeeze(1, STAND), squeeze(2, STAND), squeeze(3, PINCH), squeeze(3, PINCH_TALL),
  squeeze(2, SQUASH), squeeze(1, PINCH), squeeze(0, STAND), squeeze(0, STAND),
]

// Rate limited: he sits and waits while the sand runs out.
const SAND_TOP = ['▀▀▀', '▀▀▀', '▀▀ ', ' ▀▀', ' ▀ ', ' ▀ ', '  ·', '   ']
const SAND_LOW = ['▁▁▁', '▁▁▁', '▂▂▂', '▂▂▂', '▃▃▃', '▃▃▃', '▄▄▄', '▄▄▄']
const LIMIT = SAND_TOP.map((top, i) =>
  frame([i % 2 ? HEAD.shut : HEAD.down, BODY.rest, FEET.sit], { right: [[t(` ${top}`, AMBER)], [t(i < 7 ? ' ┊' : '  ', AMBER)], [t(` ${SAND_LOW[i]}`, AMBER)]] }))

// Subagents busy: one tiny clone per running subagent, at most three drawn, the real number beside them.
const clonePair = (slot: number, shown: number, isPop: boolean) => (slot < shown ? t('▟▙', PINK) : slot === shown && isPop ? t(' ✦', AMBER) : t('  ', PINK))
const clones = (shown: number, count: number, isPop: boolean) => frame([HEAD.open, isPop ? BODY.both : BODY.rest, FEET.stand], {
  right: [[t(` ×${count}`, PINK)], [t(' ', PINK), clonePair(2, shown, isPop), t(' ', PINK), clonePair(1, shown, isPop)], [t(' ', PINK), clonePair(0, shown, isPop)]],
})
const AGENTS_SHOWN = 3

// Long tool run: he sips coffee while the steam curls.
const cup = (pad: number, steam: string, head: string) => frame([head, BODY.right, FEET.stand], {
  right: [[t(' '.repeat(pad + 1) + steam, GREY)], [t(' '.repeat(pad) + '╭─╮)', BROWN)], [t(' '.repeat(pad) + '╰─╯', BROWN)]],
})
const COFFEE = [
  cup(2, '∿', HEAD.open), cup(2, '~', HEAD.open), cup(1, '∿', HEAD.open), cup(0, '~', HEAD.shut),
  cup(0, '∿', HEAD.shut), cup(1, '~', HEAD.open), cup(2, '∿', HEAD.open), cup(2, '~', HEAD.shut),
]

// Reading a big file: his eyes sweep a line, snap back, and the page scrolls.
const BARS = ['▬▬▬▬▬', '▬▬▬', '▬▬▬▬▬▬▬', '▬▬', '▬▬▬▬▬▬', '▬▬▬▬', '▬▬▬▬▬▬▬▬', '▬▬▬']
const scan = (f: number) => {
  const first = Math.floor(f / 4)
  const step = f % 4
  const bar = (i: number) => BARS[(first + i) % BARS.length]!
  const current = bar(1)
  const read = step < 3 ? Math.ceil((current.length * (step + 1)) / 3) : current.length
  return frame([step === 3 ? HEAD.left : HEAD.right, BODY.rest, FEET.stand], {
    right: [[t(`  ${bar(0)}`, DIM)], [t('▸ ', MINT), t(current.slice(0, read), MINT), t(current.slice(read), DIM)], [t(`  ${bar(2)}`, DIM)]],
  })
}
const BIG_FILE = Array.from({ length: 24 }, (_, f) => scan(f))

// Offline: a private rain cloud with a lightning flash.
const RAIN = ['  ╷ ╷  ', ' ╷ ╷ ╷ ', '  ╵ ╵  ', ' ╵ ╵ ╵ ']
const OFFLINE = Array.from({ length: 8 }, (_, f) => frame([f % 4 === 3 ? HEAD.shut : HEAD.right, BODY.rest, FEET.stand], {
  right: [[t('  ▗██▖', CLOUD)], f === 6 ? [t(' ▟█', CLOUD), t('↯', AMBER), t('█▙', CLOUD)] : [t(' ▟███▙', CLOUD)], [t(RAIN[f % 4]!, BLUE)]],
}))

// Plants a flag: the pole goes up, the flag opens and the short hash types in beside it.
const flagged = (pole: number, hasFlag: boolean, hash: string): Col => [
  hasFlag ? [t(' ⚑', ORANGE)] : '',
  pole >= 2 ? [t(' ┃', ORANGE), t(hash && ` ${hash}`, GREY)] : '',
  pole >= 1 ? [t(' ┃', ORANGE)] : '',
]
const flag = (hash: string) => [
  frame(STAND), crouch(SHUT, { right: flagged(1, false, '') }), crouch(STAND, { right: flagged(2, false, '') }), frame(STAND, { right: flagged(2, true, '') }),
  frame(CHEER, { right: flagged(2, true, hash.slice(0, 2)) }), frame(AIR, { right: flagged(2, true, hash.slice(0, 4)) }),
  crouch(STAND, { right: flagged(2, true, hash) }), frame(CHEER, { right: flagged(2, true, hash) }), frame(CHEER, { right: flagged(2, true, hash) }),
  frame(STAND, { right: flagged(2, true, hash) }),
]

// Hello: he walks in from the left edge on the real walk frames, waves and says hi.
const HELLO = [
  ...[-8, -6, -4, -2, 0].flatMap(x => [frame([HEAD.right, BODY.rest, FEET.tapLeft], { x }), frame([HEAD.right, BODY.rest, FEET.tapRight], { x })]),
  ...[BODY.right, BODY.left, BODY.right, BODY.left, BODY.right, BODY.left].map((body, i) => frame([HEAD.open, body, FEET.stand], { right: [[t(i % 2 ? ' hi!' : ' hi', AMBER)], '', ''] })),
  frame(STAND), frame(STAND),
]

// Big finish: two volleys of fireworks, then a cheer.
const burstRight = (step: number, tint: number): Col =>
  [['       ', '   ✦   ', '       '], ['   ·   ', ' · ✦ · ', '   ·   '], ['·  ✧  ·', '✧  ✦  ✧', '·  ✧  ·'], ['·     ·', '       ', '·     ·']][step]!.map(row => [t(` ${row}`, tint)])
const burstLeft = (step: number, tint: number): Col =>
  [['     ', '  ✦  ', '     '], ['  ·  ', ' ·✦· ', '  ·  '], ['·   ·', '  ✧  ', '·   ·'], ['     ', '·   ·', '     ']][step]!.map(row => [t(row, tint)])
const rocket = (row: number, text: string, tint: number): Col => [0, 1, 2].map(r => (r === row ? [t(text, tint)] : ''))
const show = (rows: Sprite, right: Col | undefined, left: Col | undefined, extra: Omit<CueFrame, 'rows'> = {}) => frame(rows, { right, left, ...extra })
const FIREWORKS = [
  show(STAND, rocket(2, '   ╷', AMBER), undefined),
  show(STAND, rocket(1, '   ╷', AMBER), rocket(2, '  ╷', PINK), { offset: 1, dust: true }),
  show(AIR, rocket(0, '   ╷', AMBER), rocket(1, '  ╷', PINK)),
  show(CHEER, burstRight(0, AMBER), rocket(0, '  ╷', PINK)),
  show(AIR, burstRight(1, AMBER), burstLeft(0, PINK)),
  show(CHEER, burstRight(2, AMBER), burstLeft(1, PINK)),
  show(CHEER, burstRight(3, AMBER), burstLeft(2, PINK)),
  show(AIR, undefined, burstLeft(3, PINK)),
  show(CHEER, burstRight(0, PURPLE), burstLeft(0, MINT)),
  show(CHEER, burstRight(1, PURPLE), burstLeft(1, MINT)),
  show(CHEER, burstRight(2, PURPLE), burstLeft(2, MINT)),
  show(STAND, burstRight(3, PURPLE), burstLeft(3, MINT)),
]

// `ms` is one frame, `lw` and `rw` the width of the columns, `rest` the frame shown when motion is off.
export const CUES: Record<Cue, CueDef> = {
  perm: { ms: 180, lw: 0, rw: 8, tint: PINK, rest: 0, frames: () => PERM },
  error: { ms: 170, lw: 0, rw: 8, tint: GREY, rest: 6, frames: () => ERROR },
  pass: { ms: 190, lw: 0, rw: 8, tint: GREY, rest: 3, frames: () => PASS },
  fail: { ms: 190, lw: 0, rw: 8, tint: GREY, rest: 2, frames: () => FAIL },
  compact: { ms: 120, lw: 4, rw: 4, tint: CYAN, rest: 3, frames: () => COMPACT },
  limit: { ms: 300, lw: 0, rw: 5, tint: AMBER, rest: 3, frames: () => LIMIT },
  agents: {
    ms: 200, lw: 0, rw: 9, tint: PINK, rest: 1,
    frames: ({ clones: count }) => [false, true, false, false].map(isPop => clones(Math.min(count, AGENTS_SHOWN), count, isPop)),
  },
  coffee: { ms: 250, lw: 0, rw: 7, tint: GREY, rest: 0, frames: () => COFFEE },
  bigfile: { ms: 125, lw: 0, rw: 10, tint: DIM, rest: 0, frames: () => BIG_FILE },
  offline: { ms: 160, lw: 0, rw: 8, tint: CLOUD, rest: 0, frames: () => OFFLINE },
  flag: { ms: 150, lw: 0, rw: 10, tint: ORANGE, rest: 9, frames: ({ hash }) => flag(hash) },
  hello: { ms: 100, lw: 0, rw: 6, tint: AMBER, rest: 12, frames: () => HELLO },
  fireworks: { ms: 130, lw: 5, rw: 9, tint: AMBER, rest: 5, frames: () => FIREWORKS },
}

// A one-shot plays its frames once; these stay up for longer, because what they say outlasts one pass.
const HOLD_MS: Partial<Record<Cue, number>> = { offline: 20_000, bigfile: 3_000 }
export const playMs = (cue: Cue) => HOLD_MS[cue] ?? CUES[cue].frames({ clones: 1, hash: '' }).length * CUES[cue].ms

const cellsOf = (col: Col[number] | undefined, width: number, tint: number): Cell[] => {
  const cells = (col || []).flatMap(([text, own]) => [...text].map(ch => ({ ch, tint: own ?? tint })))
  return Array.from({ length: width }, (_, i) => cells[i] ?? { ch: ' ', tint })
}

// The three rows of a frame as cells: left column, sprite, right column. A pin sits over the sprite where he stands now.
export const cueRows = (def: CueDef, fr: CueFrame): Cell[][] => {
  const sprite = place(fr)
  const marks = marksOf(fr)
  const lead = Math.max(def.lw, 1)
  return Array.from({ length: ROWS }, (_, r) => {
    const body: Cell[] = [...sprite[r]!].map(ch => ({ ch, tint: SKIN }))
    for (const m of marks) if (m.row === r) [...m.text].forEach((ch, i) => void (body[m.col + i] = { ch, isDim: true }))
    for (const [row, col, ch, tint] of fr.pins ?? []) {
      const c = col + (fr.x ?? 0)
      if (row + (fr.offset ?? 0) === r && c >= 0 && c < COLS) body[c] = { ch, tint }
    }
    return [...cellsOf(fr.left?.[r], lead, def.tint), ...body, ...cellsOf(fr.right?.[r], def.rw, def.tint)]
  })
}
