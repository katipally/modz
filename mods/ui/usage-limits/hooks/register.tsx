import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, RenderElement, RenderNode, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Usage } from '../types'

// Reset countdowns read in minutes, so a 30s tick keeps them honest.
const TICK_MS = 30_000
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

const usage = atom({ plugin: 'usage-limits', key: 'usage' } as const, { limits: [] })
const now = atom({ plugin: 'usage-limits', key: 'now' } as const, 0)

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

// Every modz mod places its tile in one shared band: live metrics stack in a left column, identity and controls in a
// right one. A column with no tiles is not drawn, and the right column drops under the left when the width runs out.
const BAND = 'modz-band'
const SLOTS: Record<string, 'left' | 'right'> = { 'usage-limits': 'left', 'cache-timer': 'left', 'model-info': 'right', orchestrator: 'right' }
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
  const left = all.filter(n => SLOTS[keyOf(n)] !== 'right')
  const right = all.filter(n => SLOTS[keyOf(n)] === 'right')
  const isSplit = left.length > 0 && right.length > 0
  return (
    <Box key={BAND} flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={4}>
      {left.length > 0 && <Box key="modz-left" flexDirection="column">{left}</Box>}
      {right.length > 0 && <Box key="modz-right" flexDirection="column" alignItems={isSplit ? 'flex-end' : 'flex-start'}>{right}</Box>}
    </Box>
  )
}

// One look for every tile: dim labels and details, bold values, color only for status.
const level = (pct: number) => (pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const u = await $.session.usage()
    await update($, usage, () => toUsage(u.context, u.rateLimits))
    await update($, now, () => Date.now())
    $.clock.every(TICK_MS, () => void update($, now, () => Date.now()))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e.context, e.rateLimits))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Text } = $.ui.resolve(e)
    const [u] = await Promise.all([read($, usage), read($, now)])
    const t = Date.now()
    const pct = u.contextPercent
    if (pct === undefined && u.limits.length === 0) return below

    const width = Math.max(5, Math.min(10, Math.floor(e.props.bodyColumns / 12)))
    const filled = pct === undefined ? 0 : Math.min(width, Math.max(0, Math.round((pct / 100) * width)))
    const metric = (label: string, value: number, detail?: string) => (
      <Text>
        <Text dimColor>{label} </Text>
        <Text bold color={level(value)}>{Math.round(value)}%</Text>
        {detail && <Text dimColor> · {detail}</Text>}
      </Text>
    )

    return pack(Box, below, (
      <Box key="usage-limits" flexDirection="row" flexWrap="wrap" columnGap={3}>
        {pct !== undefined && (
          <Text>
            <Text dimColor>{'ctx'.padEnd(5)} </Text>
            <Text color={level(pct)}>{'▰'.repeat(filled)}</Text>
            <Text dimColor>{'▱'.repeat(width - filled)} </Text>
            <Text bold color={level(pct)}>{Math.round(pct)}%</Text>
          </Text>
        )}
        {u.limits.map(l => metric(LABELS[l.kind] ?? l.kind, l.percentUsed, l.resetsAt && `${span(Date.parse(l.resetsAt) - t)} left`))}
      </Box>
    ))
  })
}
