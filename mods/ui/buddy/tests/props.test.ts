import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }
const NAMES: Record<number, string> = { 0xd77757: 'C', 0x141414: 'E', 0x3a3a40: 'G', 0xb8bcc4: 'g', 0x7aa2f7: 'b', 0xffffff: 'W', 0x8b5a2b: 'w', 0xf5c542: 'y', 0xe5484d: 'r', 0x5fd38d: 'n', 0xe07ab0: 'p', 0x5a6fd6: 'N' }
const picture = (cells: string, columns: number) => {
  const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
  const name = (c: number) => (c === 0x01000000 ? '.' : NAMES[c] ?? '?')
  const rows: string[] = []
  for (let i = 0; i < words.length / 3; i += columns) {
    let top = ''
    let bottom = ''
    for (let x = 0; x < columns; x++) {
      const [g, fg, bg] = [words[(i + x) * 3]!, words[(i + x) * 3 + 1]!, words[(i + x) * 3 + 2]!]
      top += g === 0x2580 ? name(fg) : '.'
      bottom += g === 0x2580 ? name(bg) : g === 0x2584 ? name(fg) : '.'
    }
    rows.push(top, bottom)
  }
  return rows.join('\n')
}
test('Clawd works with the props of the tool at hand, celebrates, stumbles and loves a pet', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('ui.render', ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer, turnId: e.turnId }))
  let gate: Promise<void> = Promise.resolve()
  on('tool.call', async () => {
    await gate
    return { result: 'ok' } as never
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
  const shots: Record<string, string[]> = {}
  const shot = async (label: string) => {
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    const r = await ui.find({ key: 'buddy-art' })
    shots[label] = picture(String(r?.props.cells), Number(r?.props.columns)).split('\n')
    await ui.unmount()
  }
  await shot('idle')
  await $.turn.start({ text: 'hi', turnId: 't' } as never)
  await shot('think')
  for (const tool of ['Bash', 'Edit', 'Read']) {
    let release: () => void = () => {}
    gate = new Promise<void>(r => (release = r))
    const p = $.tool.call({ tool, command: 'ls', file_path: '/a', old_string: 'a', new_string: 'b' } as never)
    // Let the call reach the tool before looking: Clawd picks up the prop as it starts.
    for (let i = 0; i < 20; i++) await Promise.resolve()
    await shot(tool)
    release()
    await p
  }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
  await shot('happy')
  await $.turn.start({ text: 'hi', turnId: 't2' } as never)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't2', reason: 'aborted' } as never)
  await shot('oops')
  const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  await ui.press({ key: 'pet' })
  await ui.unmount()
  await shot('loved')
  expect(shots.idle).toEqual([
    '...........................',
    '...........................',
    '...CCCCCCCCCCCCC...........',
    '...CCCCCCCCCCCCC...........',
    '...CCCECCCCCCCEC...........',
    '...CCCECCCCCCCEC...........',
    '.CCCCCCCCCCCCCCCCC.........',
    '.CCCCCCCCCCCCCCCCC.........',
    '...CCCCCCCCCCCCC...........',
    '...CCCCCCCCCCCCC...........',
    '...C.C.......C.C...........',
    '...C.C.......C.C...........',
  ])
  expect(shots.think!.join('')).toContain('W')
  expect(shots.Bash!.slice(5, 11)).toEqual([
    '...CCCCECCCCCCCE...GGGGGGG.',
    '.CCCCCCCCCCCCCCCCCCGWbbbbG.',
    '.CCCCCCCCCCCCCCCCC.GbbbbbG.',
    '...CCCCCCCCCCCCC...GbbbbbG.',
    '...CCCCCCCCCCCCC...GGGGGGG.',
    '...C.C.......C.C...gggggggg',
  ])
  expect(shots.Edit!.slice(2, 4).map(r => r.slice(20, 23))).toEqual(['GGG', 'GGG'])
  expect(shots.Read!.slice(3, 7).map(r => r.slice(19, 23))).toEqual(['.GG.', 'GbbG', 'GbbG', '.GG.'])
  expect(shots.happy!.slice(0, 2).map(r => r.slice(7, 12))).toEqual(['y.y.y', 'yyyyy'])
  expect(shots.oops!.join('')).not.toContain('E')
  expect(shots.oops![3]).toContain('b')
  expect(shots.loved!.slice(0, 2).map(r => r.slice(7, 12))).toEqual(['rr.rr', '.rrr.'])
})
