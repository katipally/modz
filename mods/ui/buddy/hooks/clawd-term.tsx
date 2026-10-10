import type { ClientModule } from 'claude-code'

import type { Activity, Mood, Scene, Strain } from '../types'
import { FRAME_MS, hex, LOOP, SKINS } from './clawd'

// `scene` is refreshed on every draw so the one ticker always plays the latest mood.
type Local = { scene: Scene; frame: number; elapsed: number; lovedLeft: number }

const TICK_MS = 50
const LOVED_FRAMES = 10
const PROP_W = 5

// The terminal's Clawd is the one Claude Code prints on its welcome screen, three rows tall,
// so he sits beside the tiles without growing the band. Each row has its alternate poses.
const HEAD = { open: ' ▐▛███▜▌ ', shut: ' ▐█████▌ ', down: ' ▐▙███▟▌ ' }
const BODY = { rest: '▝▜█████▛▘', both: '▗▟█████▙▖', left: '▗▟█████▛▘', right: '▝▜█████▙▖' }
const FEET = { stand: '  ▘▘ ▝▝  ', step: '  ▝▘ ▘▝  ', sit: '  ▀▀ ▀▀  ', none: '         ', desk: ' ▄▄▄▄▄▄▄ ' }

// What he is doing reads beside him: a glyph in its own color and a word.
const DOING: Record<Activity, { glyph: string; word: string; color: number }> = {
  think: { glyph: '…', word: 'thinking', color: 0xb8bcc4 },
  laptop: { glyph: '⌨', word: 'typing', color: 0x7aa2f7 },
  hammer: { glyph: '✎', word: 'editing', color: 0xf5c542 },
  magnify: { glyph: '⌕', word: 'reading', color: 0x7fd1ae },
  web: { glyph: '◎', word: 'browsing', color: 0x7aa2f7 },
  agents: { glyph: '⚑', word: 'delegating', color: 0xe07ab0 },
  notes: { glyph: '☑', word: 'planning', color: 0x5fd38d },
}

// One frame: his three rows, the prop beside him (one cell per row, PROP_W wide) and the prop's color.
// `shift` moves only the head, so a shake never drags the whole body sideways.
type Look = { head: string; body: string; feet: string; prop: string[]; tint: number; shift?: number }

const GREY = 0xb8bcc4
const GOLD = 0xf5c542
const RED = 0xe5484d
const at = (row: number, text: string) => [0, 1, 2].map(r => (r === row ? text : ''))
const SPARKS = ['✦', '✧', '⋆', '·']
const HEARTS = ['♥', '♡']

// Each kind of work owns its motion. He only paces while thinking, so stepping never stands in for a prop.
const WORK: Record<Activity, (f: number) => Look> = {
  think: f => ({ head: HEAD.open, body: BODY.rest, feet: f % 2 ? FEET.step : FEET.stand, prop: at(2 - Math.min(f % 4, 2), ['·', '∘', '○', '◯'][f % 4]!), tint: DOING.think.color }),
  laptop: f => ({ head: HEAD.down, body: f % 2 ? BODY.left : BODY.right, feet: FEET.desk, prop: [0, 1, 2].map(r => '▬'.repeat((f + 2 * r) % 4)), tint: DOING.laptop.color }),
  hammer: f => f % 4 < 2
    ? { head: HEAD.open, body: BODY.right, feet: FEET.stand, prop: ['▀█▀', ' █', ''], tint: DOING.hammer.color }
    : { head: HEAD.open, body: BODY.rest, feet: FEET.stand, prop: ['', ' █', `▄█▄${f % 4 === 2 ? '✦' : '·'}`], tint: DOING.hammer.color },
  magnify: f => ({ head: HEAD.open, body: BODY.rest, feet: FEET.stand, prop: f % 4 < 2 ? ['◎', ' ╲', ''] : ['', '◎', ' ╲'], tint: DOING.magnify.color }),
  web: f => ({ head: HEAD.open, body: BODY.rest, feet: FEET.stand, prop: at(0, `·${')'.repeat(f % 4)}`), tint: DOING.web.color }),
  agents: f => ({ head: HEAD.open, body: BODY.rest, feet: FEET.stand, prop: f % 2 ? ['', '   ▟▙', '▟▙'] : ['', '▟▙', '   ▟▙'], tint: DOING.agents.color }),
  notes: f => ({ head: HEAD.down, body: BODY.rest, feet: FEET.stand, prop: [0, 1, 2].map(r => (r < f % 4 ? '☑' : '☐')), tint: DOING.notes.color }),
}

