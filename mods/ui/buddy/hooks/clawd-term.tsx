import type { ClientModule } from 'claude-code'

import type { Activity, Mood, Scene, Strain } from '../types'
import { FRAME_MS, hex, LOOP, SKINS } from './clawd'
import { BODY, CLICK_MS, CLICKS, dealClicks, FEET, HEAD, marksOf, place } from './clawd-moves'
import type { Frame, Mark, Sprite } from './clawd-moves'

// `scene` is refreshed on every draw so the one ticker always plays the latest mood.
type Local = { scene: Scene; frame: number; elapsed: number; click?: { name: string; step: number }; deck: string[]; last?: string }

const TICK_MS = 30
const PROP_W = 5

// What he is doing reads beside him: a glyph in its own color and a word.
const DOING: Record<Activity, { glyph: string; word: string; color: number }> = {
  think: { glyph: '…', word: 'thinking', color: 0xb8bcc4 },
  laptop: { glyph: '⌨', word: 'typing', color: 0x7aa2f7 },
  hammer: { glyph: '✎', word: 'editing', color: 0xf5c542 },
  magnify: { glyph: '⌕', word: 'reading', color: 0x7fd1ae },
  web: { glyph: '◎', word: 'browsing', color: 0x7aa2f7 },
  agents: { glyph: '⚑', word: 'delegating', color: 0xe07ab0 },
  notes: { glyph: '☑', word: 'planning', color: 0x5fd38d },
  test: { glyph: '◔', word: 'testing', color: 0x5fd38d },
  git: { glyph: '◆', word: 'git', color: 0xf0883e },
  install: { glyph: '↓', word: 'installing', color: 0x7fd1ae },
  build: { glyph: '▤', word: 'building', color: 0xf5c542 },
  ask: { glyph: '?', word: 'asking', color: 0xe07ab0 },
  mcp: { glyph: '↯', word: 'connecting', color: 0x7aa2f7 },
  skill: { glyph: '✦', word: 'casting', color: 0xc792ea },
  plan: { glyph: '◇', word: 'drafting', color: 0xb8bcc4 },
}

// One frame: the sprite, the prop beside him (one cell per row, PROP_W wide) and the prop's color.
type Look = Frame & { prop: string[]; tint: number }

const GREY = 0xb8bcc4
const GOLD = 0xf5c542
const RED = 0xe5484d
const at = (row: number, text: string) => [0, 1, 2].map(r => (r === row ? text : ''))
const look = (head: string, body: string, feet: string, prop: string[], tint: number, extra: Omit<Frame, 'rows'> = {}): Look => ({ rows: [head, body, feet], prop, tint, ...extra })
const SPARKS = ['✦', '✧', '⋆', '·']
const ARC = ['◜', '◠', '◝', '◞', '◡', '◟']
const arc = (i: number) => ARC[((i % ARC.length) + ARC.length) % ARC.length]!
const alternate = (f: number, a: string, b: string, every = 1) => (Math.floor(f / every) % 2 === 0 ? a : b)

