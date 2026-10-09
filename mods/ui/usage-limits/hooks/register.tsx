import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

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

const loadColor = (pct: number) => (pct >= 80 ? 'error' : pct >= 50 ? 'warning' : 'success')

// "6d 18h" past a day, "2h 5m" past an hour, else "27m".
const span = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000))
  const [d, h] = [Math.floor(m / 1440), Math.floor((m % 1440) / 60)]
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`
}

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

    const width = Math.max(5, Math.min(10, Math.floor(e.props.bodyColumns / 10)))
    const filled = pct === undefined ? 0 : Math.min(width, Math.max(0, Math.round((pct / 100) * width)))
    const parts = [
      pct !== undefined && (
        <Text>
          <Text dimColor>ctx </Text>
          <Text color="claude">{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
          <Text color="claude"> {Math.round(pct)}%</Text>
        </Text>
      ),
      ...u.limits.map(l => (
        <Text>
          {LABELS[l.kind] ?? l.kind} <Text bold color={loadColor(l.percentUsed)}>{Math.round(l.percentUsed)}%</Text>
          {l.resetsAt && <Text dimColor> ({span(Date.parse(l.resetsAt) - t)} left)</Text>}
        </Text>
      )),
    ].filter(p => p !== false)

    return (
      <Box flexDirection="column">
        <Box key="usage-limits" flexDirection="row" flexWrap="wrap">
          {parts.flatMap((p, i) => (i ? [<Text color="claude" bold> · </Text>, p] : [p]))}
        </Box>
        {below}
      </Box>
    )
  })
}
