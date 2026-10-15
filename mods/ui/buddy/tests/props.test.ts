import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

import { draw, H, PALETTE, PIXEL_CUES, W } from '../hooks/clawd'
import { CUES } from '../hooks/clawd-cues'
import type { Cue } from '../types'
import { CLICKS, COLS, dealClicks, place } from '../hooks/clawd-moves'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }

// Every Text the Client drew, top to bottom, as plain lines.
const lines = (n: RenderNode): string[] => {
  if (typeof n === 'string' || !('children' in n)) return []
  if (n.type === 'Text') return [(n.children ?? []).map(c => (typeof c === 'string' ? c : lines(c).join(''))).join('')]
  return (n.children ?? []).flatMap(lines)
}
const art = (n: RenderElement) => lines(n).slice(0, 3)

describe('buddy in the terminal', () => {
  test('is Claude Code\'s three-row Clawd, acting out each tool', async ($, on) => {
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


    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as never)
    await ui.advance(10 * 150)
    await ui.redraw()
    expect(lines(await drawn()).join('')).toMatch(/[✦✧⋆]/)
    await ui.unmount()
  })
})

describe('buddy\'s terminal motion and strain', () => {
  let gate: Promise<void> = Promise.resolve()
  // Holds every tool call until the returned release runs, so a test can look at Clawd while it works.
  const hold = () => {
    let release: () => void = () => {}
    gate = new Promise<void>(r => (release = r))
    return release
  }
  let clock: ReturnType<typeof mock.clock>
  const setup = async ($: any, on: any) => {
    gate = Promise.resolve()
    clock = mock.clock(on)
    mock.store(on)
    on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, {}) as RenderElement)
    on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
    on('settings.read', () => ({ value: {} }) as never)
    on('command.register', (_: any, e: any) => ({ value: { command: e.name } }) as never)
    on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
    on('session.measure', (_: any, e: any) => ({ changed: e.changed }))
    on('tool.call', async () => {
      await gate
      return { result: 'ok' } as never
    })
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
    return $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  }

  test('every kind of work moves its own prop beside him', async ($, on) => {
    const ui = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    const frames = async (tool: string, args: object) => {
      const release = hold()
      const call = $.tool.call({ tool, ...args } as never)
      for (let i = 0; i < 20; i++) await Promise.resolve()
      await ui.redraw()
      const seen = new Set<string>()
      for (let i = 0; i < 8; i++) {
        const all = lines(await ui.drawn({ in: 'clawd' }))
        seen.add([all[3], all[5]].join('|'))
        await ui.advance(200)
      }
      release()
      await call
      return seen
    }
    const props: Set<string>[] = []
    for (const [tool, args] of [['Bash', { command: 'ls' }], ['Edit', { file_path: '/a', old_string: 'a', new_string: 'b' }], ['Read', { file_path: '/a' }], ['WebSearch', { query: 'q' }], ['Agent', { prompt: 'p', description: 'd' }], ['TodoWrite', { todos: [] }]] as const) {
      const seen = await frames(tool, args)
      expect(seen.size).toBeGreaterThan(1)
      props.push(seen)
    }
    // No two kinds of work share a frame, so none of them is just feet stepping.
    props.forEach((a, i) => props.slice(i + 1).forEach(b => expect([...a].some(x => b.has(x))).toBe(false)))
    await ui.unmount()
  })

  test('sweats near a limit and checks a clock on a slow tool', async ($, on) => {
    const ui = await setup($, on)
    const cell = async () => lines(await ui.drawn({ in: 'clawd' })).slice(0, 3).map(r => r[0]).join('')
    expect(await cell()).toBe('   ')

    await $.session.measure({ context: { window: 200_000, percent: 90 }, rateLimits: [], changed: ['context'] } as never)
    await ui.redraw()
    expect(await cell()).toContain('°')
    await $.session.measure({ context: { window: 200_000, percent: 10 }, rateLimits: [], changed: ['context'] } as never)

    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    const release = hold()
    const call = $.tool.call({ tool: 'Bash', command: 'sleep 99' } as never)
    await clock.advance(11_000)
    await ui.redraw()
    expect(await cell()).toMatch(/[◴◷◶◵]/)
    release()
    await call
    await ui.redraw()
    expect(await cell()).not.toMatch(/[◴◷◶◵]/)
    await ui.unmount()
  })

  test('plays a different click animation each time, all of them before any repeats', async ($, on) => {
    const ui = await setup($, on)
    const sprite = async () => lines(await ui.drawn({ in: 'clawd' })).slice(0, 3).map(r => r.slice(1, 10)).join('/')
    const played: string[] = []
    for (let i = 0; i < Object.keys(CLICKS).length; i++) {
      await ui.pointer({ type: 'down', x: 3, y: 1, button: 'left', in: 'clawd' })
      const seen = [await sprite()]
      // A click while one plays does nothing.
      await ui.pointer({ type: 'down', x: 3, y: 1, button: 'left', in: 'clawd' })
      for (let step = 0; step < 40; step++) {
        await ui.advance(70)
        seen.push(await sprite())
      }
      played.push(seen.join('|'))
      expect(seen.at(-1)).toMatch(/\/  ▘▘ ▝▝  $/)
    }
    expect(new Set(played).size).toBe(played.length)
    await ui.unmount()
  })

  test('has a mode for tests, git, installs, builds, questions, mcp, skills and plan mode', async ($, on) => {
    const ui = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    const doing = async (tool: string, args: object) => {
      const release = hold()
      const call = $.tool.call({ tool, ...args } as never)
      for (let i = 0; i < 20; i++) await Promise.resolve()
      await ui.redraw()
      const text = lines(await ui.drawn({ in: 'clawd' })).join('\n')
      release()
      await call
      // A test run's verdict plays over him for a moment; let it finish before the next tool.
      await clock.advance(1000)
      return text
    }
    expect(await doing('Bash', { command: 'npm test' })).toContain('◔ testing')
    expect(await doing('Bash', { command: 'git status' })).toContain('◆ git')
    expect(await doing('Bash', { command: 'npm install left-pad' })).toContain('↓ installing')
    expect(await doing('Bash', { command: 'npm run build' })).toContain('▤ building')
    expect(await doing('Bash', { command: 'ls' })).toContain('⌨ typing')
    expect(await doing('AskUserQuestion', { questions: [] })).toContain('? asking')
    expect(await doing('mcp__notion__search', {})).toContain('↯ connecting')
    expect(await doing('Skill', { skill: 'x' })).toContain('✦ casting')
    expect(await doing('EnterPlanMode', {})).toContain('◇ drafting')
    await ui.unmount()
  })
})

