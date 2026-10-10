export type Model = 'opus' | 'sonnet' | 'haiku'

export type Field = 'max' | 'ctx'

export type Config = {
  isOn: boolean
  models: Model[]
  maxAgents: number
  contextK: number
}

declare module 'claude-code' {
  interface PluginState {
    orchestrator: { config: Config; spawned: number; editing: Field | null; isOpen: boolean; running: string[]; spin: number; openMenu: string | null }
  }
}
