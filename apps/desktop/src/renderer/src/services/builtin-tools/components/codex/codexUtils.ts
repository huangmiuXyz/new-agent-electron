// Codex 工具自定义渲染共享辅助
// 提供路径解析、canvas 打开、hashline/搜索输出解析等纯函数与工具方法。
// 与 canvas-tools.ts 的 normalizeCanvasEditPath 思路一致，但本文件不抛错，
// 越界时返回空串，由调用方决定是否禁用点击。

type MessageLike = { metadata?: { cid?: string }; chatId?: string }

export type ParsedHashlineHeader = {
  raw: string
  path: string
  tag: string
}

export type ParsedHashlineLine = {
  num: number
  text: string
}

export type ParsedHashline = {
  header: ParsedHashlineHeader | null
  lines: ParsedHashlineLine[]
  firstLine: number | null
  lastLine: number | null
}

export type SearchCandidate = {
  path: string
  count?: number
  lines: number[]
  preview?: string
}

export type ParsedSearchSummary = {
  cmd: string
  cwd: string
  candidates: SearchCandidate[]
}

export type CodexToolResult = {
  error?: string
  summary?: string
  toolResult?: {
    content?: Array<{ type?: string; text?: string }>
  }
}

/** 从 message 上解析 chatId，与 dynamic-tool.vue 的取值路径保持一致 */
export const resolveChatId = (message?: MessageLike | null): string => {
  return message?.metadata?.cid || message?.chatId || ''
}

/**
 * 把 raw/绝对路径转成 canvas 工作区相对路径（/ 开头，正斜杠）。
 * 越界或 workPath 缺失时返回空串，调用方据此禁用点击。
 */
export const toCanvasRelativePath = (rawPath: string, message?: MessageLike | null): string => {
  const inputPath = String(rawPath || '').trim()
  if (!inputPath) return ''

  const canvasStore = useCanvasStore()
  const chatId = resolveChatId(message)
  const workPath = canvasStore.getWorkPath(chatId)
  if (!workPath) return ''

  const normalizedWorkPath = window.api.path.resolve(window.api.path.normalize(workPath))

  // 去掉 diff 前缀（a/ b/）与首尾空白
  const noPrefix = inputPath.startsWith('a/') || inputPath.startsWith('b/')
    ? inputPath.slice(2)
    : inputPath

  const resolveRelative = (value: string) => {
    const resolved = window.api.path.resolve(normalizedWorkPath, value)
    return window.api.path.relative(normalizedWorkPath, resolved)
  }

  let relativePath: string
  if (!window.api.path.isAbsolute(noPrefix)) {
    relativePath = resolveRelative(noPrefix)
  } else {
    const resolved = window.api.path.resolve(window.api.path.normalize(noPrefix))
    const absRelative = window.api.path.relative(normalizedWorkPath, resolved)
    const isInside =
      absRelative === '' ||
      (!absRelative.startsWith('..') && !window.api.path.isAbsolute(absRelative))
    relativePath = isInside ? absRelative : resolveRelative(noPrefix.replace(/^[/\\]+/, ''))
  }

  const isInside =
    relativePath === '' ||
    (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInside) return ''

  // 归一化为 canvas 使用的 / 相对路径
  const cleaned = relativePath.replaceAll('\\', '/').replace(/^\/+/, '')
  return cleaned
}

/** 是否能在 canvas 中打开该文件（用于决定按钮是否可点） */
export const canOpenInCanvas = (rawPath: string, message?: MessageLike | null): boolean =>
  !!toCanvasRelativePath(rawPath, message)

/**
 * 在 canvas 中打开文件并切换到 canvas 侧栏。
 * 返回是否成功打开。
 */
