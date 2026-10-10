export type Mood = 'idle' | 'working' | 'happy' | 'oops' | 'asleep' | 'loved'

export type Gesture = 'none' | 'blink' | 'look-left' | 'look-right' | 'wave'

export type Activity = 'think' | 'laptop' | 'hammer' | 'magnify'

declare module 'claude-code' {
  interface PluginState {
    buddy: { mood: Mood; frame: number; gesture: Gesture; skin: string; activity: Activity }
  }
}