// Each kind of work owns its motion. He only paces while thinking, so stepping never stands in for a prop.
const WORK: Record<Activity, (f: number) => Look> = {
  think: f => look(alternate(f, HEAD.left, HEAD.right, 4), BODY.rest, f % 2 ? FEET.step : FEET.stand, at(2 - Math.min(f % 4, 2), ['·', '∘', '○', '◯'][f % 4]!), DOING.think.color),
  laptop: f => look(HEAD.down, alternate(f, BODY.right, BODY.left), FEET.desk, [0, 1, 2].map(r => '▬'.repeat((f + 2 * r) % 4)), DOING.laptop.color),
  hammer: f => look(HEAD.open, f % 4 < 2 ? BODY.right : BODY.rest, FEET.stand, f % 4 < 2 ? ['▀█▀', ' █', ''] : ['', ' █', `▄█▄${f % 4 === 2 ? '✦' : '·'}`], DOING.hammer.color, f % 4 === 2 ? { offset: 1, dust: true } : {}),
  magnify: f => look(alternate(f, HEAD.left, HEAD.right, 3), BODY.rest, FEET.stand, f % 4 < 2 ? ['◎', ' ╲', ''] : ['', '◎', ' ╲'], DOING.magnify.color),
  web: f => look(HEAD.open, f % 4 < 2 ? BODY.both : BODY.rest, FEET.stand, at(0, `·${')'.repeat(f % 4)}`), DOING.web.color),
  agents: f => look(HEAD.open, alternate(f, BODY.both, BODY.rest), FEET.stand, f % 2 ? ['', '   ▟▙', '▟▙'] : ['', '▟▙', '   ▟▙'], DOING.agents.color),
  notes: f => look(HEAD.down, alternate(f, BODY.right, BODY.rest), FEET.stand, [0, 1, 2].map(r => (r < f % 4 ? '☑' : '☐')), DOING.notes.color),
  test: f => look(HEAD.open, BODY.rest, alternate(f, FEET.tapLeft, FEET.tapRight), at(1, `${'▰'.repeat(f % 6)}${'▱'.repeat(5 - (f % 6))}`), DOING.test.color),
  git: f => look(HEAD.open, alternate(f, BODY.right, BODY.rest, 2), FEET.stand, at(1, [0, 1, 2].map(i => (i === f % 3 ? '●' : '○')).join('─')), DOING.git.color),
  install: f => look(HEAD.open, f % 3 === 2 ? BODY.both : BODY.rest, FEET.stand, [0, 1, 2].map(r => (r === 2 ? (f % 3 === 2 ? '╰▣╯' : '╰ ╯') : r === f % 3 ? ' ▣' : '')), DOING.install.color),
  build: f => look(HEAD.down, alternate(f, BODY.left, BODY.right), FEET.stand, at(1, `${arc(f)} ${arc(-f)}`), DOING.build.color),
  ask: f => look(HEAD.open, BODY.right, alternate(f, FEET.tapLeft, FEET.tapRight, 2), at(0, f % 2 ? ' ?' : '?'), DOING.ask.color),
  mcp: f => look(HEAD.open, alternate(f, BODY.both, BODY.rest, 2), FEET.stand, at(1, ['─┤ ├─', '─┤↯├─', '─┤↯├─', '─┤ ├─'][f % 4]!), DOING.mcp.color),
  skill: f => look(HEAD.open, BODY.right, FEET.stand, [0, 1, 2].map(r => (r === f % 3 ? ` ${SPARKS[f % SPARKS.length]}` : r === (f + 1) % 3 ? '⋆' : '')), DOING.skill.color),
  plan: f => look(alternate(f, HEAD.left, HEAD.right, 4), BODY.rest, FEET.stand, at(0, f % 4 === 3 ? '◉' : '○'), DOING.plan.color),
}

// Idle blinks, glances both ways and waves one arm with a greeting at uneven beats; the other moods are one loop each.
const moodLook = (m: Mood, act: Activity, f: number): Look => {
  switch (m) {
    case 'working':
      return WORK[act](f)
    case 'happy': {
      const beat = f % 4
      const sparks = [0, 1, 2].map(r => `${' '.repeat(r % 2)}${SPARKS[(f + r) % SPARKS.length]}`)
      return beat === 0 ? look(HEAD.open, BODY.rest, FEET.stand, sparks, GOLD, { offset: 1, dust: true })
        : look(HEAD.open, BODY.both, beat === 3 ? FEET.stand : FEET.none, sparks, GOLD)
    }
    case 'asleep':
      return look(HEAD.shut, BODY.rest, FEET.sit, at(2 - (f % 3), f % 3 ? 'Z' : 'z'), GREY)
    case 'oops':
      return f % 2 ? look(HEAD.shut, BODY.rest, FEET.stand, at(0, ''), RED, { offset: 1, dust: true }) : look(HEAD.shut, BODY.both, FEET.stand, at(0, '!'), RED)
    default: {
      const beat = f % LOOP.idle
      const isWave = beat >= 34 && beat < 38
      const head = beat === 7 || beat === 23 || beat === 25 ? HEAD.shut : beat >= 12 && beat < 16 ? HEAD.left : beat >= 28 && beat < 32 ? HEAD.right : HEAD.open
      return look(head, isWave && f % 2 === 0 ? BODY.right : BODY.rest, FEET.stand, at(0, isWave ? 'hi!' : ''), GREY)
    }
  }
}

