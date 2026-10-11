import type { EngineInterface, Register } from 'claude-code'

// 只看最近三十分鐘，紀錄也只留三十分鐘
const WINDOW = 30 * 60 * 1000

/** 一個對話的寫入紀錄：放在所有對話共用的資料夾，一個對話一個檔案，只有自己會寫 */
type Log = {
  sessionId: string
  /** 那個對話的工作資料夾，問你的時候用來辨認是哪個對話 */
  cwd: string
  /** 正規化後的路徑 → 原本的寫法與最後一次改的時間 */
  files: Record<string, { path: string; at: number }>
}

type Hit = { sessionId: string; cwd: string; at: number }

// 同一個檔案的不同寫法（\ 與 /、Windows 的大小寫）算同一個
const normalize = (path: string) => {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(slashed) ? slashed.toLowerCase() : slashed
}

const minutesAgo = (now: number, at: number) => {
  const minutes = Math.floor((now - at) / 60000)
  return minutes < 1 ? '不到 1 分鐘前' : `${minutes} 分鐘前`
}

const parse = (text: string): Log | undefined => {
  try {
    const log = JSON.parse(text)
    return log && typeof log.files === 'object' ? log : undefined
  } catch {
    return undefined
  }
}

// 這個對話自己的紀錄；重新載入時從檔案讀回來
let mine: Log | undefined
// 你已經說「繼續」的：檔案|對話 → 當時那個對話最後一次改的時間；它再改一次才會再問
const allowed = new Map<string, number>()
// 自己的紀錄一次寫一個，同時改好幾個檔案時不會互相蓋掉
let writing: Promise<void> = Promise.resolve()

async function folder($: EngineInterface) {
  const config =
    (await $.env.get('CLAUDE_CONFIG_DIR')) ??
    `${(await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'}/.claude`
  return `${config.replace(/\\/g, '/')}/edit-radar`
}

async function load($: EngineInterface, cwd?: string) {
  if (mine) return mine
  const sessionId = await $.session.id()
  const dir = await folder($)
  const saved = await $.fs.read(`${dir}/${sessionId}.json`).then(parse, () => undefined)
  mine = { sessionId, cwd: cwd ?? saved?.cwd ?? '', files: saved?.files ?? {} }
  return mine
}

// 別的對話在三十分鐘內改過這個檔案的紀錄
async function others($: EngineInterface, key: string, now: number) {
  const me = await load($)
  const dir = await folder($)
  const entries = await $.fs.list(dir).catch(() => [])
  const hits: Hit[] = []

  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    if (entry.name === `${me.sessionId}.json`) continue
    // 三十分鐘沒動過的檔案，裡面的紀錄一定都過期了，不用讀
    if (entry.mtimeMs && now - entry.mtimeMs > WINDOW) continue

    const log = await $.fs.read(`${dir}/${entry.name}`).then(parse, () => undefined)
    const record = log?.files[key]
    if (log && record && now - record.at <= WINDOW) {
      hits.push({ sessionId: log.sessionId, cwd: log.cwd, at: record.at })
    }
  }

  return hits.sort((a, b) => b.at - a.at)
}

function remember($: EngineInterface, path: string) {
  writing = writing.then(async () => {
    const now = await $.clock.now()
    const me = await load($)
    const files: Log['files'] = {}
    for (const [key, value] of Object.entries(me.files)) {
      if (now - value.at <= WINDOW) files[key] = value
    }
    files[normalize(path)] = { path, at: now }
    me.files = files
    await $.fs.write(`${await folder($)}/${me.sessionId}.json`, JSON.stringify(me, null, 2))
  }).catch(() => undefined)
  return writing
}

async function guard<R extends { deny?: string; isError?: boolean }>(
  $: EngineInterface,
  path: string,
  run: () => Promise<R>,
): Promise<R | { deny: string }> {
  const key = normalize(path)
  const now = await $.clock.now()
  const hits = (await others($, key, now)).filter(
    hit => (allowed.get(`${key}|${hit.sessionId}`) ?? -1) < hit.at,
  )

  if (hits.length > 0) {
    const lines = hits.map(
      hit => `${minutesAgo(now, hit.at)}，對話 ${hit.sessionId.slice(0, 8)}（${hit.cwd || '不明資料夾'}）`,
    )
    const question = `${path} 最近被別的對話改過：\n${lines.join('\n')}\n要繼續改嗎？`
    const answer = await $.ui
      .ask(question, { header: '撞檔', options: ['繼續', '取消'] })
      .catch(() => undefined)

    if (answer !== '繼續') {
      const said = answer && answer !== '取消' ? `使用者回覆：「${answer}」。` : ''
      return {
        deny: `edit-radar：${path} 在 ${minutesAgo(now, hits[0]?.at ?? now)}被另一個對話改過，使用者沒有選擇繼續，這次沒有改。${said}先不要再改這個檔案，告訴使用者情況並等指示。`,
      }
    }

    for (const hit of hits) allowed.set(`${key}|${hit.sessionId}`, hit.at)
  }

  const result = await run()
  if (result.deny === undefined && result.isError !== true) await remember($, path)
  return result
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    mine = undefined
    await load($, result.cwd)

    // 清掉三十分鐘沒動過的別人的紀錄（那些對話已經沒在改檔案了）
    const now = await $.clock.now()
    const dir = await folder($)
    for (const entry of await $.fs.list(dir).catch(() => [])) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
      if (entry.mtimeMs && now - entry.mtimeMs > WINDOW && entry.size > 2) {
        await $.fs.write(`${dir}/${entry.name}`, '{}').catch(() => undefined)
      }
    }

    return result
  })

  on('tool.call', { tool: 'Write' }, ($, e, next) => guard($, e.file_path, () => next(e))).catch(
    ($, e, next) => next(e),
  )
  on('tool.call', { tool: 'Edit' }, ($, e, next) => guard($, e.file_path, () => next(e))).catch(
    ($, e, next) => next(e),
  )
  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) =>
    guard($, e.notebook_path, () => next(e)),
  ).catch(($, e, next) => next(e))
}
