declare module 'claude-code' {
  interface PluginState {
    handoff: {
      /** 最近一次量到的 context 百分比；還沒量到是 null */
      percent: number | null
    }
  }
}
