import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: {} as never, view: {} as never }

// Turns a Raster's cells back into a picture: two pixel rows per cell, # for the bot.
const picture = (cells: string, columns: number) => {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const rows: string[] = []
  for (let i = 0; i < words.length / 3; i += columns) {
    let top = ''
    let bottom = ''
    for (let x = 0; x < columns; x++) {
      const glyph = words[(i + x) * 3]!
      top += glyph === 0x2588 || glyph === 0x2580 ? '#' : '.'
      bottom += glyph === 0x2588 || glyph === 0x2584 ? '#' : '.'
    }
    rows.push(top, bottom)
  }
  return rows.join('\n')
}


describe('buddy', () => {
  test('draws Claude Code\'s bot and moves through its moods', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)

    const shot = async (surface: 'terminal' | 'desktop' = 'terminal') => {
      const ui = await $.ui.mount({ plugin: 'buddy', surface, component: 'AbovePrompt', props: PROPS })
      const found = surface === 'terminal' ? await ui.find({ key: 'buddy-art' }) : await ui.find({ type: 'Svg' })
      await ui.unmount()
      return surface === 'terminal' ? picture(String(found?.props.cells), Number(found?.props.columns)) : String(found?.props.source)
    }

    const idle = await shot()
    expect(idle).toBe([
      '.................',
      '...###########...',
      '...##.#####.##...',
      '...##.#####.##...',
      '.###############.',
      '...###########...',
      '...#.#.....#.#...',
      '...#.#.....#.#...',
    ].join('\n'))
    expect(await shot('desktop')).toMatch(/^<svg .*shape-rendering="crispEdges" fill="#d97757">(<rect [^>]+\/>)+<\/svg>$/)

    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    expect((await shot()).split('\n')[7]).toBe('...#.........#...')
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
    const happy = await shot()
    expect(happy.split('\n')[0]).toContain('#')

    await $.turn.start({ text: 'hi', turnId: 't2' } as never)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' } as never)
    expect((await shot()).split('\n')[2]).toBe('..###########....')

    await $.command.run({ command: 'buddy', args: 'skin mint', origin: { kind: 'composer' }, presentation: {} as never })
    expect(await shot('desktop')).toContain('fill="#7fd1ae"')
  })
})
