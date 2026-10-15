// Renders the buddy mod's real frame data to SVGs in docs/sheets. Run: node mods/ui/buddy/scripts/sheets.mjs
// Imports the hook modules directly (Node strips their types), so the docs cannot drift from the code.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

// The hooks import each other without extensions, which the bundler resolves and Node does not.
registerHooks({ resolve: (spec, ctx, next) => next(/^\.\.?\/[^.]*$/.test(spec) ? `${spec}.ts` : spec, ctx) })
const { BODY, CLICK_MS, CLICKS, COLS, FEET, HEAD, marksOf, place, ROWS } = await import('../hooks/clawd-moves.ts')
const { colorOf, draw, FRAME_MS, H, hex, LOOP, PIXEL_CUES, SKINS, W } = await import('../hooks/clawd.ts')
const { CUES, cueRows, playMs } = await import('../hooks/clawd-cues.ts')

const root = new URL('..', import.meta.url)
const out = fileURLToPath(new URL('docs/sheets/', root))

// Mood, Activity and Strain are types, not values, so the unions are read from the type file.
const unionOf = name => {
  const src = readFileSync(new URL('types/index.d.ts', root), 'utf8')
  const body = src.match(new RegExp(`export type ${name} =([^]*?)(?:\\n\\n|\\n(?=export|declare))`))?.[1]
  if (!body) throw new Error(`type ${name} not found in types/index.d.ts`)
  return [...body.matchAll(/'([^']+)'/g)].map(m => m[1])
}
const MOODS = Object.keys(FRAME_MS)
const ACTIVITIES = unionOf('Activity')
const STRAINS = unionOf('Strain').filter(s => s !== 'none')

const BG = '#1b1b1f'
const CELL = '#26262b'
const MUTED = '#8a8a92'
const CLASSIC = hex(SKINS.classic)
const SANS = `-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`
const MONO = `Menlo,Consolas,'DejaVu Sans Mono','Liberation Mono',monospace`
const PAD = 14
const SHEET_COLS = 8
const n3 = x => +x.toFixed(3)
const n5 = x => +x.toFixed(5)

const svg = (w, h, style, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${style}</style><rect width="${w}" height="${h}" rx="10" fill="${BG}"/>${body}</svg>\n`
const STYLE = `.m{font-family:${MONO};font-size:22px;fill:${CLASSIC}}.d{fill-opacity:.5}.t{font-family:${SANS};font-size:11px;fill:${MUTED}}.n{font-family:${SANS};font-size:10px;fill:${MUTED};text-anchor:middle}.e{text-anchor:end}`

// Each distinct run of identical frames becomes one group, visible for its slice of the loop (discrete SMIL).
const animate = (frames, ms, drawFrame) => {
  const n = frames.length
  const spans = []
  frames.forEach((f, i) => {
    const content = drawFrame(f)
    const last = spans.at(-1)
    if (last?.content === content) last.to = i + 1
    else spans.push({ content, from: i, to: i + 1 })
  })
  if (spans.length === 1) return `<g>${spans[0].content}</g>`
  const dur = `${n3((n * ms) / 1000)}s`
  return spans.map(({ content, from, to }) => {
    const times = from > 0 ? [0, from, ...(to < n ? [to] : [])] : [0, to]
    const values = from > 0 ? ['hidden', 'visible', ...(to < n ? ['hidden'] : [])] : ['visible', 'hidden']
    return `<g visibility="hidden">${content}<animate attributeName="visibility" calcMode="discrete" dur="${dur}" repeatCount="indefinite" keyTimes="${times.map(t => n5(t / n)).join(';')}" values="${values.join(';')}"/></g>`
  }).join('')
}

const caption = (x, y, text, cls = 't') => `<text class="${cls}" x="${x}" y="${y}">${text}</text>`
const frameCount = n => `${n} frame${n === 1 ? '' : 's'}`

// Terminal Clawd: three rows of nine cells, every glyph on its own cell so no font can shift the sprite.
const CW = 14
const CH = 26
const termFrame = frame => {
  const marks = marksOf(frame)
  return place(frame).map((row, r) => {
    const cells = [...row].map(ch => ({ ch, dim: false }))
    for (const m of marks) if (m.row === r) [...m.text].forEach((ch, i) => void (cells[m.col + i] = { ch, dim: true }))
    return [false, true].map(dim => {
      const picked = cells.flatMap((c, i) => (c.dim === dim && c.ch !== ' ' ? [{ ...c, x: i * CW }] : []))
      return picked.length ? `<text class="m${dim ? ' d' : ''}" x="${picked.map(c => c.x).join(' ')}" y="${r * CH + CH - 6}">${picked.map(c => c.ch).join('')}</text>` : ''
    }).join('')
  }).join('')
}
const TW = COLS * CW
const TH = ROWS * CH

// A cue frame is the sprite between two columns of cells; each cell keeps its own tint, and the skin's color stands for 'body'.
const cueFrame = (def, fr) =>
  cueRows(def, fr).map((row, r) => {
    const groups = new Map()
    row.forEach((c, i) => {
      if (c.ch === ' ') return
      const fill = hex(c.tint === undefined || c.tint === 'body' ? SKINS.classic : c.tint)
      const key = `${fill}${c.isDim ? ' d' : ''}`
      groups.set(key, [...(groups.get(key) ?? []), { ch: c.ch, x: i * CW }])
    })
    return [...groups].map(([key, cs]) => `<text class="m${key.endsWith(' d') ? ' d' : ''}" style="fill:${key.slice(0, 7)}" x="${cs.map(c => c.x).join(' ')}" y="${r * CH + CH - 6}">${cs.map(c => c.ch).join('')}</text>`).join('')
  }).join('')
const cueWidth = def => (Math.max(def.lw, 1) + COLS + def.rw) * CW

// Pixel Clawd: one rect per run of same-colored pixels, in pixel units, scaled by the caller.
const pixelFrame = (px, body) =>
  px.flatMap((row, y) => {
    const runs = []
    for (let x = 0; x < W;) {
      const color = colorOf(row[x], body)
      let end = x + 1
      while (end < W && colorOf(row[end], body) === color) end++
      if (color !== undefined) runs.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${hex(color)}"/>`)
      x = end
    }
    return runs
  }).join('')

