export type Info = { model: string; effort?: string }

export type Choices = { models: string[]; efforts: string[] }

declare module 'claude-code' {
  interface PluginState {
    'model-info': { info: Info | null; choices: Choices }
  }
}