// Idle blinks at uneven beats and waves one arm with a greeting; the other moods are one loop each.
const look = (m: Mood, act: Activity, f: number): Look => {
  switch (m) {
    case 'working':
      return WORK[act](f)
    case 'happy':
    case 'loved': {
      const isUp = f % 2 === 0
      const mark = m === 'happy' ? SPARKS : HEARTS
      return { head: HEAD.open, body: isUp ? BODY.both : BODY.rest, feet: isUp ? FEET.none : FEET.stand, prop: [0, 1, 2].map(r => `${' '.repeat(r % 2)}${mark[(f + r) % mark.length]}`), tint: m === 'happy' ? GOLD : RED }
    }
    case 'asleep':
      return { head: HEAD.shut, body: BODY.rest, feet: FEET.sit, prop: at(2 - (f % 3), f % 3 ? 'Z' : 'z'), tint: GREY }
    case 'oops':
      return { head: HEAD.shut, body: BODY.rest, feet: FEET.stand, prop: at(0, f % 2 ? '' : '!'), tint: RED, shift: f % 2 }
    default: {
      const beat = f % LOOP.idle
      const isWave = beat >= 34 && beat < 38
      const isBlink = beat === 7 || beat === 23 || beat === 25
      return { head: isBlink ? HEAD.shut : HEAD.open, body: isWave && f % 2 === 0 ? BODY.right : BODY.rest, feet: FEET.stand, prop: at(0, isWave ? 'hi!' : ''), tint: GREY }
    }
  }
}

// A strain shows in the cell left of him, one row at a time: sweat falls, snow falls, a clock hand turns.
const STRAIN: Record<Exclude<Strain, 'none'>, { cells: string[]; color: number; row: (f: number) => number }> = {
  hot: { cells: ['°'], color: 0x7aa2f7, row: f => f % 3 },
  cold: { cells: ['*'], color: 0x9ad0ff, row: f => (f + 1) % 3 },
  slow: { cells: ['◴', '◷', '◶', '◵'], color: GOLD, row: () => 0 },
}

const moodOf = (s: Local): Mood => (s.lovedLeft > 0 ? 'loved' : s.scene.mood)

const Clawd: ClientModule<Scene, Local> = (scene, surface) => {
  const { Box, Text } = surface.elements
  const isFirst = surface.state === undefined
  const live: Local = surface.state ?? { scene, frame: 0, elapsed: 0, lovedLeft: 0 }
  live.scene = scene

  if (isFirst) {
    surface.setState(live)
    surface.every(TICK_MS, () => {
      const cur = surface.state!
      if (cur.scene.isStill && cur.lovedLeft === 0) return
      const elapsed = cur.elapsed + TICK_MS
      if (elapsed < FRAME_MS[moodOf(cur)]) return void (cur.elapsed = elapsed)
      surface.setState({ ...cur, frame: cur.frame + 1, elapsed: 0, lovedLeft: Math.max(0, cur.lovedLeft - 1) })
    })
    // A click on Clawd makes him hop with a heart, whatever he was doing.
    surface.onPointer(e => {
      if (e.type === 'down') surface.setState({ ...surface.state!, frame: 0, elapsed: 0, lovedLeft: LOVED_FRAMES })
    })
  }

  const m = moodOf(live)
  const f = live.frame
  const body = hex(SKINS[scene.skin] ?? SKINS.classic!)
  const l = look(m, scene.activity, f)
  const strain = (m === 'idle' || m === 'working') && scene.strain !== 'none' ? STRAIN[scene.strain] : undefined
  const shift = l.shift ?? (strain && scene.strain === 'cold' ? f % 2 : 0)
  const doing = m === 'working' ? DOING[scene.activity] : undefined

  return (
    <Box flexDirection="row" columnGap={1}>
      <Box flexDirection="column">
        {[l.head, l.body, l.feet].map((row, r) => (
          <Text>
            <Text color={strain ? hex(strain.color) : undefined}>{strain && strain.row(f) === r ? strain.cells[f % strain.cells.length] : ' '}</Text>
            <Text color={body}>{r === 0 ? ' '.repeat(shift) + row + ' '.repeat(1 - shift) : row + ' '}</Text>
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {l.prop.map((cell, r) => (
          <Text>
            <Text color={hex(l.tint)}>{cell.padEnd(PROP_W)}</Text>
            {r === 1 && doing && <Text color={hex(doing.color)}>{doing.glyph} {doing.word}</Text>}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

export default Clawd
