export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'asleep' | 'loved'

export type Activity = 'think' | 'laptop' | 'hammer' | 'magnify' | 'notes' | 'web' | 'agents'

export type Scene = { mood: Mood; activity: Activity; skin: string; isStill: boolean }

declare module 'claude-code' {
  interface PluginState {
    buddy: { mood: Mood; activity: Activity; skin: string }
  }
}
