import { describe, expect, mock, test } from 'claude-code/testing'

const T0 = Date.parse('2026-10-10T07:00:00Z')
const HOUR = 60 * 60 * 1000

const reading = {
  startedAt: 0,
  context: { window: 200000, percent: 62 },
  rateLimits: [
    {
      kind: 'five_hour',
      percentUsed: 41,
      resetsAt: new Date(T0 + 2.5 * HOUR).toISOString(),
    },
    { kind: 'seven_day', percentUsed: 23 },
  ],
}

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const cached = {
  model: 'claude-opus-5-5',
  input_tokens: 10,
  output_tokens: 20,
  cache_read_input_tokens: 5000,
  cache_creation_input_tokens: 0,
}

// 引擎底層的回應：測試要自己答每個會被呼叫的事件
const dings: unknown[] = []

const world = (on: any, usage: unknown = reading) => {
  dings.length = 0
  const clock = mock.clock(on, { now: T0 })
  on('session.usage', () => ({ value: usage }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_$: unknown, e: any) => ({ changed: e.changed }))
  on('turn.complete', (_$: unknown, e: any) => ({ text: e.answer, usage: e.usage }))
  on('turn.start', (_$: unknown, e: any) => ({ turnId: e.turnId }))
  on('ui.notify', (_$: unknown, e: any) => {
    dings.push(e.text ?? e)
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })

  return clock
}

const start = ($: any) =>
  $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

const finishTurn = ($: any, usage: Record<string, unknown>) =>
  $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage,
  })

const mount = ($: any, overrides: Record<string, unknown> = {}) =>
  $.ui.mount({
    plugin: 'hourglass',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...props, ...overrides },
  })

const shown = async (ui: any) => (await ui.find({ type: 'Box' }))?.text ?? ''

describe('hourglass', () => {
  test('畫出 context、5 小時、本週與重置時間', async ($, on) => {
    world(on)

    await start($)
    const text = await shown(await mount($))

    expect(text).toContain('context')
    expect(text).toContain('62%')
    expect(text).toContain('5 小時')
    expect(text).toContain('41%')
    expect(text).toContain('2:30 重置')
    expect(text).toContain('本週')
    expect(text).toContain('23%')
  })

  test('還沒有快取紀錄時顯示 —', async ($, on) => {
    world(on)

    await start($)

    expect(await shown(await mount($))).toContain('快取 —')
  })

  test('預設 1 小時 TTL：一輪剛結束就從 60:00 開始', async ($, on) => {
    world(on)

    await start($)
    await finishTurn($, cached)

    expect(await shown(await mount($))).toContain('60:00')
  })

  test('一輪結束後快取倒數，過了 TTL 就顯示已過期', { options: { cacheTtl: '5m' }, timeoutMs: 30000 }, async ($, on) => {
    const clock = world(on)

    await start($)
    await finishTurn($, cached)

    await clock.advance(3 * 60 * 1000 + 54 * 1000)
    // 5 分鐘 TTL，過了 3 分 54 秒，剩 01:06
    expect(await shown(await mount($))).toContain('01:06')

    await clock.advance(5 * 60 * 1000)
    expect(await shown(await mount($))).toContain('已過期')
  })

  test('沒有讀寫快取的回應不會重置倒數', async ($, on) => {
    world(on)

    await start($)
    await finishTurn($, { ...cached, cache_read_input_tokens: 0 })

    expect(await shown(await mount($))).toContain('快取 —')
  })

  test('額度跳動後橫幅跟著更新', async ($, on) => {
    world(on)

    await start($)
    await $.session.measure({
      context: { window: 200000, percent: 90 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 95 }],
      changed: ['context', 'rateLimits'],
    })
    const text = await shown(await mount($))

    expect(text).toContain('90%')
    expect(text).toContain('95%')
  })

  test('一輪進行中快取顯示 ⋯，問卷出現時讓位', async ($, on) => {
    world(on)
    // 讓位之後，由引擎底層自己畫
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)

      return <Text>engine band</Text>
    })

    await start($)

    expect(await shown(await mount($, { isWorking: true }))).toContain('快取 ⋯')

    const survey = await mount($, { hasSurvey: true })
    expect((await survey.find({ type: 'Text' }))?.text).toBe('engine band')
    expect(await survey.find({ type: 'Box' })).toBeUndefined()
  })

  test('沒有訂閱額度時，額度欄顯示 —', async ($, on) => {
    world(on, { startedAt: 0, context: { window: 200000, percent: 10 }, rateLimits: [] })

    await start($)
    const text = await shown(await mount($))

    expect(text).toContain('10%')
    expect(text).toContain('—')
  })

  test('工作中畫出進度條，沒有紀錄時只顯示經過時間', async ($, on) => {
    const clock = world(on)

    await start($)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await clock.advance(5000)
    const text = await shown(await mount($, { isWorking: true }))

    expect(text).toContain('工作')
    expect(text).toContain('00:05')
    expect(text).toContain('還沒有紀錄')
  })

  test('做完超過 10 秒會叮一聲，下一輪用平均推算剩餘時間', { timeoutMs: 30000 }, async ($, on) => {
    const clock = world(on)

    await start($)
    await $.turn.start({ text: 'a', turnId: 't1' })
    await clock.advance(20000)
    await finishTurn($, cached)
    expect(dings).toEqual(['Claude 做完了'])

    // 閒置時沒有進度條
    expect(await shown(await mount($))).not.toContain('工作')

    await $.turn.start({ text: 'b', turnId: 't2' })
    await clock.advance(5000)
    expect(await shown(await mount($, { isWorking: true }))).toContain('預估還約 00:15')
  })

  test('很快的回覆不叮', async ($, on) => {
    const clock = world(on)

    await start($)
    await $.turn.start({ text: 'a', turnId: 't1' })
    await clock.advance(3000)
    await finishTurn($, cached)

    expect(dings).toEqual([])
  })
})
