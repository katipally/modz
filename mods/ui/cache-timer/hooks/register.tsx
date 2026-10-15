import { atom, read, update } from 'claude-code'
import type { Register, BoxProps, ElementConstructor, EngineInterface, RenderElement, RenderNode, Timer } from 'claude-code'

// Claude Code's prompt cache lives 5 minutes or 1 hour depending on the account; the engine does not say which.
const TTL_CHOICES: Record<string, number> = { '5m': 5, '1h': 60 }
const TINT = 'suggestion'
const TICK_MS = 5000

const last = atom({ plugin: 'cache-timer', key: 'last' } as const, null)
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, 0)
const twinkle = atom({ plugin: 'cache-timer', key: 'twinkle' } as const, 0)

// A request that reads the cache twinkles for a moment, counting frames down to nothing.
const SPARKLE = ['✦', '✧', '⋆', '✧']
const TWINKLE_MS = 180
const TWINKLE_FRAMES = 8
let twinkler: Timer | undefined
const sparkle = async ($: EngineInterface) => {
  twinkler?.cancel()
  await update($, twinkle, () => TWINKLE_FRAMES)
  twinkler = $.clock.every(TWINKLE_MS, async () => {
    await update($, twinkle, n => Math.max(0, n - 1))
    if ((await read($, twinkle)) === 0) twinkler?.cancel()
  })
}
const ttlMin = atom({ plugin: 'cache-timer', key: 'ttlMin' } as const, 60)


// "1h 5m" past an hour, "58m" past two minutes, then "1m 40s" and "40s" for the last stretch.
const span = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)]
  return h ? `${h}h ${m}m` : m >= 2 ? `${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
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


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'cache-ttl', description: 'Set how long the prompt cache stays warm: 5m or 1h', argumentHint: '5m | 1h' })
    const ttl = (await $.store.get('ttlMin')) as number | undefined
    if (ttl) await update($, ttlMin, () => ttl)
    await update($, now, () => Date.now())
    $.clock.every(TICK_MS, () => void update($, now, () => Date.now()))
    return started
  })

  // A resumed transcript's last response says how long ago the cache was last touched; its token counts come from the
  // live window when the engine has them, else only the countdown shows.
  on('classic.SessionStart', async ($, e, next) => {
    const started = await next(e)
    if ((e.source === 'resume' || e.source === 'fork') && e.seconds_since_last_response !== undefined) {
      const at = Date.now() - e.seconds_since_last_response * 1000
      const u = await $.session.usage({ breakdown: 'summary' }).then(s => s.context.breakdown?.apiUsage, () => null)
      await update($, last, () => ({ at, read: u?.cache_read_input_tokens ?? 0, write: u?.cache_creation_input_tokens ?? 0, fresh: u?.input_tokens ?? 0 }))
      await update($, now, () => Date.now())
    }
    return started
  })

  on('command.run', { command: 'cache-ttl' }, async ($, e) => {
    const ttl = TTL_CHOICES[e.args.trim()]
    const current = (await read($, ttlMin)) === 60 ? '1h' : '5m'
    if (!ttl) return { text: `Cache ttl is ${current}. Use /cache-ttl 5m or /cache-ttl 1h.` }
    await update($, ttlMin, () => ttl)
    await $.store.set('ttlMin', ttl)
    return { text: `Cache ttl set to ${e.args.trim()}.` }
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (e.agentId === undefined && u) {
      const at = Date.now()
      await update($, last, () => ({ at, read: u.cache_read_input_tokens, write: u.cache_creation_input_tokens, fresh: u.input_tokens }))
      await update($, now, () => at)
      if (u.cache_read_input_tokens > 0) await sparkle($)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const [r, , ttl, tw] = await Promise.all([read($, last), read($, now), read($, ttlMin), read($, twinkle)])
    const { Box, Text } = $.ui.resolve(e)

    const total = r ? r.read + r.write + r.fresh : 0
    const hit = r && total ? Math.floor((r.read * 100) / total) : 0
    const left = r ? r.at + ttl * 60_000 - Date.now() : 0
    const isWarm = left > 0

    return pack(Box, below, (
      <Box key="cache-timer" flexDirection="row">
        <Text>
          <Text color={TINT}>{'cache'.padEnd(5)} </Text>
          {r && total ? <Text bold color={hit >= 90 ? TINT : hit >= 70 ? 'warning' : 'error'}>{hit}%</Text> : <Text dimColor>–</Text>}
          {tw > 0 && <Text color={TINT}> {SPARKLE[tw % SPARKLE.length]}</Text>}
          <Text dimColor> · </Text>
          {r ? <Text color={isWarm ? 'success' : 'error'}>{isWarm ? span(left) : `${span(-left)} ago`}</Text> : <Text dimColor>–</Text>}
        </Text>
      </Box>
    ))
  })
}
