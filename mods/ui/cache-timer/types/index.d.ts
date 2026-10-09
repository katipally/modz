export type Request = { at: number; read: number; write: number; fresh: number }

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { last: Request | null; now: number; ttlMin: number; twinkle: number }
  }
}
