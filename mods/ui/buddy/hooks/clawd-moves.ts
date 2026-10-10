// Clawd in the terminal is three rows of nine cells. A frame may push him down or sideways inside that box,
// which clips him, so one sprite can hop, hide, peek and walk out of sight without the box ever changing size.
export const ROWS = 3
export const COLS = 9

export type Sprite = [head: string, body: string, feet: string]

export const HEAD = {
  open: ' ▐▛███▜▌ ',
  shut: ' ▐█████▌ ',
  down: ' ▐▙███▟▌ ',
  left: ' ▐▜███▜▌ ',
  right: ' ▐▛███▛▌ ',
  wink: ' ▐▛████▌ ',
}
export const BODY = { rest: '▝▜█████▛▘', both: '▗▟█████▙▖', left: '▗▟█████▛▘', right: '▝▜█████▙▖' }
export const FEET = {
  stand: '  ▘▘ ▝▝  ',
  step: '  ▝▘ ▘▝  ',
  sit: '  ▀▀ ▀▀  ',
  none: '         ',
  desk: ' ▄▄▄▄▄▄▄ ',
  tapLeft: '  ▘▘     ',
  tapRight: '     ▝▝  ',
}

export const STAND: Sprite = [HEAD.open, BODY.rest, FEET.stand]
const CHEER: Sprite = [HEAD.open, BODY.both, FEET.stand]
const AIR: Sprite = [HEAD.open, BODY.both, FEET.none]
const LEFT: Sprite = [HEAD.left, BODY.rest, FEET.stand]
const RIGHT: Sprite = [HEAD.right, BODY.rest, FEET.stand]
const UP: Sprite = [HEAD.down, BODY.rest, FEET.stand]
const SHUT: Sprite = [HEAD.shut, BODY.rest, FEET.stand]
const WINK: Sprite = [HEAD.wink, BODY.rest, FEET.stand]

// Turning around, front to back and round again: each step is a little narrower than the last.
const THREE_QUARTERS: Sprite = ['  ▐█▛██▌ ', ' ▝▜████▛▘', '   ▘▘ ▝▝ ']
const EDGE: Sprite = ['   ▐██▌  ', '   ▝███▘ ', '    ▝▝   ']
const BACK: Sprite = [HEAD.shut, BODY.rest, FEET.stand]
const THREE_QUARTERS_LEFT: Sprite = [' ▐██▜█▌  ', '▝▜████▛▘ ', ' ▘▘ ▝▝   ']
const TURNAROUND = [STAND, THREE_QUARTERS, EDGE, BACK, EDGE, THREE_QUARTERS_LEFT, STAND]

// `dust` puffs on both sides of a crouch, `shadow` is the ground under a hop.
export type Frame = { rows: Sprite; offset?: number; x?: number; dust?: boolean; shadow?: boolean }
export type Mark = { row: number; col: number; text: string }

const blankRow = ' '.repeat(COLS)
const shiftRow = (row: string, x: number) =>
  x >= 0 ? (' '.repeat(Math.min(x, COLS)) + row).slice(0, COLS) : (row + ' '.repeat(Math.min(-x, COLS))).slice(Math.min(-x, COLS))

// The sprite moved down by `offset` rows and right by `x` cells, whatever leaves the box is cut off.
export const place = ({ rows, offset = 0, x = 0 }: Frame): Sprite => rows.map((_, r) => shiftRow(rows[r - offset] ?? blankRow, x)) as Sprite

export const marksOf = ({ offset = 0, dust, shadow }: Frame): Mark[] => [
  ...(dust && offset > 0 ? [{ row: ROWS - 1, col: 0, text: '·' }, { row: ROWS - 1, col: COLS - 1, text: '·' }] : []),
  ...(shadow ? [{ row: ROWS - 1, col: 3, text: '▁▁▁' }] : []),
]