// A strain shows in the cell left of him, one row at a time: sweat falls, snow falls, a clock hand turns.
const STRAIN: Record<Exclude<Strain, 'none'>, { cells: string[]; color: number; row: (f: number) => number }> = {
  hot: { cells: ['°'], color: 0x7aa2f7, row: f => f % 3 },
  cold: { cells: ['*'], color: 0x9ad0ff, row: f => (f + 1) % 3 },
  slow: { cells: ['◴', '◷', '◶', '◵'], color: GOLD, row: () => 0 },
}

// A row's cells, each marked dim where dust or a shadow was drawn over it, grouped into runs of one look.
const runsOf = (row: string, r: number, marks: Mark[]) => {
  const cells = [...row].map(ch => ({ ch, isDim: false }))
  for (const m of marks) if (m.row === r) [...m.text].forEach((ch, i) => void (cells[m.col + i] = { ch, isDim: true }))
  return cells.reduce<{ text: string; isDim: boolean }[]>((runs, c) => {
    const last = runs.at(-1)
    return last?.isDim === c.isDim ? (last.text += c.ch, runs) : [...runs, { text: c.ch, isDim: c.isDim }]
  }, [])
}

const Clawd: ClientModule<Scene, Local> = (scene, surface) => {
  const { Box, Text } = surface.elements
  const isFirst = surface.state === undefined
  const live: Local = surface.state ?? { scene, frame: 0, elapsed: 0, deck: [] }
  live.scene = scene

  if (isFirst) {
    surface.setState(live)
    surface.every(TICK_MS, () => {
      const cur = surface.state!
      const frames = cur.click ? CLICKS[cur.click.name]! : undefined
      if (cur.scene.isStill && !frames) return
      const elapsed = cur.elapsed + TICK_MS
      if (elapsed < (frames ? CLICK_MS : FRAME_MS[cur.scene.mood])) return void (cur.elapsed = elapsed)
      const step = (cur.click?.step ?? 0) + 1
      surface.setState({ ...cur, frame: cur.frame + 1, elapsed: 0, click: cur.click && step < frames!.length ? { ...cur.click, step } : undefined })
    })
    // Each click plays the next animation from a shuffled deck, so he never does the same one twice in a row.
    surface.onPointer(e => {
      const cur = surface.state!
      if (e.type !== 'down' || cur.click || cur.scene.isStill) return
      const deck = cur.deck.length ? cur.deck : dealClicks(cur.last)
      const [name, ...rest] = deck
      surface.setState({ ...cur, click: { name: name!, step: 0 }, deck: rest, last: name, elapsed: 0 })
    })
  }

  const f = live.frame
  const body = hex(SKINS[scene.skin] ?? SKINS.classic!)
  const isClick = live.click !== undefined
  const strain = !isClick && (scene.mood === 'idle' || scene.mood === 'working') && scene.strain !== 'none' ? STRAIN[scene.strain] : undefined
  const l: Look = isClick ? { ...CLICKS[live.click!.name]![live.click!.step]!, prop: [], tint: GREY } : moodLook(scene.mood, scene.activity, f)
  const shift = strain && scene.strain === 'cold' ? f % 2 : 0
  const rows: Sprite = place({ ...l, x: (l.x ?? 0) + shift })
  const marks = marksOf(l)
  const doing = !isClick && scene.mood === 'working' ? DOING[scene.activity] : undefined

  return (
    <Box flexDirection="row" columnGap={1}>
      <Box flexDirection="column">
        {rows.map((row, r) => (
          <Text>
            <Text color={strain ? hex(strain.color) : undefined}>{strain && strain.row(f) === r ? strain.cells[f % strain.cells.length] : ' '}</Text>
            {runsOf(row, r, marks).map(run => <Text color={run.isDim ? undefined : body} dimColor={run.isDim}>{run.text}</Text>)}
            <Text> </Text>
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {[0, 1, 2].map(r => (
          <Text>
            <Text color={hex(l.tint)}>{(l.prop[r] ?? '').padEnd(PROP_W)}</Text>
            {r === 1 && doing && <Text color={hex(doing.color)}>{doing.glyph} {doing.word}</Text>}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

export default Clawd
