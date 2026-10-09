import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, RenderElement, RenderNode } from 'claude-code'

// Claude Code's prompt cache lives 5 minutes or 1 hour depending on the account; the engine does not say which.
const TTL_CHOICES = [5, 60]
const TICK_MS = 5000

const last = atom({ plugin: 'cache-timer', key: 'last' } as const, null)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)
const ttlMin = atom({ plugin: 'cache-timer', key: 'ttlMin' } as const, 60)

const hitColor = (pct: number) => (pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'error')
const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// "1h 5m" past an hour, "4m 30s" past a minute, else "40s".
const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)]
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
}

// Every modz mod adds its tile to one shared wrapping row, so tiles pack side by side and reflow as the width changes.
const BAND = 'modz-band'
const ORDER = ['usage-limits', 'cache-timer', 'model-info', 'orchestrator']
const rank = (n: RenderNode) => {
  const i = typeof n !== 'string' && n.type === 'Box' ? ORDER.indexOf(String(n.props?.key)) : -1
  return i < 0 ? ORDER.length : i
}
const pack = (Box: ElementConstructor<BoxProps>, below: RenderElement, tile: RenderElement) => {
  const isBand = below.type === 'Box' && below.props?.key === BAND
  const isEmpty = below.type === 'Box' && !below.children?.length
  const tiles = isBand ? (below.children ?? []) : isEmpty ? [] : [below]
  return (
    <Box key={BAND} flexDirection="row" flexWrap="wrap" columnGap={3}>
      {[...tiles, tile].sort((a, b) => rank(a) - rank(b))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ttl = (await $.store.get('ttlMin')) as number | undefined
    if (ttl) await update($, ttlMin, () => ttl)
    await update($, now, () => Date.now())
    $.clock.every(TICK_MS, () => void update($, now, () => Date.now()))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (e.agentId === undefined && u) {
      const at = Date.now()
      await update($, last, () => ({ at, read: u.cache_read_input_tokens, write: u.cache_creation_input_tokens, fresh: u.input_tokens }))
      await update($, now, () => at)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const [r, , ttl] = await Promise.all([read($, last), read($, now), read($, ttlMin)])
    const t = Date.now()
    if (!r) return below
    const { Box, Button, Text } = $.ui.resolve(e)

    const total = r.read + r.write + r.fresh
    const hit = total ? Math.floor((r.read * 100) / total) : 0
    const left = r.at + ttl * 60_000 - t
    const dot = <Text color="claude" bold> · </Text>

    return pack(Box, below, (
      <Box key="cache-timer" flexDirection="row" flexWrap="wrap">
        <Text>
          <Text dimColor>cache </Text>
          <Text bold color={hitColor(hit)}>{hit}% hit</Text>
          <Text dimColor> {count(r.read)} read / {count(r.write + r.fresh)} new</Text>
        </Text>
        {dot}
        {left > 0
          ? <Text><Text bold color="success">● warm</Text><Text dimColor> {span(left)} left</Text></Text>
          : <Text><Text bold color="error">○ cold</Text><Text dimColor> for {span(-left)}</Text></Text>}
        {dot}
        <Button
          key="ttl"
          plain
          dimColor
          label={`ttl ${ttl === 60 ? '1h' : `${ttl}m`}`}
          onPress={async () => {
            const nextTtl = TTL_CHOICES[(TTL_CHOICES.indexOf(ttl) + 1) % TTL_CHOICES.length]!
            await update($, ttlMin, () => nextTtl)
            await $.store.set('ttlMin', nextTtl)
          }}
        />
      </Box>
    ))
  })
}
