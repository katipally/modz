export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'asleep' | 'loved'

export type Activity =
  | 'think' | 'laptop' | 'hammer' | 'magnify' | 'notes' | 'web' | 'agents'
  | 'test' | 'git' | 'install' | 'build' | 'ask' | 'mcp' | 'skill' | 'plan'

// What is bothering him on top of his mood: usage near a limit, a cold cache, or a tool that has run a long time.
export type Strain = 'none' | 'hot' | 'cold' | 'slow'

export type Scene = { mood: Mood; activity: Activity; skin: string; isStill: boolean; strain: Strain }

export type Signals = { hot: boolean; slow: number }

declare module 'claude-code' {
  interface PluginState {
    buddy: { mood: Mood; activity: Activity; skin: string; signals: Signals }
    'cache-timer': { last: { at: number; read: number; write: number; fresh: number } | null; now: number; ttlMin: number; twinkle: number }
  }
}
