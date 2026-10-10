import type { ClientModule } from 'claude-code'

import type { Activity, Mood, Scene } from '../types'
import { FRAME_MS, hex, LOOP, SKINS } from './clawd'

// `scene` is refreshed on every draw so the one ticker always plays the latest mood.
type Local = { scene: Scene; frame: number; elapsed: number; lovedLeft: number }

const TICK_MS = 50
const LOVED_FRAMES = 10

// The terminal's Clawd is the one Claude Code prints on its welcome screen, three rows tall,
// so he sits beside the tiles without growing the band. Each row has its alternate poses.
const HEAD = { open: ' ▐▛███▜▌ ', shut: ' ▐█████▌ ', down: ' ▐▙███▟▌ ' }
const BODY = { rest: '▝▜█████▛▘', up: '▗▟█████▙▖' }
const FEET = { stand: '  ▘▘ ▝▝  ', step: '  ▝▘ ▘▝  ', sit: '  ▀▀ ▀▀  ', none: '         ' }

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
const ASIDE: Partial<Record<Mood, { frames: string[]; color: number }>> = {
  happy: { frames: ['✦', '✧', '⋆', '✧'], color: 0xf5c542 },
  loved: { frames: ['♥', '♡'], color: 0xe5484d },
  oops: { frames: ['!', ' '], color: 0xe5484d },
  asleep: { frames: ['z', 'zZ', 'zZz'], color: 0xb8bcc4 },
}

const moodOf = (s: Local): Mood => (s.lovedLeft > 0 ? 'loved' : s.scene.mood)

// One frame of the banner Clawd for the mood: blinks and glances in idle, steps while working,
// arms up and a hop when happy or petted, a shake when a turn goes wrong, folded legs asleep.
const pose = (m: Mood, act: Activity, f: number) => {
  const beat = f % LOOP.idle
  const isBlink = m === 'idle' && (beat === 7 || beat === 23 || beat === 25)
  const isUp = (m === 'happy' || m === 'loved') && f % 2 === 0
  const head = m === 'asleep' || m === 'oops' || isBlink ? HEAD.shut : m === 'working' && (act === 'laptop' || act === 'notes') ? HEAD.down : HEAD.open
  const body = isUp || (m === 'idle' && beat >= 34 && beat < 38 && f % 2 === 0) ? BODY.up : BODY.rest
  const feet = m === 'asleep' ? FEET.sit : isUp ? FEET.none : m === 'working' && f % 2 === 1 ? FEET.step : FEET.stand
  const shake = m === 'oops' ? (f % 2 === 0 ? 0 : 2) : 1
  return [head, body, feet].map(row => ' '.repeat(shake) + row + ' '.repeat(2 - shake))
}

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
  const body = hex(SKINS[scene.skin] ?? SKINS.classic!)
  const rows = pose(m, scene.activity, live.frame)
  const aside = ASIDE[m]
  const doing = m === 'working' ? DOING[scene.activity] : undefined
  const dots = m === 'working' && scene.activity === 'think' ? '·'.repeat((live.frame % 3) + 1) : ''

  return (
    <Box flexDirection="row" columnGap={1}>
      <Box flexDirection="column">
        {rows.map(row => <Text color={body}>{row}</Text>)}
      </Box>
      <Box flexDirection="column">
        <Text color={aside ? hex(aside.color) : undefined} dimColor={!aside}>{aside ? aside.frames[live.frame % aside.frames.length] : dots}</Text>
        {doing && <Text color={hex(doing.color)}>{doing.glyph} {doing.word}</Text>}
      </Box>
    </Box>
  )
}

export default Clawd
