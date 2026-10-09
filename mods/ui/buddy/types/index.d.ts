export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'asleep'

export type Gesture = 'none' | 'blink' | 'look-left' | 'look-right' | 'wave'

declare module 'claude-code' {
  interface PluginState {
    buddy: { mood: Mood; frame: number; gesture: Gesture; skin: string }
  }
}
