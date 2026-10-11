import { describe, expect, mock, test } from 'claude-code/testing'

const T0 = Date.UTC(2026, 9, 11, 4, 0, 0)
const DIR = 'C:/Users/me/.claude/edit-radar'
const MIN = 60 * 1000

// 引擎底層：記憶體裡的檔案、時鐘、對話 ID，以及回答「繼續 / 取消」的人
// 引擎把路徑交給檔案系統時是 Windows 寫法（\），這裡一律換成 /
const slash = (path: string) => path.replace(/\\/g, '/')

const world = (on: any, opts: { answer?: string; sessionId?: string } = {}) => {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const asked: string[] = []
  const edited: string[] = []
  const clock = mock.clock(on, { now: T0 })

  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('session.id', () => ({ value: opts.sessionId ?? 'mine-1234' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.read', (_$: unknown, e: any) => {
    const file = files.get(slash(e.path))
    if (!file) return { deny: 'ENOENT' }
    return { value: file.text }
  })
  on('fs.write', (_$: unknown, e: any) => {
    files.set(slash(e.path), { text: e.text, mtimeMs: clock.now() })
    return { value: undefined }
  })
  on('fs.list', (_$: unknown, e: any) => ({
    value: [...files]
      .filter(([path]) => path.startsWith(slash(e.path) + '/'))
      .map(([path, f]) => ({
        name: path.slice(slash(e.path).length + 1),
        kind: 'file',
        size: f.text.length,
        mtimeMs: f.mtimeMs,
        isLink: false,
      })),
  }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_$: unknown, e: any) => {
    const question = e.questions[0].question
    asked.push(question)
    if (opts.answer === undefined) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [question]: opts.answer } } }
  })
  on('tool.call', { tool: 'Edit' }, (_$: unknown, e: any) => {
    edited.push(e.file_path)
    return { result: { filePath: e.file_path } }
  })

  // 另一個對話留下的紀錄
  const other = (sessionId: string, path: string, at: number) =>
    files.set(`${DIR}/${sessionId}.json`, {
      text: JSON.stringify({ sessionId, cwd: 'D:/work/other', files: { [path.toLowerCase()]: { path, at } } }),
      mtimeMs: at,
    })

  return { files, asked, edited, clock, other }
}

const start = ($: any) => $.session.start({ cwd: 'D:/work', surface: 'terminal', isInteractive: true })

const edit = ($: any, file_path: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' })

describe('edit-radar', () => {
  test('改完檔案會記下檔名、時間和對話 ID', async ($, on) => {
    const w = world(on)
    await start($)
    await edit($, 'D:\\work\\a.ts')

    const log = JSON.parse(w.files.get(`${DIR}/mine-1234.json`)!.text)
    expect(log.sessionId).toBe('mine-1234')
    expect(log.cwd).toBe('D:/work')
    expect(log.files['d:/work/a.ts']).toEqual({ path: 'D:\\work\\a.ts', at: T0 })
  })

  test('沒人改過就直接改，不問', async ($, on) => {
    const w = world(on)
    await start($)
    const r = await edit($, 'D:/work/a.ts')

    expect(r.deny).toBeUndefined()
    expect(w.asked).toEqual([])
    expect(w.edited).toEqual(['D:/work/a.ts'])
  })

  test('別的對話十分鐘前改過，選取消就不改', async ($, on) => {
    const w = world(on, { answer: '取消' })
    w.other('other-5678', 'D:/work/a.ts', T0 - 10 * MIN)
    await start($)
    const r = await edit($, 'd:\\work\\A.ts')

    expect(w.asked.length).toBe(1)
    expect(w.asked[0]).toContain('10 分鐘前')
    expect(w.asked[0]).toContain('other-56')
    expect(r.deny).toContain('另一個對話')
    expect(w.edited).toEqual([])
  })

  test('選繼續就改，同一筆紀錄不再問第二次', async ($, on) => {
    const w = world(on, { answer: '繼續' })
    w.other('other-5678', 'D:/work/a.ts', T0 - 10 * MIN)
    await start($)

    expect((await edit($, 'D:/work/a.ts')).deny).toBeUndefined()
    expect((await edit($, 'D:/work/a.ts')).deny).toBeUndefined()
    expect(w.asked.length).toBe(1)
    expect(w.edited.length).toBe(2)
  })

  test('對話框被關掉就當取消', async ($, on) => {
    const w = world(on)
    w.other('other-5678', 'D:/work/a.ts', T0 - 1 * MIN)
    await start($)

    expect((await edit($, 'D:/work/a.ts')).deny).toBeDefined()
    expect(w.edited).toEqual([])
  })

  test('超過三十分鐘的紀錄不算，開新對話時清掉', async ($, on) => {
    const w = world(on)
    w.other('other-5678', 'D:/work/a.ts', T0 - 31 * MIN)
    await start($)

    expect(w.files.get(`${DIR}/other-5678.json`)!.text).toBe('{}')
    expect((await edit($, 'D:/work/a.ts')).deny).toBeUndefined()
    expect(w.asked).toEqual([])
  })

  test('自己的舊紀錄過三十分鐘就刪掉', async ($, on) => {
    const w = world(on)
    await start($)
    await edit($, 'D:/work/a.ts')
    await w.clock.advance(31 * MIN)
    await edit($, 'D:/work/b.ts')

    const log = JSON.parse(w.files.get(`${DIR}/mine-1234.json`)!.text)
    expect(Object.keys(log.files)).toEqual(['d:/work/b.ts'])
  })
})