export const openInCanvas = (
  rawPath: string,
  message?: MessageLike | null,
  _line?: number
): boolean => {
  const relPath = toCanvasRelativePath(rawPath, message)
  if (!relPath) return false

  const canvasStore = useCanvasStore()
  const chatId = resolveChatId(message)
  try {
    canvasStore.setActiveFilePath(relPath, chatId)
  } catch {
    return false
  }

  // 切换到 canvas 侧栏（与 canvas-tools.ts 的 openCanvasPanel 一致）
  const settingsStore = useSettingsStore()
  settingsStore.display.speechSidebarCollapsed = false
  settingsStore.display.assistantSidebarTab = 'canvas'
  return true
}

/** 统一从 codex 工具结果对象里取出文本内容 */
export const extractResultText = (result?: CodexToolResult | null): string => {
  const content = result?.toolResult?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => (typeof c?.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n')
}

/** 从结果对象里取 error 字段 */
export const extractResultError = (result?: CodexToolResult | null): string => {
  return result?.error || ''
}

/** 从结果对象里取 summary 字段（edit_file 返回） */
export const extractResultSummary = (result?: CodexToolResult | null): string => {
  return result?.summary || ''
}

const HASHLINE_HEADER_RE = /^¶(.+?)#(.+)$/

/**
 * 解析 hashline 文本：¶path#TAG 头 + 形如 `12:内容` 的正文行。
 * 兼容带前导空格、首行 `Directory listing` 之类无关文本的场景。
 */
export const parseHashline = (text: string): ParsedHashline => {
  const result: ParsedHashline = { header: null, lines: [], firstLine: null, lastLine: null }
  if (!text) return result

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let headerFound = false

  for (const line of lines) {
    if (!headerFound) {
      const m = line.trim().match(HASHLINE_HEADER_RE)
      if (m) {
        result.header = { raw: line.trim(), path: m[1], tag: m[2] }
        headerFound = true
        continue
      }
      // 头之前如果有非空非 hashline 行，跳过（如错误提示前缀）
      continue
    }

    // 正文行：`12:内容` 或 `  12:\t内容`
    const m = line.match(/^\s*(\d+):?([\s\S]*)$/)
    if (m) {
      const num = Number(m[1])
      if (Number.isFinite(num)) {
        result.lines.push({ num, text: m[2].replace(/^\t?/, '') })
        if (result.firstLine === null) result.firstLine = num
        result.lastLine = num
      }
    }
  }

  return result
}

const SEARCH_CANDIDATE_RE = /^\d+\.\s+(.+?)\s+\((\d+)\s+match/

/**
 * 从 search_project 的文本输出里提取 cmd / cwd / 候选文件。
 * 候选行形如：`1. path/to/file (3 matches lines: 12, 18 first_match: ...)`
 */
export const parseSearchSummary = (text: string): ParsedSearchSummary => {
  const out: ParsedSearchSummary = { cmd: '', cwd: '', candidates: [] }
  if (!text) return out

  const lines = text.replace(/\r\n/g, '\n').split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('cmd:')) {
      out.cmd = trimmed.slice('cmd:'.length).trim()
      continue
    }
    if (trimmed.startsWith('cwd:')) {
      out.cwd = trimmed.slice('cwd:'.length).trim()
      continue
    }
    const m = trimmed.match(SEARCH_CANDIDATE_RE)
    if (m) {
      const rest = trimmed.slice(m[0].length).trim()
      const candidate: SearchCandidate = {
        path: m[1],
        count: Number(m[2])
      }
      const linesMatch = rest.match(/lines:\s*([0-9,\s]+)/)
      if (linesMatch) {
        candidate.lines = linesMatch[1]
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      }
      const previewMatch = rest.match(/first_match:\s*(.*)$/)
      if (previewMatch) {
        candidate.preview = previewMatch[1].trim()
      }
      out.candidates.push(candidate)
    }
  }

  return out
}

/** 复制文本到剪贴板，返回是否成功 */
export const copyText = async (text: string): Promise<boolean> => {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** 把路径里的反斜杠统一成正斜杠，便于展示 */
export const toDisplayPath = (rawPath: string): string =>
  String(rawPath || '').replaceAll('\\', '/')

/** 缩略长文本，超出加省略号 */
export const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
