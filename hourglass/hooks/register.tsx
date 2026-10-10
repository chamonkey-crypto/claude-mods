import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Usage } from '../types'

const usage = atom({ plugin: 'hourglass', key: 'usage' } as const, null)
const cacheAt = atom({ plugin: 'hourglass', key: 'cacheAt' } as const, null)
const clockNow = atom({ plugin: 'hourglass', key: 'now' } as const, 0)

const BAR_WIDTH = 6
const BORDER = '#c96442'

const pad2 = (n: number) => String(n).padStart(2, '0')

// 用量越高越警示：70% 轉黃、90% 轉紅
const levelColor = (percent: number) =>
  percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : 'green'

// 倒數的顏色：剩 5 分鐘以上綠、1 分鐘以上黃、再少就紅
const countdownColor = (seconds: number) =>
  seconds > 300 ? 'green' : seconds > 60 ? 'yellow' : 'red'

// 剩餘時間，例如 2:30（2 小時 30 分）
const hoursMinutes = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}`
}

// 快取倒數，例如 48:06（分:秒，分鐘可以到 60）
const minutesSeconds = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

export const register: Register = (on, options) => {
  const ttlMs = options.cacheTtl === '5m' ? 5 * 60 * 1000 : 60 * 60 * 1000
  let lastTick = 0

  on('session.start', async ($, e, next) => {
    const { context, rateLimits } = await $.session.usage()
    const first: Usage = { percent: context.percent ?? null, limits: rateLimits }
    await update($, usage, () => first)

    // 每秒跳一次讓倒數動起來；快取已過期時放慢到 30 秒一次，只為更新「重置」時間
    $.clock.every(1000, async () => {
      const now = await $.clock.now()
      const at = await read($, cacheAt)
      const isCountingDown = at !== null && at + ttlMs > now - 1000

      if (isCountingDown || now - lastTick >= 30000) {
        lastTick = now
        await update($, clockNow, () => now)
      }
    })

    return next(e)
  })

  // 額度或 context 動了一個百分點就會進來
  on('session.measure', async ($, e, next) => {
    const measured: Usage = { percent: e.context.percent ?? null, limits: e.rateLimits }
    await update($, usage, () => measured)

    return next(e)
  })

  // 一輪結束：只要最後的回應有讀寫快取，TTL 就從現在重新開始算
  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    const isCached = u !== undefined && (u.cache_read_input_tokens > 0 || u.cache_creation_input_tokens > 0)

    if (isCached && e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, cacheAt, () => now)
      await update($, clockNow, () => now)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    // 讀這個值只是為了訂閱：每次跳動都會重畫
    await read($, clockNow)

    const now = await $.clock.now()
    const used = await read($, usage)
    const at = await read($, cacheAt)
    const { Box, Text } = $.ui.resolve(e)

    const meter = (label: string, percent: number | null | undefined, tail?: string) => {
      if (percent === null || percent === undefined) {
        return (
          <Box key={label} gap={1}>
            <Text dimColor>{label}</Text>
            <Text dimColor>{'━'.repeat(BAR_WIDTH)}</Text>
            <Text dimColor>—</Text>
          </Box>
        )
      }

      const value = Math.max(0, Math.min(100, Math.round(percent)))
      let filled = Math.round((value / 100) * BAR_WIDTH)
      if (value > 0 && filled === 0) filled = 1
      const color = levelColor(value)

      return (
        <Box key={label} gap={1}>
          <Text dimColor>{label}</Text>
          <Text>
            <Text color={color}>{'━'.repeat(filled)}</Text>
            <Text dimColor>{'━'.repeat(BAR_WIDTH - filled)}</Text>
          </Text>
          <Text color={color} bold>
            {value}%
          </Text>
          {tail ? <Text dimColor>{tail}</Text> : null}
        </Box>
      )
    }

    const window = (kind: string) => used?.limits.find(l => l.kind === kind)
    const fiveHour = window('five_hour')
    const sevenDay = window('seven_day')

    const resetsIn =
      fiveHour?.resetsAt !== undefined ? (Date.parse(fiveHour.resetsAt) - now) / 1000 : null
    const resetTail = resetsIn !== null && resetsIn > 0 ? `${hoursMinutes(resetsIn)} 重置` : undefined

    // 快取：一輪進行中它正在被刷新，結束後才重新倒數
    let cache
    if (e.props.isWorking) {
      cache = (
        <Text dimColor>快取 ⋯</Text>
      )
    } else if (at === null) {
      cache = (
        <Text dimColor>快取 —</Text>
      )
    } else {
      const remaining = (at + ttlMs - now) / 1000

      cache =
        remaining > 0 ? (
          <Box gap={1}>
            <Text dimColor>快取</Text>
            <Text color={countdownColor(remaining)} bold>
              {minutesSeconds(remaining)}
            </Text>
          </Box>
        ) : (
          <Box gap={1}>
            <Text dimColor>快取</Text>
            <Text color="red">已過期</Text>
          </Box>
        )
    }

    return (
      <Box
        borderStyle="round"
        borderColor={BORDER}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box gap={2}>
          {meter('context', used?.percent)}
          {meter('5 小時', fiveHour?.percentUsed, resetTail)}
          {meter('本週', sevenDay?.percentUsed)}
        </Box>
        {cache}
      </Box>
    )
  })
}
