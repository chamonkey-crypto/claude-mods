import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const percent = atom({ plugin: 'handoff', key: 'percent' } as const, null)

// 專案裡找不到交接指令時，依序找這些交接文件
const DOCS = [
  'HANDOFF.md',
  'handoff.md',
  '交接.md',
  'docs/HANDOFF.md',
  'docs/handoff.md',
  'docs/交接.md',
  '.claude/handoff.md',
]

type Node = { type: string; props?: Record<string, unknown>; children?: unknown[] }

// 在樹裡找到 key 為 target 的元素，把 extra 插在它後面；找不到回傳 null
const insertAfter = (node: Node, target: string, extra: unknown): Node | null => {
  const kids = node.children ?? []

  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i] as Node
    if (typeof kid === 'object' && kid !== null) {
      if (kid.props?.key === target) {
        return { ...node, children: [...kids.slice(0, i + 1), extra, ...kids.slice(i + 1)] }
      }
      const inner = insertAfter(kid, target, extra)
      if (inner) {
        return { ...node, children: [...kids.slice(0, i), inner, ...kids.slice(i + 1)] }
      }
    }
  }

  return null
}

export const register: Register = (on, options) => {
  const threshold = Number(options.threshold ?? '70')

  on('session.start', async ($, e, next) => {
    const { context } = await $.session.usage()
    await update($, percent, () => context.percent ?? null)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, percent, () => e.context.percent ?? null)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const tree = await next(e)
    const used = await read($, percent)

    if (e.props.hasSurvey || used === null || used < threshold) {
      return tree
    }

    const { Button } = $.ui.resolve(e)

    const button = (
      <Button
        key="handoff"
        label="交接"
        hotkey="h"
        onPress={async () => {
          // 1. 專案或外掛有交接指令（/handoff、/交接…）就直接跑
          const commands = await $.command.list()
          const found =
            commands.find(c => c.name.toLowerCase() === 'handoff' || c.name === '交接') ??
            commands.find(c => /handoff|交接/i.test(c.name))

          if (found) {
            await $.command.run({ command: found.name })
            return
          }

          // 2. 專案有交接文件，照文件做
          for (const doc of DOCS) {
            if (await $.fs.exists(doc)) {
              await $.prompt.submit({
                text: `請照這個專案的交接文件 ${doc} 執行交接流程。做完後告訴我交接結果。`,
                asUser: true,
              })
              return
            }
          }

          // 3. 都沒有：請 Claude 照專案自己的規矩（CLAUDE.md、記憶）做
          await $.prompt.submit({
            text: '請執行這個專案的交接流程：照 CLAUDE.md 或專案慣例的交接規則，整理目前進度、決策、待辦與下一步，並寫進專案該放交接資訊的地方。若專案沒有定義交接流程，先告訴我，不要自己亂建。',
            asUser: true,
          })
        }}
      />
    )

    // 接在 context 計量旁邊；找不到 context 就補在最後一列
    const placed = insertAfter(tree as Node, 'context', button)
    if (placed) return placed as typeof tree

    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {tree}
        <Box paddingX={1}>{button}</Box>
      </Box>
    )
  })
}
