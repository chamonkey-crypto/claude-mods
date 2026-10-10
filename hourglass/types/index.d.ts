/** 一個額度視窗：five_hour、seven_day，或閘道的 spend_limit。 */
export type Limit = {
  kind: string
  percentUsed: number
  /** ISO 8601 */
  resetsAt?: string
}

/** 最近一次量到的用量：context 填滿百分比，與訂閱的額度視窗。 */
export type Usage = {
  percent: number | null
  limits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    hourglass: {
      /** 最近一次 session.usage / session.measure 的結果；還沒量到是 null */
      usage: Usage | null
      /** 最後一次刷新提示快取的時間（毫秒）；還沒有就是 null */
      cacheAt: number | null
      /** 倒數用的時鐘，每次跳動就重畫橫幅 */
      now: number
    }
  }
}
