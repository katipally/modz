export type Mood = 'idle' | 'drowsy' | 'working' | 'happy' | 'oops' | 'asleep' | 'loved'

export type Activity =
  | 'think' | 'laptop' | 'hammer' | 'magnify' | 'notes' | 'web' | 'agents'
  | 'test' | 'git' | 'install' | 'build' | 'ask' | 'mcp' | 'skill' | 'plan'

// What is bothering him on top of his mood: usage near a limit, a cold cache, or a tool that has run a long time.
export type Strain = 'none' | 'hot' | 'cold' | 'slow'

// A state that takes over his whole look: sticky ones last while their cause does (perm, compact, coffee, agents,
// limit), the rest play once (error, pass, fail, bigfile, flag, hello, fireworks, offline).
export type Cue = 'perm' | 'error' | 'pass' | 'fail' | 'compact' | 'limit' | 'agents' | 'coffee' | 'bigfile' | 'offline' | 'flag' | 'hello' | 'fireworks'

export type Scene = { mood: Mood; activity: Activity; skin: string; isStill: boolean; strain: Strain; cue: Cue | null; clones: number; hash: string }

// slow and long count tools past the clock and coffee thresholds; waiting holds the tool calls with a permission prompt open,
// agents the subagents the main chat sent that still run, steps the message count of the last main request.
export type Signals = { hot: boolean; slow: number; long: number; waiting: string[]; compacting: number; limited: boolean; agents: string[]; steps: number }

export type Playing = { name: Cue; hash: string } | null

declare module 'claude-code' {
  interface PluginState {
    buddy: { mood: Mood; activity: Activity; skin: string; signals: Signals; cue: Playing }
    'cache-timer': { last: { at: number; read: number; write: number; fresh: number } | null; now: number; ttlMin: number; twinkle: number }
  }
}
