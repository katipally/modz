import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { Activity, Cue, Mood, Playing, Signals, Strain } from '../types'
import { H, PIXEL_CUES, PX, SKINS, toSvg, W } from './clawd'
import { playMs } from './clawd-cues'

// Which prop Clawd picks up for which tool the main agent runs; any other tool keeps him thinking.
const TOOL_PROPS: Record<string, Activity> = {
  Edit: 'hammer',
  Write: 'hammer',
  NotebookEdit: 'hammer',
  Read: 'magnify',
  Grep: 'magnify',
  Glob: 'magnify',
  WebFetch: 'web',
  WebSearch: 'web',
  Agent: 'agents',
  TodoWrite: 'notes',
  TaskCreate: 'notes',
  TaskUpdate: 'notes',
  AskUserQuestion: 'ask',
  Skill: 'skill',
  EnterPlanMode: 'plan',
  ExitPlanMode: 'plan',
}
// A Bash command is typing unless it is clearly one of these jobs.
const BASH_JOBS: [RegExp, Activity][] = [
  [/^\s*git\b/, 'git'],
  [/\b(test|pytest|jest|vitest|mocha)\b/, 'test'],
  [/\b(npm|pnpm|yarn|bun|pip3?|brew|apt(-get)?|cargo|gem) (install|add|i|ci)\b/, 'install'],
  [/\b(build|tsc|make|compile|webpack|gradle|mvn)\b/, 'build'],
]
const activityOf = (tool: string, command: string): Activity | undefined =>
  tool === 'Bash' ? BASH_JOBS.find(([re]) => re.test(command))?.[1] ?? 'laptop' : tool.startsWith('mcp__') ? 'mcp' : TOOL_PROPS[tool]
// Moods that play for a while after a turn and then settle back to idle.
const SETTLE_MS: Partial<Record<Mood, number>> = { happy: 2400, oops: 1200 }
const ASLEEP_AFTER_MS = 120_000
// He sweats from 85% of any limit, checks a clock when one tool has run SLOW_MS and sips coffee at LONG_MS.
const HOT_PERCENT = 85
const SLOW_MS = 10_000
const LONG_MS = 30_000
const STAGES = [['slow', SLOW_MS], ['long', LONG_MS]] as const
// A read of this many lines is a big file; a turn this long ends in fireworks.
const BIG_FILE_LINES = 500
const BIG_TURN_MS = 300_000
// A commit, a push or a pull request is a flag, unless it only rehearsed.
const FLAG_JOB = /\bgit\s+(commit|push)\b|\bgh\s+pr\s+create\b/
// A test run ends in a verdict; any other tool that fails ends in an error.
const TEST_RUN = /\b(npm|pnpm|yarn|bun)( run)? test\b|\b(pytest|jest|vitest|mocha|phpunit|rspec)\b|\b(go|cargo|mvn|gradle|dotnet|deno|swift|flutter) test\b|\bclaude plugin test\b/
// The request count falling by half is how a compaction shows where session.compact does not run.
const COMPACT_MIN_STEPS = 6

const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')
const activity = atom({ plugin: 'buddy', key: 'activity' } as const, 'think')
const skin = atom({ plugin: 'buddy', key: 'skin' } as const, 'classic')
const signals = atom({ plugin: 'buddy', key: 'signals' } as const, { hot: false, slow: 0, long: 0, waiting: [], compacting: 0, limited: false, agents: [], steps: 0 })
const playing = atom({ plugin: 'buddy', key: 'cue' } as const, null)
// The cache-timer mod owns these; without it the cache is simply never cold.
const cacheLast = atom({ plugin: 'cache-timer', key: 'last' } as const, null)
const cacheTtl = atom({ plugin: 'cache-timer', key: 'ttlMin' } as const, 60)

