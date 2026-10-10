import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { Activity, Mood, Strain } from '../types'
import { H, PX, SKINS, toSvg, W } from './clawd'

// Which prop Clawd picks up for which tool the main agent runs; any other tool keeps him thinking.
const TOOL_PROPS: Record<string, Activity> = {
  Bash: 'laptop',
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
}
// Moods that play for a while after a turn and then settle back to idle.
const SETTLE_MS: Partial<Record<Mood, number>> = { happy: 2400, oops: 1200 }
const ASLEEP_AFTER_MS = 120_000
// He sweats from 85% of any limit, and checks a clock when one tool has run this long.
const HOT_PERCENT = 85
const SLOW_MS = 10_000

const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')
const activity = atom({ plugin: 'buddy', key: 'activity' } as const, 'think')
const skin = atom({ plugin: 'buddy', key: 'skin' } as const, 'classic')
const signals = atom({ plugin: 'buddy', key: 'signals' } as const, { hot: false, slow: 0 })
// The cache-timer mod owns these; without it the cache is simply never cold.
const cacheLast = atom({ plugin: 'cache-timer', key: 'last' } as const, null)
const cacheTtl = atom({ plugin: 'cache-timer', key: 'ttlMin' } as const, 60)

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'buddy', description: 'Change how Clawd looks', argumentHint: `skin ${Object.keys(SKINS).join(' | ')}` })
    const saved = (await $.store.get('skin')) as string | undefined
    if (saved && saved in SKINS) await update($, skin, () => saved)
    await become($, 'idle')
    return next(e)
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

  on('session.measure', async ($, e, next) => {
    await update($, signals, s => ({ ...s, hot: isHot(e.context, e.rateLimits) }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    const prop = isMain ? TOOL_PROPS[e.tool] : undefined
    if (prop) await update($, activity, () => prop)
    // Delegating is long by design, so only other tools count as slow.
    let isSlow = false
    const watch = isMain && e.tool !== 'Agent'
      ? $.clock.after(SLOW_MS, async () => {
        isSlow = true
        await update($, signals, s => ({ ...s, slow: s.slow + 1 }))
      })
      : undefined
    try {
      return await next(e)
    } finally {
      watch?.cancel()
      if (isSlow) await update($, signals, s => ({ ...s, slow: s.slow - 1 }))
      if (prop) await update($, activity, () => 'think' as Activity)
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await become($, e.isAborted || e.reason === 'error' ? 'oops' : 'happy')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const elements = $.ui.resolve(e)
    const { Box } = elements
    const [m, act, s, sig, last, ttl] = await Promise.all([read($, mood), read($, activity), read($, skin), read($, signals), read($, cacheLast), read($, cacheTtl)])
    const isCold = last !== null && Date.now() > last.at + ttl * 60_000
    const strain: Strain = sig.hot ? 'hot' : sig.slow > 0 ? 'slow' : isCold ? 'cold' : 'none'
    const isStill = (await $.settings.read()).prefersReducedMotion === true
    // The terminal runs Clawd as a Client on its own clock; elsewhere he is one Svg that animates itself.
    const art = e.surface === 'terminal' && 'Client' in elements
      ? <elements.Client key="clawd" module="./clawd-term.tsx" props={{ mood: m, activity: act, skin: s, isStill, strain }} />
      : 'Svg' in elements
        ? <elements.Svg source={toSvg(m, act, SKINS[s] ?? SKINS.classic!, isStill, strain)} alt={`Clawd, ${m}`} width={W * PX} height={H * PX} isInteractive={!isStill} />
        : null
    if (!art) return below

    return pack(Box, below, <Box key="buddy">{art}</Box>)
  })
}
