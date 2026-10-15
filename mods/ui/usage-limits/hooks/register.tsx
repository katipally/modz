import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { Usage } from '../types'

// Reset countdowns read in minutes, so a 30s tick keeps them honest.
const TICK_MS = 30_000
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

const usage = atom({ plugin: 'usage-limits', key: 'usage' } as const, { limits: [] })
const now = atom({ plugin: 'usage-limits', key: 'now' } as const, 0)
const shownPct = atom({ plugin: 'usage-limits', key: 'shownPct' } as const, 0)

// The bar eases toward a new value over a few frames instead of jumping.
const GROW_MS = 40
let grower: Timer | undefined
const grow = async ($: EngineInterface, target: number) => {
  grower?.cancel()
  grower = $.clock.every(GROW_MS, async () => {
    const shown = await read($, shownPct)
    const step = Math.sign(target - shown) * Math.max(0.5, Math.abs(target - shown) / 5)
    const nextPct = Math.abs(target - shown) <= 0.5 ? target : shown + step
    await update($, shownPct, () => nextPct)
    if (nextPct === target) grower?.cancel()
  })
}

const toUsage = (context: SessionContextUsage, limits: SessionRateLimit[]): Usage => ({
  contextPercent: context.percent,
  limits: limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
})

// "6d 18h" past a day, "2h 5m" past an hour, else "27m".
const span = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000))
  const [d, h] = [Math.floor(m / 1440), Math.floor((m % 1440) / 60)]
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

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

// Each tile has its own Claude theme color; values turn yellow at 60% and red at 85% as they fill.
const TINT = 'claude'
const tone = (pct: number, calm: string) => (pct >= 85 ? 'error' : pct >= 60 ? 'warning' : calm)

// The session binds around session.start, so the first read waits for next(e); one that still rejects is retried on the tick.
let isLoaded = false
const load = async ($: EngineInterface) => {
  try {
    const u = await $.session.usage()
    await update($, usage, () => toUsage(u.context, u.rateLimits))
    if (u.context.percent !== undefined) await grow($, u.context.percent)
    isLoaded = true
  } catch (err) {
    $.ui.log(`usage-limits: ${err}`, { to: 'debug' })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, now, () => Date.now())
    $.clock.every(TICK_MS, () => {
      void update($, now, () => Date.now())
      if (!isLoaded) void load($)
    })
    await load($)
    return started
  })

  // Fires on startup, resume, /clear and compact; /clear raises no session.start, so this is where the tile resets.
  on('classic.SessionStart', async ($, e, next) => {
    const started = await next(e)
    await load($)
    return started
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.context, e.rateLimits))
    if (e.context.percent !== undefined) await grow($, e.context.percent)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text } = $.ui.resolve(e)
    const [u, , shown] = await Promise.all([read($, usage), read($, now), read($, shownPct)])
    const t = Date.now()
    const pct = u.contextPercent

    const width = Math.max(5, Math.min(10, Math.floor(e.props.bodyColumns / 12)))
    const filled = pct === undefined ? 0 : Math.min(width, Math.max(0, Math.round((shown / 100) * width)))
    const metric = (label: string, value?: number, detail?: string) => (
      <Text>
        <Text dimColor>{label} </Text>
        {value === undefined ? <Text dimColor>–</Text> : <Text bold color={tone(value, 'success')}>{Math.round(value)}%</Text>}
        {detail && <Text dimColor> · {detail}</Text>}
      </Text>
    )

    return pack(Box, below, (
      <Box key="usage-limits" flexDirection="row" flexWrap="wrap" columnGap={3}>
        <Text>
          <Text color={TINT}>{'ctx'.padEnd(5)} </Text>
          <Text color={tone(pct ?? 0, TINT)}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(width - filled)} </Text>
          {pct === undefined ? <Text dimColor>–</Text> : <Text bold color={tone(pct, TINT)}>{Math.round(pct)}%</Text>}
        </Text>
        {u.limits.length > 0
          ? u.limits.map(l => metric(LABELS[l.kind] ?? l.kind, l.percentUsed, l.resetsAt && span(Date.parse(l.resetsAt) - t)))
          : [metric('5h'), metric('7d')]}
      </Box>
    ))
  })
}