// What takes over his look, most urgent first: waiting on you, then a fault, then a one-shot, then a long state.
const RANK: Record<Cue, number> = {
  perm: 0, error: 1, offline: 1, limit: 1,
  pass: 2, fail: 2, flag: 2, hello: 2, fireworks: 2,
  compact: 3, agents: 3, coffee: 3, bigfile: 3,
}
// Cues that last as long as their cause; subagents only show while the main chat is not in a turn.
const STICKY: [Cue, (s: Signals, m: Mood) => boolean][] = [
  ['perm', s => s.waiting.length > 0],
  ['limit', s => s.limited],
  ['compact', s => s.compacting > 0],
  ['coffee', s => s.long > 0],
  ['agents', (s, m) => s.agents.length > 0 && (m === 'idle' || m === 'asleep')],
]
const pickCue = (s: Signals, m: Mood, one: Playing): Cue | null =>
  [...(one ? [one.name] : []), ...STICKY.filter(([, on]) => on(s, m)).map(([cue]) => cue)].reduce<Cue | null>((best, cue) => (best === null || RANK[cue] < RANK[best] ? cue : best), null)

const isHot = (context: SessionContextUsage, limits: SessionRateLimit[]) =>
  [context.percent, ...limits.map(l => l.percentUsed)].some(p => p !== undefined && p >= HOT_PERCENT)

// Every modz mod places its tile in one shared band: a lead column (the bot), then a column of tiles, then an optional
// right column. A column with no tiles is not drawn, and columns wrap under each other when the width runs out.
const BAND = 'modz-band'
const SLOTS: Record<string, 'lead' | 'left' | 'right'> = {
  buddy: 'lead',
  'usage-limits': 'left',
  'cache-timer': 'left',
  'model-info': 'left',
  orchestrator: 'left',
}
const ORDER = Object.keys(SLOTS)
const keyOf = (n: RenderNode) => (typeof n !== 'string' && n.type === 'Box' ? String(n.props?.key ?? '') : '')
const rank = (n: RenderNode) => {
  const i = ORDER.indexOf(keyOf(n))
  return i < 0 ? ORDER.length : i
}
const pack = (Box: ElementConstructor<BoxProps>, below: RenderElement, tile: RenderElement) => {
  const isEmpty = below.type === 'Box' && !below.children?.length
  const tiles = keyOf(below) === BAND
    ? (below.type === 'Box' ? below.children ?? [] : []).flatMap(col => (typeof col !== 'string' && col.type === 'Box' ? col.children ?? [] : [col]))
    : isEmpty ? [] : [below]
  const all = [...tiles, tile].sort((a, b) => rank(a) - rank(b))
  const [lead, left, right] = (['lead', 'left', 'right'] as const).map(slot => all.filter(n => (SLOTS[keyOf(n)] ?? 'left') === slot))
  return (
    <Box key={BAND} flexDirection="row" flexWrap="wrap" columnGap={3}>
      {lead!.length > 0 && <Box key="modz-lead" flexDirection="column" justifyContent="center">{lead}</Box>}
      {left!.length > 0 && <Box key="modz-left" flexDirection="column" flexGrow={right!.length > 0 ? 1 : 0}>{left}</Box>}
      {right!.length > 0 && <Box key="modz-right" flexDirection="column" alignItems="flex-end">{right}</Box>}
    </Box>
  )
}

// The band redraws only when the mood or the prop changes; the frames themselves play inside Clawd's own region.
let settle: Timer | undefined

const become = async ($: EngineInterface, next: Mood) => {
  settle?.cancel()
  await update($, mood, () => next)
  const after = next === 'idle' ? ASLEEP_AFTER_MS : SETTLE_MS[next]
  if (after !== undefined) settle = $.clock.after(after, () => void become($, next === 'idle' ? 'asleep' : 'idle'))
}

// A one-shot cue ends itself after its frames, and only one more urgent than the one playing may cut in.
let cueEnd: Timer | undefined
const play = async ($: EngineInterface, name: Cue, hash = '') => {
  const now = await read($, playing)
  if (now && RANK[name] > RANK[now.name]) return
  cueEnd?.cancel()
  await update($, playing, () => ({ name, hash }))
  cueEnd = $.clock.after(playMs(name), () => void update($, playing, () => null))
}

