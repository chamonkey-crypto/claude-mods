import { expect, test } from 'claude-code/testing'

// 細帶要的用量：context 42%、五小時 85%（超過八成，要變紅）、本週 30%
const USAGE = {
  startedAt: 0,
  context: { tokens: 84000, window: 200000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 85, resetsAt: '2026-10-10T06:30:00Z' },
    { kind: 'seven_day', percentUsed: 30, resetsAt: '2026-10-14T00:00:00Z' },
  ],
}

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120 } as never

// 把畫出來的樹攤平成 { text, color } 清單，方便檢查
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
function texts(node: unknown, out: { text: string; color?: unknown }[] = []) {
  if (typeof node !== 'object' || node === null) return out
  const n = node as Node
  if (n.type === 'Text') {
    const flat = (n.children ?? []).flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('')
    out.push({ text: flat, color: n.props?.color })
  }
  for (const c of (n.children ?? []).flat(Infinity)) texts(c, out)
  return out
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`每一輪結束後顯示三項用量，超過八成的變紅（${surface}）`, async ($, on) => {
    on('session.usage', () => ({ value: USAGE }) as never)
    on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
    await $.session.start({ cwd: '/tmp', surface, isInteractive: true } as never)
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: PROPS })
    const items = texts(await ui.drawn())
    const context = items.find(t => t.text.startsWith('context'))
    const five = items.find(t => t.text.startsWith('五小時'))
    const week = items.find(t => t.text.startsWith('本週'))
    expect(context?.text).toContain('42%')
    expect(context?.color).toBeUndefined()
    expect(five?.text).toContain('85%')
    // 06:30 UTC＝台灣時間 14:30
    expect(five?.text).toContain('（14:30 重置）')
    expect(five?.color).toBe('error')
    expect(week?.text).toContain('30%')
    expect(week?.color).toBeUndefined()
  })
}

test('還沒有任何讀數時不畫細帶', async ($, on) => {
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }) as never)
  // 外掛沒有東西可畫時交給引擎：這裡代替引擎畫一個空的框
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, { key: 'engine' }) as never
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(texts(await ui.drawn()).some(t => t.text.startsWith('context'))).toBe(false)
})
