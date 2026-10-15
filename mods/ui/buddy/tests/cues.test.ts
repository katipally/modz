import { describe, expect, mock, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

import { CUES, cueRows, playMs } from '../hooks/clawd-cues'
import type { Col } from '../hooks/clawd-cues'
import { COLS, place } from '../hooks/clawd-moves'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {} as never, view: {} as never }
const SPAWN = { tool_use_id: 't1', prompt: 'p', description: 'd', subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' }, background: true, fork: false } as never
const MESSAGE = { role: 'user', text: 'summary', toolUses: [] }
const done = (agentId?: string, extra: object = {}) => ({ answer: '', durationMs: 1, isAborted: false, turnId: 't', agentId, reason: 'answer', ...extra }) as never

const lines = (n: RenderNode): string[] => {
  if (typeof n === 'string' || !('children' in n)) return []
  if (n.type === 'Text') return [(n.children ?? []).map(c => (typeof c === 'string' ? c : lines(c).join(''))).join('')]
  return (n.children ?? []).flatMap(lines)
}

describe('buddy cues in the terminal', () => {
  let clock: ReturnType<typeof mock.clock>
  let result: object = { result: 'ok' }
  let verdict = 'allow'
  let compactGate: Promise<void> = Promise.resolve()
  let toolGate: Promise<void> = Promise.resolve()
  let n = 0
  const setup = async ($: any, on: any, isLaunch = false) => {
    result = { result: 'ok' }
    toolGate = Promise.resolve()
    verdict = 'allow'
    compactGate = Promise.resolve()
    n = 0
    clock = mock.clock(on)
    mock.store(on)
    on('ui.render', ($: any, e: any) => h($.ui.resolve(e).Box, {}) as RenderElement)
    on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
    on('session.end', () => ({ sessionId: 's' }) as never)
    on('classic.StopFailure', () => ({}))
    on('settings.read', () => ({ value: {} }) as never)
    on('command.register', (_: any, e: any) => ({ value: { command: e.name } }) as never)
    on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
    on('turn.complete', (_: any, e: any) => ({ text: e.answer, turnId: e.turnId }))
    on('turn.step', async function* (_: any, e: any) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
    })
    on('session.measure', (_: any, e: any) => ({ changed: e.changed }))
    on('session.compact', async () => {
      await compactGate
      return { messages: [MESSAGE] } as never
    })
    on('agent.spawn', () => ({ model: 'm', agentId: `a${++n}` }))
    on('tool.check', () => ({ decision: verdict }) as never)
    on('tool.call', async () => {
      await toolGate
      return result as never
    })
    on('session.messages', () => ({ value: isLaunch ? [] : [MESSAGE] }) as never)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as never)
    const ui = await $.ui.mount({ plugin: 'buddy', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    const drawn = async () => {
      await ui.redraw()
      return lines(await ui.drawn({ in: 'clawd' })).join('\n')
    }
    // Lets the engine clock and Clawd's own frames run for ms, then reads what he shows.
    const seen = async (ms = 0) => {
      await clock.advance(ms)
      await ui.advance(ms)
      for (let i = 0; i < 20; i++) await Promise.resolve()
      return drawn()
    }
    // One model request with this many messages, read to its end.
    const request = async (messageCount: number) => {
      for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount } as never)) void _
    }
    return { ui, seen, request }
  }
  const holdTools = () => {
    let release: () => void = () => {}
    toolGate = new Promise<void>(r => (release = r))
    return release
  }

  test('shows no cue until something happens', async ($, on) => {
    const { ui, seen } = await setup($, on)
    const text = await seen()
    for (const glyph of ['?', '✔', '✘', '▶', '┊', '▟▙']) expect(text).not.toContain(glyph)
    await ui.unmount()
  })

  test('a tool that fails shows the error cue, a refused or subagent call does not', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    result = { isError: true, result: 'boom', text: 'boom' }
    await $.tool.call({ tool: 'Read', file_path: '/missing' } as never)
    expect(await seen(130 * 5)).toContain('!')
    expect(await seen()).toContain('x')
    expect(await seen(playMs('error'))).not.toContain('!')

    result = { deny: 'no' }
    await $.tool.call({ tool: 'Read', file_path: '/a' } as never)
    result = { isError: true, result: 'boom' }
    await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'sub' } as never)
    expect(await seen(130 * 5)).not.toContain('!')
    await ui.unmount()
  })

  test('a test run ends in a pass or a fail, and a failing Bash that is not a test is an error', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    expect(await seen(140 * 2)).toContain('✔')
    expect(await seen(playMs('pass'))).not.toContain('✔')

    for (const command of ['pytest -q', 'go test ./...', 'cargo test', 'claude plugin test mods/ui/buddy', 'npx vitest run']) {
      result = { isError: true, result: 'Exit code 1', text: 'Exit code 1' }
      await $.tool.call({ tool: 'Bash', command } as never)
      const text = await seen(140)
      expect(text, command).toContain('✘')
      expect(text, command).not.toContain('!')
      await seen(playMs('fail'))
    }

    result = { isError: true, result: 'Exit code 2' }
    await $.tool.call({ tool: 'Bash', command: 'ls /nope' } as never)
    expect(await seen(130 * 5)).not.toContain('✘')
    expect(await seen()).toContain('!')
    await seen(playMs('error'))

    result = { result: { backgroundTaskId: 'b1' } }
    await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true } as never)
    expect(await seen(140 * 2)).not.toContain('✔')
    await ui.unmount()
  })

  test('a permission prompt holds the question mark until the call ends', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    verdict = 'ask'
    await $.tool.check({ tool: 'Bash', input: { command: 'rm x' }, tool_use_id: 'u1' } as never)
    await seen(180 * 3)
    expect(await seen()).toContain('?')
    await seen(60_000)
    expect(await seen()).toContain('?')

    await $.tool.call({ tool: 'Bash', command: 'rm x', tool_use_id: 'u1' } as never)
    expect(await seen()).not.toContain('?')

    verdict = 'allow'
    await $.tool.check({ tool: 'Read', input: {}, tool_use_id: 'u2' } as never)
    expect(await seen()).not.toContain('?')
    await ui.unmount()
  })

  test('waiting on you outranks an error, which outranks a verdict', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    expect(await seen(140 * 2)).toContain('✔')

    result = { isError: true, result: 'boom' }
    await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
    let text = await seen(130 * 5)
    expect(text).toContain('!')
    expect(text).not.toContain('✔')

    // A verdict cannot cut in on an error that is still playing.
    result = { result: 'ok' }
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    text = await seen(140 * 2)
    expect(text).toContain('!')
    expect(text).not.toContain('✔')

    verdict = 'ask'
    await $.tool.check({ tool: 'Bash', input: {}, tool_use_id: 'u1' } as never)
    text = await seen(180 * 2)
    expect(text).toContain('?')
    expect(text).not.toContain('!')
    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u1' } as never)
    await ui.unmount()
  })

  test('compaction shows from session.compact and, without it, from the request count dropping', async ($, on) => {
    const { ui, seen, request } = await setup($, on)
    let release: () => void = () => {}
    compactGate = new Promise<void>(r => (release = r))
    const compacting = $.session.compact({ trigger: 'auto', messages: [MESSAGE] } as never)
    expect(await seen(120 * 4)).toContain('▶')
    release()
    await compacting
    expect(await seen(0)).not.toContain('▶')

    await request(40)
    expect(await seen(120 * 4)).not.toContain('▶')
    await request(44)
    await request(6)
    expect(await seen(120 * 4)).toContain('▶')
    expect(await seen(playMs('compact'))).not.toContain('▶')

    // Growing, or a small drop, is not a compaction; neither is the first request after /clear.
    await request(30)
    await request(20)
    expect(await seen(120 * 4)).not.toContain('▶')
    await $.session.end({ reason: 'clear' } as never)
    await request(2)
    expect(await seen(120 * 4)).not.toContain('▶')
    await ui.unmount()
  })

  test('a limit holds while a window is full and ends when it clears', async ($, on) => {
    const { ui, seen } = await setup($, on)
    const measure = (percentUsed: number) => $.session.measure({ context: { window: 200_000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed }], changed: ['rateLimits'] } as never)
    await measure(100)
    expect(await seen()).toContain('┊')
    await seen(60_000)
    expect(await seen()).toContain('┊')
    await measure(40)
    expect(await seen()).not.toContain('┊')
    await ui.unmount()
  })

  test('a rate-limit failure shows the limit until a turn answers', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.classic.StopFailure({ error: 'overloaded' } as never)
    expect(await seen()).not.toContain('┊')
    await $.classic.StopFailure({ error: 'rate_limit' } as never)
    expect(await seen()).toContain('┊')
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.turn.complete(done())
    expect(await seen()).not.toContain('┊')
    await ui.unmount()
  })

  test('with subagents running Clawd keeps working while main works and shows them clones once main is idle', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.agent.spawn(SPAWN)
    await $.agent.spawn(SPAWN)
    await $.agent.spawn({ ...(SPAWN as object), parentAgentId: 'a1' } as never)
    await $.agent.spawn({ ...(SPAWN as object), workflow: { name: 'w' } } as never)

    // Main is in a turn: his own work stays, with the count beside it.
    await $.tool.call({ tool: 'Read', file_path: '/a', agentId: 'a1' } as never)
    let text = await seen()
    expect(text).toContain('thinking')
    expect(text).toContain('×2')
    expect(text).not.toContain('▟▙')

    await $.turn.complete(done())
    await seen(2400 + 100)
    text = await seen()
    expect(text).toContain('▟▙')
    expect(text).toContain('×2')
    expect(text).not.toContain('thinking')

    // Idle for two minutes does not put him to sleep while they run.
    await seen(130_000)
    expect(await seen()).toContain('▟▙')

    await $.turn.complete(done('a1'))
    expect(await seen()).toContain('×1')
    await $.turn.complete(done('a1'))
    expect(await seen()).toContain('×1')

    // The last one finishing is a finish: the happy jump, then idle.
    await $.turn.complete(done('a2'))
    text = await seen()
    expect(text).not.toContain('▟▙')
    expect(text).toMatch(/[✦✧⋆]/)
    await seen(2400 + 100)
    text = await seen()
    expect(text).not.toMatch(/[✦✧⋆]/)
    expect(text).not.toContain('×')
    await ui.unmount()
  })

  test('a subagent finishing while main works is not a finish, and /clear forgets the subagents', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.agent.spawn(SPAWN)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.turn.complete(done('a1'))
    const text = await seen()
    expect(text).toContain('thinking')
    expect(text).not.toMatch(/[✦✧⋆]/)

    await $.turn.complete(done())
    await $.agent.spawn(SPAWN)
    await seen(2400 + 100)
    expect(await seen()).toContain('▟▙')
    await $.session.end({ reason: 'clear' } as never)
    expect(await seen()).not.toContain('▟▙')
    await ui.unmount()
  })

  test('a main tool that runs long shows coffee, after the clock and until it ends', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    const release = holdTools()
    const call = $.tool.call({ tool: 'Bash', command: 'sleep 99' } as never)
    expect(await seen(20_000)).not.toContain('╭')
    expect(await seen(10_000 + 250 * 2)).toContain('╭')
    await seen(60_000)
    expect(await seen()).toContain('╭')
    release()
    await call
    expect(await seen()).not.toContain('╭')

    // A subagent's tool and the Agent tool itself are not his long run.
    const again = holdTools()
    const sub = $.tool.call({ tool: 'Bash', command: 'sleep 99', agentId: 'a1' } as never)
    const agent = $.tool.call({ tool: 'Agent', prompt: 'p' } as never)
    expect(await seen(40_000)).not.toContain('╭')
    again()
    await Promise.all([sub, agent])
    await ui.unmount()
  })

  test('a big read shows the page scrolling for a moment, a short one or a subagent does not', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    result = { result: { type: 'text', file: { filePath: '/a', content: '', numLines: 80, startLine: 1, totalLines: 80 } } }
    await $.tool.call({ tool: 'Read', file_path: '/a' } as never)
    expect(await seen(120 * 3)).not.toContain('▸')

    result = { result: { type: 'text', file: { filePath: '/b', content: '', numLines: 2000, startLine: 1, totalLines: 5000 } } }
    await $.tool.call({ tool: 'Read', file_path: '/b', agentId: 'sub' } as never)
    expect(await seen(120 * 3)).not.toContain('▸')
    await $.tool.call({ tool: 'Read', file_path: '/b' } as never)
    expect(await seen(120 * 3)).toContain('▸')
    expect(await seen(playMs('bigfile'))).not.toContain('▸')
    await ui.unmount()
  })

  test('a network failure shows the rain cloud until a turn answers, a rate limit shows the limit instead', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.turn.complete(done(undefined, { reason: 'error' }))
    expect(await seen(160 * 2)).toContain('▗██▖')
    expect(await seen(10_000)).toContain('▗██▖')

    await $.turn.start({ text: 'again', turnId: 't2' } as never)
    expect(await seen()).toContain('▗██▖')
    await $.turn.complete(done())
    expect(await seen()).not.toContain('▗██▖')

    await $.turn.complete(done('a1', { reason: 'error' }))
    await $.turn.complete(done(undefined, { reason: 'aborted', isAborted: true }))
    expect(await seen(160 * 2)).not.toContain('▗██▖')

    await $.classic.StopFailure({ error: 'rate_limit' } as never)
    await $.turn.complete(done(undefined, { reason: 'error' }))
    const text = await seen(300 * 2)
    expect(text).toContain('┊')
    expect(text).not.toContain('▗██▖')
    await ui.unmount()
  })

  test('a commit, a push or a pull request that went through plants a flag with the hash, a failed or rehearsed one does not', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    result = { result: { stdout: '[main 1a2b3c4] fix it\n 1 file changed', stderr: '', interrupted: false } }
    await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m "fix it"' } as never)
    expect(await seen(130 * 6)).toContain('⚑')
    expect(await seen(130 * 2)).toContain('1a2b3c4')
    expect(await seen(playMs('flag'))).not.toContain('⚑')

    result = { result: { stdout: 'Everything up-to-date', stderr: '', interrupted: false } }
    for (const command of ['git push origin main', 'gh pr create --fill']) {
      await $.tool.call({ tool: 'Bash', command } as never)
      expect(await seen(130 * 5), command).toContain('⚑')
      await seen(playMs('flag'))
    }

    for (const command of ['git status', 'git push --dry-run', 'npm run commit']) {
      await $.tool.call({ tool: 'Bash', command } as never)
      expect(await seen(130 * 5), command).not.toContain('⚑')
    }
    result = { isError: true, result: 'Exit code 1', text: 'Exit code 1' }
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)
    expect(await seen(130 * 5)).not.toContain('⚑')
    await ui.unmount()
  })

  test('he says hello on a launch', async ($, on) => {
    const { ui, seen } = await setup($, on, true)
    const shown: string[] = []
    for (let i = 0; i < 16; i++) shown.push(await seen(100))
    expect(shown.join()).toMatch(/\bhi\b/)
    expect(await seen(playMs('hello'))).not.toMatch(/\bhi\b/)
    await ui.unmount()
  })

  test('a resumed session, or a cleared one, does not say hello again', async ($, on) => {
    const { ui, seen } = await setup($, on)
    const quiet: string[] = []
    for (let i = 0; i < 16; i++) quiet.push(await seen(100))
    await $.session.end({ reason: 'clear' } as never)
    for (let i = 0; i < 16; i++) quiet.push(await seen(100))
    expect(quiet.join()).not.toMatch(/\bhi\b/)
    await ui.unmount()
  })

  test('a turn of five minutes ends in fireworks instead of the happy jump, a shorter one does not', async ($, on) => {
    const { ui, seen } = await setup($, on)
    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.turn.complete(done(undefined, { durationMs: 299_999 }))
    let text = await seen(110)
    expect(text).not.toContain('╷')
    await seen(2400 + 100)

    await $.turn.start({ text: 'hi', turnId: 't' } as never)
    await $.turn.complete(done(undefined, { durationMs: 300_000 }))
    text = await seen()
    expect(text).toContain('╷')
    expect(text).not.toMatch(/thinking/)
    expect(await seen(playMs('fireworks'))).not.toContain('╷')
    await ui.unmount()
  })
})