const files = []
const emit = (file, kind, name, frames, msPerFrame, content) => {
  writeFileSync(out + file, content)
  files.push({ name, kind, file, frames, msPerFrame })
}

// One looping animation and one frame-by-frame sheet for the same list of frames.
const family = ({ id, kind, label, frames, ms, w, h, art, scale = 1, sheetCols = SHEET_COLS }) => {
  const n = frames.length
  const cap = `${label} · ${frameCount(n)} · ${ms} ms each`
  const aw = w * scale
  const ah = h * scale
  const width = Math.max(aw + PAD * 2, 190)
  const x0 = (width - aw) / 2
  const g = c => `<g transform="translate(${x0} ${PAD}) scale(${scale})">${c}</g>`
  emit(`${id}.svg`, kind, id, n, ms, svg(width, ah + PAD * 2 + 16, STYLE, `${g(animate(frames, ms, f => art(f)))}${caption(width / 2, ah + PAD + 22, cap, 'n')}`))

  const cols = Math.min(n, sheetCols)
  const cw = aw + 16
  const rowH = ah + 32
  const sheetW = Math.max(cols * cw + PAD * 2, 260)
  const sheetH = 34 + Math.ceil(n / cols) * rowH + PAD
  const cells = frames.map((f, i) => {
    const x = PAD + (i % cols) * cw
    const y = 34 + Math.floor(i / cols) * rowH
    return `<rect x="${x}" y="${y}" width="${cw - 6}" height="${rowH - 6}" rx="6" fill="${CELL}"/><g transform="translate(${x + 5} ${y + 8}) scale(${scale})">${art(f)}</g>${caption(x + (cw - 6) / 2, y + ah + 22, i + 1, 'n')}`
  }).join('')
  emit(`${id}-sheet.svg`, `${kind}-sheet`, `${id}-sheet`, n, ms, svg(sheetW, sheetH, STYLE, `${caption(PAD, 22, cap)}${cells}`))
}

mkdirSync(out, { recursive: true })
for (const f of readdirSync(out)) if (f.endsWith('.svg') || f === 'index.json') rmSync(out + f)

for (const [name, frames] of Object.entries(CLICKS)) {
  family({ id: `term-click-${name}`, kind: 'term-click', label: name, frames, ms: CLICK_MS, w: TW, h: TH, art: f => termFrame(f) })
}

// The agents cue shows a clone count, and a flag shows the commit hash; these stand in for them.
const CUE_CTX = { clones: 2, hash: '1a2b3c4' }
for (const [name, def] of Object.entries(CUES)) {
  family({ id: `term-cue-${name}`, kind: 'term-cue', label: name, frames: def.frames(CUE_CTX), ms: def.ms, w: cueWidth(def), h: TH, art: f => cueFrame(def, f), sheetCols: Math.max(1, Math.floor(1000 / (cueWidth(def) + 16))) })
}