describe('buddy\'s moves', () => {
  test('a deal holds every click once and never opens with the last one', () => {
    const names = Object.keys(CLICKS).sort()
    for (let seed = 1; seed < 30; seed++) {
      let n = seed
      const random = () => ((n = (n * 16807) % 2147483647) / 2147483647)
      const last = names[seed % names.length]
      const deal = dealClicks(last, random)
      expect([...deal].sort()).toEqual(names)
      expect(deal[0]).not.toBe(last)
    }
  })

  test('every frame stays inside the nine-by-three box', () => {
    for (const frames of Object.values(CLICKS)) {
      for (const f of frames) expect(place(f).map(r => [...r].length)).toEqual(Array(3).fill(COLS))
    }
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
      for (const strain of ['none', 'hot', 'cold', 'slow'] as const) {
        for (let f = 0; f < 8; f++) expect(rows('working', act, f, strain).map(r => r.length)).toEqual(Array(12).fill(19))
      }
    }
    expect(rows('idle', 'think', 0, 'slow').join('')).toContain('r')
    expect(rows('idle', 'think', 0, 'hot').join('')).toContain('b')
    expect(rows('idle', 'think', 0, 'cold').join('')).toContain('W')
    expect(rows('happy', 'think', 0, 'hot')).toEqual(rows('happy', 'think', 0))
  })

  test('has a pixel drawing for every cue, with its props, in the same box and at the terminal\'s pace', () => {
    const props: Record<Cue, string> = {
      perm: 'y', error: 'Egr', pass: 'n', fail: 'r', compact: 'b', limit: 'gy', agents: 'Cy', coffee: 'wg',
      bigfile: 'WGn', offline: 'gby', flag: 'wr', hello: 'Wy', fireworks: 'yrbn',
    }
    for (const [name, spec] of Object.entries(PIXEL_CUES) as [Cue, (typeof PIXEL_CUES)[Cue]][]) {
      const frames = Array.from({ length: spec.n }, (_, f) => spec.art(f, 3))
      const seen = new Set(frames.flat(2))
      for (const letter of props[name]) expect(seen.has(letter), `${name} draws ${letter}`).toBe(true)
      for (const px of frames) {
        expect(px.length, name).toBe(H)
        for (const row of px) {
          expect(row.length, name).toBe(W)
          for (const c of row) expect(c === undefined || c === 'C' || c in PALETTE, `${name} uses ${c}`).toBe(true)
        }
      }
      expect(new Set(frames.map(f => f.map(r => r.join('')).join('/'))).size, `${name} moves`).toBeGreaterThan(1)
      expect([spec.ms, spec.n, spec.rest], name).toEqual([CUES[name].ms, CUES[name].frames({ clones: 3, hash: '' }).length, CUES[name].rest])
    }
  })

  test('draws one mini-Clawd per running subagent, three at most', () => {
    const minis = (clones: number) => PIXEL_CUES.agents.art(0, clones)[0]!.filter(c => c === 'C').length
    expect([1, 2, 3, 4, 20].map(minis)).toEqual([3, 6, 9, 9, 9])
  })
})