const setCompacting = ($: EngineInterface, by: 1 | -1) => update($, signals, s => ({ ...s, compacting: s.compacting + by }))
type Ran = { deny?: string; isError?: true; result?: unknown }
const verdictOf = (tool: string, command: string, ran?: Ran): Cue | undefined => {
  if (ran?.deny !== undefined || (ran?.result as { backgroundTaskId?: string } | null | undefined)?.backgroundTaskId) return undefined
  const isFailed = ran === undefined || ran.isError === true
  return tool === 'Bash' && TEST_RUN.test(command) ? (isFailed ? 'fail' : 'pass') : isFailed ? 'error' : undefined
}
// A read that came back long, or a commit that went through; a commit prints "[main 1a2b3c4] subject", which gives the hash.
const noteOf = (tool: string, command: string, ran?: Ran): { cue: Cue; hash?: string } | undefined => {
  const out = ran?.result as { stdout?: string; file?: { numLines?: number }; backgroundTaskId?: string } | null | undefined
  if (!out || ran?.deny !== undefined || ran?.isError || out.backgroundTaskId) return undefined
  if (tool === 'Read' && (out.file?.numLines ?? 0) >= BIG_FILE_LINES) return { cue: 'bigfile' }
  if (tool === 'Bash' && FLAG_JOB.test(command) && !command.includes('--dry-run')) return { cue: 'flag', hash: out.stdout?.match(/\[[^\]]* ([0-9a-f]{7,})\]/)?.[1] }
  return undefined
}
const moodAfter = (e: { isAborted: boolean; reason: string }): Mood => (e.isAborted || e.reason === 'error' ? 'oops' : 'happy')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'buddy', description: 'Change how Clawd looks', argumentHint: `skin ${Object.keys(SKINS).join(' | ')}` })
    const saved = (await $.store.get('skin')) as string | undefined
    if (saved && saved in SKINS) await update($, skin, () => saved)
    await become($, 'idle')
    const started = await next(e)
    // /clear sends no session.start, so this is a launch; a transcript that already holds messages is a resume. The session binds around next(e).
    if (await $.session.messages().then(m => m.length === 0, () => false)) await play($, 'hello')
    return started
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const [word, name = ''] = e.args.trim().split(/\s+/)
    if (word !== 'skin' || !(name in SKINS)) return { text: `Usage: /buddy skin ${Object.keys(SKINS).join(' | ')}` }
    await update($, skin, () => name)
    await $.store.set('skin', name)
    return { text: `Clawd is now ${name}.` }
  })

  on('turn.start', async ($, e, next) => {
    await update($, activity, () => 'think' as Activity)
    await become($, 'working')
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await update($, signals, s => ({ ...s, steps: 0, waiting: [], agents: [] }))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, signals, s => ({ ...s, hot: isHot(e.context, e.rateLimits), limited: e.rateLimits.some(l => l.percentUsed >= 100) }))
    return next(e)
  })

  // Classic hooks do not run where an organization manages Claude Code; there the limit shows from session.measure alone.
  on('classic.StopFailure', async ($, e, next) => {
    if (e.error === 'rate_limit') await update($, signals, s => ({ ...s, limited: true }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId !== undefined) return next(e)
    await setCompacting($, 1)
    try {
      return await next(e)
    } finally {
      await setCompacting($, -1)
      await update($, signals, s => ({ ...s, steps: 0 }))
    }
  }).catch(($, e, next) => next(e))

  // Runs wherever session.compact does not: the request carries far fewer messages than the one before.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const { steps } = await read($, signals)
      if (steps >= COMPACT_MIN_STEPS && e.messageCount < steps / 2) {
        await setCompacting($, 1)
        $.clock.after(playMs('compact'), () => void setCompacting($, -1))
      }
      if (steps !== e.messageCount) await update($, signals, s => ({ ...s, steps: e.messageCount }))
    }
    return yield* next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    if (ran.agentId && e.parentAgentId === undefined && !e.workflow) await update($, signals, s => ({ ...s, agents: [...s.agents, ran.agentId!] }))
    return ran
  }).catch(($, e, next) => next(e))

  // An ask with nobody else to put it to is a dialog open on the person; it stays until the call ends.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && verdict.decider === undefined && e.tool_use_id) await update($, signals, s => ({ ...s, waiting: [...s.waiting, e.tool_use_id!] }))
    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    const command = 'command' in e ? String(e.command) : ''
    const prop = isMain ? activityOf(e.tool, command) : undefined
    if (prop) await update($, activity, () => prop)
    // Delegating is long by design, so only other tools count as slow or long.
    const passed = { slow: false, long: false }
    const watches = isMain && e.tool !== 'Agent'
      ? STAGES.map(([key, ms]) => $.clock.after(ms, async () => {
        passed[key] = true
        await update($, signals, s => ({ ...s, [key]: s[key] + 1 }))
      }))
      : []
    let ran: Awaited<ReturnType<typeof next>> | undefined
    try {
      ran = await next(e)
      return ran
    } finally {
      for (const w of watches) w.cancel()
      for (const [key] of STAGES) if (passed[key]) await update($, signals, s => ({ ...s, [key]: s[key] - 1 }))
      if (prop) await update($, activity, () => 'think' as Activity)
      if (e.tool_use_id && (await read($, signals)).waiting.includes(e.tool_use_id)) await update($, signals, s => ({ ...s, waiting: s.waiting.filter(id => id !== e.tool_use_id) }))
      const verdict = isMain ? verdictOf(e.tool, command, ran) : undefined
      const note = isMain && !verdict ? noteOf(e.tool, command, ran) : undefined
      if (verdict) await play($, verdict)
      else if (note) await play($, note.cue, note.hash)
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, signals, s => ({ ...s, waiting: [], limited: e.reason === 'answer' ? false : s.limited }))
      const isBig = e.reason === 'answer' && e.durationMs >= BIG_TURN_MS
      await become($, isBig ? 'idle' : moodAfter(e))
      // The engine names no error kind here: an error with no rate limit showing is taken for the network.
      if (e.reason === 'error' && !(await read($, signals)).limited) await play($, 'offline')
      if (e.reason === 'answer') {
        if ((await read($, playing))?.name === 'offline') {
          cueEnd?.cancel()
          await update($, playing, () => null)
        }
        if (isBig) await play($, 'fireworks')
      }
    } else if ((await read($, signals)).agents.includes(e.agentId)) {
      await update($, signals, s => ({ ...s, agents: s.agents.filter(id => id !== e.agentId) }))
      if ((await read($, signals)).agents.length === 0 && (await read($, mood)) !== 'working') await become($, moodAfter(e))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const elements = $.ui.resolve(e)
    const { Box } = elements
    const [m, act, s, sig, one, last, ttl] = await Promise.all([read($, mood), read($, activity), read($, skin), read($, signals), read($, playing), read($, cacheLast), read($, cacheTtl)])
    const isCold = last !== null && Date.now() > last.at + ttl * 60_000
    const strain: Strain = sig.hot ? 'hot' : sig.slow > 0 ? 'slow' : isCold ? 'cold' : 'none'
    const isStill = (await $.settings.read()).prefersReducedMotion === true
    const cue = pickCue(sig, m, one)
    // The terminal runs Clawd as a Client on its own clock; elsewhere he is one Svg that animates itself.
    const art = e.surface === 'terminal' && 'Client' in elements
      ? <elements.Client key="clawd" module="./clawd-term.tsx" props={{ mood: m, activity: act, skin: s, isStill, strain, cue, clones: sig.agents.length, hash: one?.hash ?? '' }} />
      : 'Svg' in elements
        ? <elements.Svg source={toSvg(m, act, SKINS[s] ?? SKINS.classic!, isStill, strain, cue && { name: cue, clones: sig.agents.length })} alt={`Clawd, ${cue ? PIXEL_CUES[cue].say : m}`} width={W * PX} height={H * PX} isInteractive={!isStill} />
        : null
    if (!art) return below

    return pack(Box, below, <Box key="buddy">{art}</Box>)
  })
}
