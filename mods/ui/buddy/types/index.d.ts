export type Mood = 'idle' | 'working' | 'happy'

declare module 'claude-code' {
  interface PluginState {
    buddy: { mood: Mood; frame: number; isBlinking: boolean }
  }
}
