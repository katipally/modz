export type Info = { model: string; effort?: string }

declare module 'claude-code' {
  interface PluginState {
    'model-info': { info: Info | null; style: string | null }
  }
}
