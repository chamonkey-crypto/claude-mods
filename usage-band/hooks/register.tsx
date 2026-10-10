import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { UsageSnapshot } from '../types'

// 超過這個百分比的項目畫成紅色
const WARN_PERCENT = 80

const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, null)

// 從 $.session.usage() 取出細帶要的四個數字；拿不到的留 null（不顯示成 0）
function toSnapshot(u: SessionUsage): UsageSnapshot {
  const five = u.rateLimits.find(r => r.kind === 'five_hour')
  const week = u.rateLimits.find(r => r.kind === 'seven_day')
  return {
    contextPercent: u.context.percent ?? null,
    fiveHourPercent: five?.percentUsed ?? null,
    fiveHourResetsAt: five?.resetsAt ?? null,
    weekPercent: week?.percentUsed ?? null,
  }
}

// 重置時間一律顯示成台灣時間（UTC+8）的「14:30」，不受執行環境的時區影響
const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000
function clockText(iso: string): string {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return '?'
  const d = new Date(ms + TAIWAN_OFFSET_MS)
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const percentText = (p: number) => `${Math.round(p)}%`

// 讀目前的用量存進快照，細帶跟著重畫
async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  await update($, snapshot, () => toSnapshot(u))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // 每一輪結束更新一次
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (e.props.hasSurvey || s === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const item = (key: string, label: string, percent: number | null, extra = '') => {
      if (percent === null) return null
      const isHigh = percent > WARN_PERCENT
      return (
        <Text key={key} color={isHigh ? 'error' : undefined} dimColor={!isHigh}>
          {label} {percentText(percent)}{extra}
        </Text>
      )
    }
    const items = [
      item('context', 'context', s.contextPercent),
      item('five', '五小時', s.fiveHourPercent, s.fiveHourResetsAt ? `（${clockText(s.fiveHourResetsAt)} 重置）` : ''),
      item('week', '本週', s.weekPercent),
    ].filter(x => x !== null)
    if (items.length === 0) return next(e)

    return (
      <Box gap={2}>
        {items}
      </Box>
    )
  })
}
