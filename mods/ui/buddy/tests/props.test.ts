import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }
const NAMES: Record<string, string> = {
  '#d77757': 'C', '#141414': 'E', '#3a3a40': 'G', '#b8bcc4': 'g', '#7aa2f7': 'b',
  '#ffffff': 'W', '#8b5a2b': 'w', '#f5c542': 'y', '#e5484d': 'r', '#5fd38d': 'n', '#5a6fd6': 'N',
}

// Reads the Client's rows of colored half-blocks back into pixel rows: a letter per color, . for nothing.
const picture = (drawn: RenderElement) => {
  const rows: string[] = []
  const name = (c: unknown) => (c === undefined ? '.' : NAMES[String(c)] ?? '?')
  const kids = (n: RenderNode) => (typeof n === 'string' || !('children' in n) ? [] : n.children ?? [])
  for (const row of kids(drawn)) {
    let top = ''
    let bottom = ''
    for (const seg of kids(row)) {
      if (typeof seg === 'string' || seg.type !== 'Text') continue
      for (const ch of kids(seg).join('')) {
        top += ch === '▀' ? name(seg.props?.color) : '.'
        bottom += ch === '▀' ? name(seg.props?.backgroundColor) : ch === '▄' ? name(seg.props?.color) : '.'
      }
    }
    rows.push(top, bottom)
  }
  return rows
}

test('terminal Clawd animates on his own clock, takes up the tool at hand and jumps when clicked', async ($, on) => {
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
  const shot = async () => picture(await ui.drawn({ in: 'clawd' }))

  expect(await shot()).toEqual([
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
  // Seven beats in, idle Clawd blinks.
  await ui.advance(7 * 300)
  expect((await shot()).join('')).not.toContain('E')

  await $.turn.start({ text: 'hi', turnId: 't' } as never)
  await ui.redraw()
  const seen: Record<string, string[]> = {}
  for (const tool of ['Bash', 'Edit', 'Read', 'WebSearch', 'Agent', 'TodoWrite']) {
    let release: () => void = () => {}
    gate = new Promise<void>(r => (release = r))
    const call = $.tool.call({ tool, command: 'ls', file_path: '/a', old_string: 'a', new_string: 'b', pattern: 'x', query: 'q', prompt: 'p', description: 'd', todos: [] } as never)
    // Let the call reach the tool before looking: Clawd picks up the prop as it starts.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    await ui.redraw()
    seen[tool] = await shot()
    release()
    await call
  }
  expect(seen.Bash!.join('')).toContain('G')
  expect(seen.Bash![11]).toContain('ggggggggggg')
  expect(seen.Edit!.join('')).toMatch(/w/)
  // The lens bobs, so find it: a magnified eye framed in metal, two rows tall.
  const lens = seen.Read!.findIndex(r => r.slice(12, 16) === 'GEEG')
  expect(seen.Read!.slice(lens - 1, lens + 3).map(r => r.slice(13, 15))).toEqual(['GG', 'EE', 'EE', 'GG'])
  expect(seen.WebSearch![1]![9]).toBe('G')
  expect(seen.Agent!.join('')).toMatch(/^.{0,40}C/)
  expect(seen.TodoWrite!.join('')).toContain('W')
  // Every prop stays inside the same box, so the tile never changes size.
  for (const rows of Object.values(seen)) expect(rows.map(r => r.length)).toEqual(Array(12).fill(19))

  await ui.pointer({ type: 'down', x: 5, y: 3, button: 'left', in: 'clawd' })
  expect((await shot()).slice(0, 2).map(r => r.slice(7, 12))).toEqual(['rr.rr', '.rrr.'])

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  // The heart plays out first: ten frames, each landing on the next 50ms tick.
  await ui.advance(10 * 150)
  await ui.redraw()
  expect((await shot()).join('')).toContain('yyyyy')
  await ui.unmount()
})