const widthOf = (col: Col[number] | undefined) => (col || []).reduce((sum, [text]) => sum + [...text].length, 0)
describe('every cue frame stays inside the box', () => {
  test('two columns, nine cells and three rows, whatever the count of subagents or the hash', () => {
    for (const [name, def] of Object.entries(CUES)) {
      for (const clones of [0, 1, 2, 3, 7, 120]) {
        for (const hash of ['', 'a1', 'a1b2c3d']) {
          for (const fr of def.frames({ clones, hash })) {
            const label = `${name} ${clones} ${hash}`
            expect(place(fr).map(r => [...r].length), label).toEqual(Array(3).fill(COLS))
            expect(cueRows(def, fr).map(r => r.length), label).toEqual(Array(3).fill(Math.max(def.lw, 1) + COLS + def.rw))
            for (const r of [0, 1, 2]) {
              expect(widthOf(fr.right?.[r]), `${label} right ${r}`).toBeLessThanOrEqual(def.rw)
              expect(widthOf(fr.left?.[r]), `${label} left ${r}`).toBeLessThanOrEqual(def.lw)
            }
            expect(Math.max(fr.left?.length ?? 0, fr.right?.length ?? 0), label).toBeLessThanOrEqual(3)
            for (const [row, col] of fr.pins ?? []) {
              expect(row + (fr.offset ?? 0), label).toBeLessThan(3)
              expect(col + (fr.x ?? 0), label).toBeLessThan(COLS)
              expect(col + (fr.x ?? 0), label).toBeGreaterThanOrEqual(0)
            }
          }
        }
      }
    }
  })
})
