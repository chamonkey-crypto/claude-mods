import { describe, expect, test } from 'claude-code/testing'

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const reading = (percent: number) => ({
  startedAt: 0,
  context: { window: 200000, percent },
  rateLimits: [],
})

// 引擎底層：畫一條像 hourglass 的帶子，並回答交接流程會用到的呼叫
const world = (
  on: any,
  percent: number,
  opts: { commands?: string[]; files?: string[] } = {},
) => {
  const submitted: string[] = []
  const ran: string[] = []

  on('session.usage', () => ({ value: reading(percent) }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_$: unknown, e: any) => ({ changed: e.changed }))
  on('command.list', () => ({
    value: (opts.commands ?? []).map(name => ({ name, description: '', source: 'plugin' })),
  }))
  on('command.run', (_$: unknown, e: any) => {
    ran.push(e.command)
    return {}
  })
  on('fs.exists', (_$: unknown, e: any) => ({
    value: (opts.files ?? []).some(f => {
      const path = String(e.path).replace(/\\/g, '/')
      return path === f || path.endsWith('/' + f)
    }),
  }))
  on('prompt.submit', (_$: unknown, e: any) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Box key="context">
          <Text>context {percent}%</Text>
        </Box>
        <Box key="5 小時">
          <Text>5 小時</Text>
        </Box>
      </Box>
    )
  })

  return { submitted, ran }
}

const start = ($: any) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

const mount = ($: any, overrides: Record<string, unknown> = {}) =>
  $.ui.mount({
    plugin: 'handoff',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...props, ...overrides },
  })

describe('handoff', () => {
  test('context 未達 70% 沒有按鈕', async ($, on) => {
    world(on, 64)
    await start($)

    expect(await (await mount($)).find({ type: 'Button', key: 'handoff' })).toBeUndefined()
  })

  test('達 70% 按鈕出現', async ($, on) => {
    world(on, 70)
    await start($)

    expect(await (await mount($)).find({ type: 'Button', key: 'handoff' })).toBeDefined()
  })

  test('額度跳動超過門檻後按鈕出現', async ($, on) => {
    world(on, 50)
    await start($)
    await $.session.measure({
      context: { window: 200000, percent: 72 },
      rateLimits: [],
      changed: ['context'],
    })

    expect(await (await mount($)).find({ type: 'Button', key: 'handoff' })).toBeDefined()
  })

  test('問卷出現時不加按鈕', async ($, on) => {
    world(on, 90)
    await start($)

    expect(
      await (await mount($, { hasSurvey: true })).find({ type: 'Button', key: 'handoff' }),
    ).toBeUndefined()
  })

  test('有 /handoff 指令就直接跑', async ($, on) => {
    const w = world(on, 80, { commands: ['compact', 'handoff'], files: ['HANDOFF.md'] })
    await start($)
    const ui = await mount($)

    await ui.press({ key: 'handoff' })

    expect(w.ran).toEqual(['handoff'])
    expect(w.submitted).toEqual([])
  })

  test('沒有指令時照交接文件', async ($, on) => {
    const w = world(on, 80, { commands: ['compact'], files: ['docs/handoff.md'] })
    await start($)
    const ui = await mount($)

    await ui.press({ key: 'handoff' })

    expect(w.ran).toEqual([])
    expect(w.submitted[0]).toContain('docs/handoff.md')
  })

  test('都沒有時請 Claude 照專案慣例交接', async ($, on) => {
    const w = world(on, 80)
    await start($)
    const ui = await mount($)

    await ui.press({ key: 'handoff' })

    expect(w.submitted[0]).toContain('CLAUDE.md')
  })
})
