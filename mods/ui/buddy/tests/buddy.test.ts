import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }
const UPPER = 0x2580
const LOWER = 0x2584

// Turns a Raster's cells back into Clawd's pixel rows: C body, E eye, . nothing.
const picture = (cells: string, columns: number) => {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const pixel = (color: number | undefined) => (color === undefined || color === 0x01000000 ? '.' : color === 0x141414 ? 'E' : 'C')
  const rows: string[] = []
  for (let i = 0; i < words.length / 3; i += columns) {
    let top = ''
    let bottom = ''
    for (let x = 0; x < columns; x++) {
      const [glyph, fg, bg] = [words[(i + x) * 3]!, words[(i + x) * 3 + 1]!, words[(i + x) * 3 + 2]!]
      top += glyph === UPPER ? pixel(fg) : '.'
      bottom += glyph === UPPER ? pixel(bg) : glyph === LOWER ? pixel(fg) : '.'
    }
    rows.push(top, bottom)
  }
  return rows
}

describe('buddy', () => {
  test('draws Clawd as Claude Code does and moves him through his moods', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)

    const art = async (surface: 'terminal' | 'desktop') => {
      const ui = await $.ui.mount({ plugin: 'buddy', surface, component: 'AbovePrompt', props: PROPS })
      const found = await ui.find(surface === 'terminal' ? { key: 'buddy-art' } : { type: 'Svg' })
      await ui.unmount()
      return found?.props ?? {}
    }
    const shot = async () => {
      const props = await art('terminal')
      return picture(String(props.cells), Number(props.columns))
    }

    expect(await shot()).toEqual([
      '...CCCCCCCCCCCCC...',
      '...CCCCCCCCCCCCC...',
      '...CCCECCCCCCCEC...',
      '...CCCECCCCCCCEC...',
      '.CCCCCCCCCCCCCCCCC.',
      '.CCCCCCCCCCCCCCCCC.',
      '...CCCCCCCCCCCCC...',
      '...CCCCCCCCCCCCC...',
      '...C.C.......C.C...',
      '...C.C.......C.C...',
    ])
    const svg = String((await art('desktop')).source)
    expect(svg).toMatch(/^<svg [^>]*shape-rendering="crispEdges">(<rect [^>]+\/>)+<\/svg>$/)
    expect(svg).toContain('fill="#d77757"')
    expect(svg).toContain('fill="#141414"')

    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    const working = await shot()
    expect(working[2]).toBe('...CCCCECCCCCCCE...')
    expect(working[9]).toBe('...C...........C...')

    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
    const happy = await shot()
    expect(happy.slice(2, 5)).toEqual(['.CCCCCCCCCCCCCCCCC.', '.CCCCCECCCCCCCECCC.', '...CCCCCCCCCCCCC...'])

    await $.turn.start({ text: 'hi', turnId: 't2' } as never)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' } as never)
    const oops = await shot()
    expect(oops.join('')).not.toContain('E')
    expect(oops[0]).toBe('..CCCCCCCCCCCCC....')

    await $.command.run({ command: 'buddy', args: 'skin mint', origin: { kind: 'composer' }, presentation: {} as never })
    expect(String((await art('desktop')).source)).toContain('fill="#7fd1ae"')
  })
})
