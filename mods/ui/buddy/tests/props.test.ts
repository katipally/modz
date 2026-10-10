import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

import { draw } from '../hooks/clawd'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }

// Every Text the Client drew, top to bottom, as plain lines.
const lines = (n: RenderNode): string[] => {
  if (typeof n === 'string' || !('children' in n)) return []
  if (n.type === 'Text') return [(n.children ?? []).map(c => (typeof c === 'string' ? c : lines(c).join(''))).join('')]
  return (n.children ?? []).flatMap(lines)
}
const art = (n: RenderElement) => lines(n).slice(0, 3)

describe('buddy in the terminal', () => {
  test('is Claude Code\'s three-row Clawd, acting out each tool and hopping when clicked', async ($, on) => {
    mock.clock(on)
    mock.store(on)
    on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('settings.read', () => ({ value: {} }) as never)
    on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
    let gate: Promise<void> = Promise.resolve()
    on('tool.call', async () => {
      await gate
      return { result: 'ok' } as never
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)

    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    const drawn = async () => ui.drawn({ in: 'clawd' })

    expect(art(await drawn())).toEqual(['  ▐▛███▜▌  ', ' ▝▜█████▛▘ ', '   ▘▘ ▝▝   '])
    await ui.advance(7 * 300)
    expect(art(await drawn())[0]).toBe('  ▐█████▌  ')

    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await ui.redraw()
    const doing: Record<string, string> = {}
    for (const tool of ['Bash', 'Edit', 'Read', 'WebSearch', 'Agent', 'TodoWrite']) {
      let release: () => void = () => {}
      gate = new Promise<void>(r => (release = r))
      const call = $.tool.call({ tool, command: 'ls', file_path: '/a', old_string: 'a', new_string: 'b', pattern: 'x', query: 'q', prompt: 'p', description: 'd', todos: [] } as never)
      // Let the call reach the tool before looking: Clawd picks up the work as it starts.
      for (let i = 0; i < 20; i++) await Promise.resolve()
      await ui.redraw()
      doing[tool] = lines(await drawn()).join('\n')
      release()
      await call
    }
    expect(doing.Bash).toContain('⌨ typing')
    expect(doing.Bash).toContain('▐▙███▟▌')
    expect(doing.Edit).toContain('✎ editing')
    expect(doing.Read).toContain('⌕ reading')
    expect(doing.WebSearch).toContain('◎ browsing')
    expect(doing.Agent).toContain('⚑ delegating')
    expect(doing.TodoWrite).toContain('☑ planning')

    await ui.pointer({ type: 'down', x: 3, y: 1, button: 'left', in: 'clawd' })
    expect(lines(await drawn()).join('')).toContain('♥')
    expect(art(await drawn())[1]).toBe(' ▗▟█████▙▖ ')

    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
    // The heart plays out first: ten frames, each landing on the next 50ms tick.
    await ui.advance(10 * 150)
    await ui.redraw()
    expect(lines(await drawn()).join('')).toMatch(/[✦✧⋆]/)
    await ui.unmount()
  })
})

describe('buddy\'s pixel Clawd (desktop, VS Code, mobile)', () => {
  const rows = (...args: Parameters<typeof draw>) => draw(...args).map(r => r.map(c => c ?? '.').join(''))

  test('is drawn from Claude Code\'s own pixels', () => {
    expect(rows('idle', 'think', 0)).toEqual([
      '...................',
      '...................',
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
  })

  test('holds a different prop for each kind of work, always inside the same box', () => {
    const at = (act: Parameters<typeof draw>[1], f = 0) => rows('working', act, f)
    expect(at('laptop')[11]).toContain('ggggggggggg')
    expect(at('hammer').slice(0, 2).map(r => r.slice(16, 19))).toEqual(['GGG', 'GGG'])
    const lens = at('magnify').findIndex(r => r.slice(12, 16) === 'GEEG')
    expect(at('magnify').slice(lens - 1, lens + 3).map(r => r.slice(13, 15))).toEqual(['GG', 'EE', 'EE', 'GG'])
    expect(at('web')[1]![9]).toBe('G')
    expect(at('agents').slice(0, 2).join('')).toContain('CCC')
    expect(at('notes', 2).join('')).toContain('n')
    expect(rows('happy', 'think', 0).slice(0, 2).map(r => r.slice(7, 12))).toEqual(['y.y.y', 'yyyyy'])
    expect(rows('loved', 'think', 0).slice(0, 2).map(r => r.slice(7, 12))).toEqual(['rr.rr', '.rrr.'])
    for (const act of ['think', 'laptop', 'hammer', 'magnify', 'web', 'agents', 'notes'] as const) {
      expect(at(act).map(r => r.length)).toEqual(Array(12).fill(19))
    }
  })
})