const PX_SCALE = 6
const pixelFamily = (id, kind, label, mood, activity, strain) =>
  family({
    id, kind, label, ms: FRAME_MS[mood], w: W, h: H, scale: PX_SCALE,
    frames: Array.from({ length: LOOP[mood] }, (_, f) => draw(mood, activity, f, strain)),
    art: px => pixelFrame(px, SKINS.classic),
  })

for (const mood of MOODS) pixelFamily(`pixel-${mood}`, 'pixel-mood', mood, mood, 'think', 'none')

// Activities that borrow another's prop draw identical frames, so only the first of each look is written.
const seen = new Map()
const aliases = {}
for (const activity of ACTIVITIES) {
  const key = JSON.stringify(Array.from({ length: LOOP.working }, (_, f) => draw('working', activity, f)))
  if (seen.has(key)) aliases[activity] = seen.get(key)
  else {
    seen.set(key, activity)
    pixelFamily(`pixel-prop-${activity}`, 'pixel-prop', `working: ${activity}`, 'working', activity, 'none')
  }
}
for (const strain of STRAINS) pixelFamily(`pixel-strain-${strain}`, 'pixel-strain', `strain: ${strain} (working, thinking)`, 'working', 'think', strain)

for (const [name, spec] of Object.entries(PIXEL_CUES)) {
  family({ id: `pixel-cue-${name}`, kind: 'pixel-cue', label: name, frames: Array.from({ length: spec.n }, (_, f) => spec.art(f, CUE_CTX.clones)), ms: spec.ms, w: W, h: H, scale: PX_SCALE, art: px => pixelFrame(px, SKINS.classic) })
}

const skins = Object.entries(SKINS)
const skinW = skins.length * (W * PX_SCALE + 16) + PAD * 2 - 10
const skinCells = skins.map(([name, color], i) => {
  const x = PAD + i * (W * PX_SCALE + 16)
  return `<rect x="${x}" y="34" width="${W * PX_SCALE + 10}" height="${H * PX_SCALE + 40}" rx="6" fill="${CELL}"/><g transform="translate(${x + 5} 42) scale(${PX_SCALE})">${pixelFrame(draw('idle', 'think', 0), color)}</g>${caption(x + (W * PX_SCALE + 10) / 2, 42 + H * PX_SCALE + 14, name, 'n')}${caption(x + (W * PX_SCALE + 10) / 2, 42 + H * PX_SCALE + 27, hex(color), 'n')}`
}).join('')
emit('pixel-skins.svg', 'pixel-skins', 'pixel-skins', skins.length, null, svg(skinW, H * PX_SCALE + 84, STYLE, `${caption(PAD, 22, `skins · idle frame 1`)}${skinCells}`))

