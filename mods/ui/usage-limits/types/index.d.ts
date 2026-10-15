export type Limit = { kind: string; percentUsed?: number; resetsAt?: string; isStale?: boolean }

export type Usage = { contextPercent?: number; limits: Limit[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': { usage: Usage; now: number; shownPct: number }
  }
}
