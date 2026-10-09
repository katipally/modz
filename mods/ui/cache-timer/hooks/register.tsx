import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, RenderElement, RenderNode } from 'claude-code'

// Claude Code's prompt cache lives 5 minutes or 1 hour depending on the account; the engine does not say which.
const TTL_CHOICES = [5, 60]
const TICK_MS = 5000

const last = atom({ plugin: 'cache-timer', key: 'last' } as const, null)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)
const ttlMin = atom({ plugin: 'cache-timer', key: 'ttlMin' } as const, 60)

const count = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// "1h 5m" past an hour, "58m" past two minutes, then "1m 40s" and "40s" for the last stretch.
const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)]
  return h ? `${h}h ${m}m` : m >= 2 ? `${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
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
    const isWarm = left > 0

    return pack(Box, below, (
      <Box key="cache-timer" flexDirection="row" flexWrap="wrap" columnGap={3}>
        <Text>
          <Text dimColor>{'cache'.padEnd(5)} </Text>
          <Text bold color={hit >= 90 ? 'success' : hit >= 70 ? 'warning' : 'error'}>{hit}% hit</Text>
          <Text dimColor> · {count(r.read)} read · {count(r.write + r.fresh)} new</Text>
        </Text>
        <Text>
          <Text color={isWarm ? 'success' : 'error'}>{isWarm ? '●' : '○'} </Text>
          <Text bold>{isWarm ? 'warm' : 'cold'}</Text>
          <Text dimColor> · {isWarm ? `${span(left)} left` : `${span(-left)} ago`}</Text>
        </Text>
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
