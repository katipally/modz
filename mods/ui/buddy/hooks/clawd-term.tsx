import type { ClientModule } from 'claude-code'

import type { Mood, Scene } from '../types'
import { colorOf, draw, FRAME_MS, H, hex, SKINS, W } from './clawd'

// `scene` is refreshed on every draw so the one ticker always plays the latest mood.
type Local = { scene: Scene; frame: number; elapsed: number; lovedLeft: number }

const TICK_MS = 50
const LOVED_FRAMES = 10

const moodOf = (s: Local): Mood => (s.lovedLeft > 0 ? 'loved' : s.scene.mood)

// The terminal's Clawd: two pixels per cell, the top one as the glyph's color and the bottom as the cell's.
// It runs on the surface's own clock and repaints only its region, so the band around it never redraws.
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
    // A click on Clawd makes him jump with a heart, whatever he was doing.
    surface.onPointer(e => {
      if (e.type === 'down') surface.setState({ ...surface.state!, frame: 0, elapsed: 0, lovedLeft: LOVED_FRAMES })
    })
  }

  const body = SKINS[scene.skin] ?? SKINS.classic!
  const px = draw(moodOf(live), scene.activity, live.frame)
  const rows = Array.from({ length: H / 2 }, (_, r) => {
    const cells: { text: string; color?: string; backgroundColor?: string }[] = []
    for (let x = 0; x < W; x++) {
      const top = colorOf(px[r * 2]![x], body)
      const bottom = colorOf(px[r * 2 + 1]![x], body)
      const cell = top === undefined && bottom === undefined
        ? { text: ' ' }
        : top === undefined
          ? { text: '▄', color: hex(bottom!) }
          : { text: '▀', color: hex(top), backgroundColor: bottom === undefined ? undefined : hex(bottom) }
      const last = cells.at(-1)
      if (last && last.text[0] === cell.text && last.color === cell.color && last.backgroundColor === cell.backgroundColor) last.text += cell.text
      else cells.push(cell)
    }
    return <Text>{cells.map(c => <Text color={c.color} backgroundColor={c.backgroundColor}>{c.text}</Text>)}</Text>
  })
  return <Box flexDirection="column">{rows}</Box>
}

export default Clawd
