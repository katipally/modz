export type Model = 'opus' | 'sonnet' | 'haiku'

export type Field = 'max' | 'ctx'

export type Config = {
  isOn: boolean
  models: Model[]
  maxAgents: number
  contextK: number
  delegate: boolean
}

declare module 'claude-code' {
  interface PluginState {
    orchestrator: {
      config: Config
      editing: Field | null
      isOpen: boolean
      running: string[]
      spawned: string[]
      retired: string[]
      saved: Config | null
      spin: number
    }
  }
}