const hold = (rows: Sprite, n = 1, extra: Omit<Frame, 'rows'> = {}): Frame[] => Array.from({ length: n }, () => ({ rows, ...extra }))
const crouch = (rows: Sprite = STAND, n = 2) => hold(rows, n, { offset: 1, dust: true })
const blink = [...hold(SHUT), ...hold(STAND)]
const turning = (n = 1, extra: Omit<Frame, 'rows'> = {}) => TURNAROUND.flatMap(rows => hold(rows, n, extra))
const hops = (xs: number[]) => xs.flatMap(x => [...hold(AIR, 1, { x }), ...hold(STAND, 1, { x, offset: 1, dust: true })])
const walk = (xs: number[], look: Sprite) =>
  xs.flatMap((x, i) => hold([look[0], look[1], i % 2 === 0 ? FEET.tapLeft : FEET.tapRight], 2, { x }))

export const CLICK_MS = 70

// What a click plays, one by name, each frame lasting CLICK_MS. Every one ends back on STAND.
export const CLICKS: Record<string, Frame[]> = {
  jump: [...crouch(), ...hold(AIR, 3), ...crouch(STAND, 1), ...hold(AIR, 2), ...crouch(), ...hold(CHEER, 2), ...hold(STAND)],
  look: [...hold(RIGHT, 4), ...hold(LEFT, 4), ...hold(UP, 3), ...hold(STAND)],
  spin: [...turning(), ...turning(), ...hold(CHEER, 2), ...hold(STAND)],
  peekaboo: [
    ...hold(STAND, 1, { offset: ROWS }), ...hold(STAND, 3, { offset: 2 }), ...hold(RIGHT, 3, { offset: 2 }),
    ...hold(LEFT, 3, { offset: 2 }), ...hold(STAND, 2, { offset: 2 }), ...hold(STAND, 1, { offset: 1 }), ...hold(CHEER, 3), ...blink,
  ],
  drop: [
    ...hold(CHEER, 1, { offset: -ROWS }), ...hold(CHEER, 1, { offset: -2 }), ...hold(CHEER, 1, { offset: -1 }),
    ...crouch(), ...hold(AIR, 1), ...crouch(STAND, 1), ...blink,
  ],
  wink: [...hold(WINK, 5), ...hold(STAND)],
  boop: [...crouch(SHUT, 3), ...hold(LEFT, 4), ...hold(STAND, 2), ...blink],
  tap: [
    ...[2, 2, 2, 2, 1, 1].flatMap((n, i) => hold([HEAD.open, BODY.rest, i % 2 === 0 ? FEET.tapLeft : FEET.tapRight], n)),
    ...hold(UP, 2), ...hold(CHEER, 2), ...hold(STAND),
  ],
  sneeze: [
    ...hold([HEAD.shut, BODY.both, FEET.stand], 4), ...crouch(SHUT, 2),
    ...[1, -1, 1, -1].flatMap(x => hold(SHUT, 1, { x })), ...hold(STAND, 2), ...blink,
  ],
  turn: [...turning(2), ...hold(STAND)],
  'coin-hop': [
    ...crouch(), ...TURNAROUND.slice(1, -1).flatMap(([head, body]) => hold([head, body, FEET.none], 1, { shadow: true })), ...hold(AIR, 1, { shadow: true }),
    ...crouch(STAND, 1), ...hold(CHEER, 2), ...hold(STAND),
  ],
  skip: [...hops([3, 6, COLS]), ...hops([-6, -3]), ...hold(CHEER, 2), ...hold(STAND)],
  waddle: [...walk([-2, -4, -6, -COLS], LEFT), ...hold(STAND, 3, { x: -COLS }), ...walk([COLS - 2, 6, 4, 2, 1, 0], LEFT), ...hold(STAND, 2), ...blink],
  peek: [
    ...walk([-3, -6, -COLS], LEFT), ...hold(RIGHT, 3, { x: -COLS }), ...hold(RIGHT, 4, { x: -6 }), ...hold(RIGHT, 2, { x: -COLS }),
    ...hold(CHEER, 4, { x: -5 }), ...walk([-3, -1, 0], RIGHT), ...hold(STAND, 2),
  ],
}

// Every click is played once before any repeats, and a new round never opens with the one just played.
export const dealClicks = (last?: string, random: () => number = Math.random): string[] => {
  const deck = Object.keys(CLICKS)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck[0] === last ? [...deck.slice(1), deck[0]!] : deck
}
