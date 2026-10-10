// 每一輪結束時記下的用量快照（細帶畫的就是這份）
export type UsageSnapshot = {
  contextPercent: number | null
  fiveHourPercent: number | null
  fiveHourResetsAt: string | null
  weekPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snapshot: UsageSnapshot | null }
  }
}