// SPRITES.md keeps its hand-written prose; only the regions between these markers are rewritten.
const splice = (text, name, body) => {
  const re = new RegExp(`(<!-- ${name}:start -->\\n)[^]*?(<!-- ${name}:end -->)`)
  if (!re.test(text)) throw new Error(`marker ${name} missing in docs/SPRITES.md`)
  return text.replace(re, (_, a, b) => `${a}${body}\n${b}`)
}
const img = (file, alt) => `<img src="sheets/${file}" alt="${alt}">`
const entry = (id, title, line, h = '####') => `${h} ${title}\n\n${line}\n\n${img(`${id}.svg`, `${title} animation`)}\n\n${img(`${id}-sheet.svg`, `${title} frames`)}\n`
const glyphs = table => `\`\`\`\n${Object.entries(table).map(([k, v]) => `${k.padEnd(9)}|${v}|`).join('\n')}\n\`\`\`\n`
const bySize = (n, ms) => `${frameCount(n)} at ${ms} ms, loop ${n * ms} ms`
const parts = `### HEAD\n\n${glyphs(HEAD)}\n### BODY\n\n${glyphs(BODY)}\n### FEET\n\n${glyphs(FEET)}`
const clicks = Object.entries(CLICKS).map(([name, fr]) => entry(`term-click-${name}`, name, `${bySize(fr.length, CLICK_MS)}.`, '###')).join('\n')
const pixel = [
  '### Moods\n',
  ...MOODS.map(m => entry(`pixel-${m}`, m, `${bySize(LOOP[m], FRAME_MS[m])}.`)),
  '### Activity props (working mood)\n',
  ...Object.values(Object.fromEntries(seen)).map(a => entry(`pixel-prop-${a}`, a, `${bySize(LOOP.working, FRAME_MS.working)}. Also used for: ${Object.entries(aliases).filter(([, v]) => v === a).map(([k]) => k).join(', ') || 'nothing else'}.`)),
  '### Strain reactions (working, thinking)\n',
  ...STRAINS.map(st => entry(`pixel-strain-${st}`, st, `${bySize(LOOP.working, FRAME_MS.working)}.`)),
  `### Skins\n\n| Skin | Hex |\n| --- | --- |\n${skins.map(([k, v]) => `| ${k} | \`${hex(v)}\` |`).join('\n')}\n\n${img('pixel-skins.svg', 'Skins')}\n`,
].join('\n')
// Triggers live in hooks/register.tsx and are not importable, so they are written here; a cue without one stops the run.
const TRIGGERS = {
  perm: 'A permission prompt opens on you (`tool.check` asks and nobody else decides). Loops until that tool call ends or the main turn completes.',
  error: 'A main-agent tool result is an error, or the tool threw, and it was not a test run, a denial or a background start. Plays once.',
  pass: 'A test command succeeds: `npm`, `pnpm`, `yarn` or `bun` `test`, `pytest`, `jest`, `vitest`, `mocha`, `phpunit`, `rspec`, `go`, `cargo`, `mvn`, `gradle`, `dotnet`, `deno`, `swift` or `flutter` `test`, `claude plugin test`. Plays once.',
  fail: 'The same test commands fail. Plays once.',
  compact: 'Context compaction: `session.compact` of the main agent, plus an always-on fallback for hosts that never send it (the request carries fewer than half the previous messages, from 6 messages up). Loops while it runs; the fallback shows it for one pass.',
  limit: 'A rate limit is at 100% (`session.measure`) or a turn stopped on a rate limit (`classic.StopFailure`). Loops until a main turn ends with an answer.',
  agents: 'Subagents spawned by the main agent (not nested, not workflow) are still running. Shows clones and the count, up to 3 clones, while the main chat is not in a turn, so it also shows after the main turn ended.',
  coffee: 'A main-agent tool (not `Agent`) has run for 30 seconds. Loops until it returns.',
  bigfile: 'A `Read` returns 500 or more lines. Stays up for a few seconds.',
  offline: 'A main turn ends with an error and no rate limit is showing, which is taken for the network. Stays up until the next answer or its time runs out.',
  flag: 'A `git commit`, `git push` or `gh pr create` succeeds (not `--dry-run`). A commit shows its short hash. Plays once.',
  hello: 'A fresh launch: the session starts with an empty transcript (resumes and `/clear` do not count). Plays once.',
  fireworks: 'A main turn ends with an answer after 5 minutes or more. Plays once.',
}
const cuesBody = Object.entries(CUES).map(([name, def]) => {
  const spec = PIXEL_CUES[name]
  if (!TRIGGERS[name]) throw new Error(`cue ${name} has no trigger text in scripts/sheets.mjs`)
  const frames = def.frames(CUE_CTX)
  const held = playMs(name) === frames.length * def.ms ? '' : ` Held for ${playMs(name)} ms.`
  const line = `**Trigger:** ${TRIGGERS[name]}\n\nTerminal: ${bySize(frames.length, def.ms)}.${held} Pixel: ${bySize(spec.n, spec.ms)}.${name === 'agents' ? ' Drawn with 2 clones.' : ''}`
  return `### ${name}\n\n${line}\n\n**Terminal**\n\n${img(`term-cue-${name}.svg`, `${name} terminal animation`)}\n\n${img(`term-cue-${name}-sheet.svg`, `${name} terminal frames`)}\n\n**Pixel**\n\n${img(`pixel-cue-${name}.svg`, `${name} pixel animation`)}\n\n${img(`pixel-cue-${name}-sheet.svg`, `${name} pixel frames`)}\n`
}).join('\n')
const doc = new URL('docs/SPRITES.md', root)
let md = readFileSync(doc, 'utf8')
for (const [name, body] of [['parts', parts], ['clicks', clicks], ['pixel', pixel], ['cues', cuesBody]]) md = splice(md, name, body)
writeFileSync(doc, md)

files.sort((a, b) => (a.file < b.file ? -1 : 1))
writeFileSync(out + 'index.json', `${JSON.stringify({ aliases, files }, null, 2)}\n`)
console.log(`wrote ${files.length} svgs and index.json to ${out}`)
