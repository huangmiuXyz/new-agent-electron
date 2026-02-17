import { z } from 'zod'
import ignore from 'ignore'
import ApplyPatchRender from '../components/ApplyPatchRender.vue'
import { applyPatchActions, runParallelExec, validateReadOnlyCommand } from './codex-utils'

const resolvePath = (rawPath: string): string => {
  const baseDir = useAgentStore().selectedAgent?.terminalStartupPath
  if (!baseDir) {
    throw new Error('未设置 terminalStartupPath，已禁止回退路径解析')
  }
  const normalizedBaseDir = window.api.path.resolve(window.api.path.normalize(baseDir))
  const inputPath = rawPath.trim()
  const resolvedPath = window.api.path.isAbsolute(inputPath)
    ? window.api.path.resolve(window.api.path.normalize(inputPath))
    : window.api.path.resolve(normalizedBaseDir, inputPath)

  const relativePath = window.api.path.relative(normalizedBaseDir, resolvedPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`路径越界：仅允许访问 terminalStartupPath 内文件 (${normalizedBaseDir})`)
  }

  return resolvedPath
}

const DEFAULT_EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', 'out', '.turbo']
const MAX_FILE_SIZE_BYTES = 1024 * 1024

const isProbablyBinary = (content: string): boolean => content.includes('\u0000')

const formatContextPreview = (
  lines: string[],
  lineIndex: number,
  contextLines: number,
  highlightStart: number,
  highlightEnd: number,
  maxPreviewChars: number
): string => {
  const truncateLineForPreview = (
    rawLine: string,
    maxChars: number,
    focusStart?: number,
    focusEnd?: number
  ): { text: string; highlightStart: number; highlightEnd: number } => {
    if (rawLine.length <= maxChars) {
      return {
        text: rawLine,
        highlightStart: focusStart ?? -1,
        highlightEnd: focusEnd ?? -1
      }
    }

    const safeMaxChars = Math.max(20, maxChars)
    if (typeof focusStart !== 'number' || typeof focusEnd !== 'number') {
      const text = `${rawLine.slice(0, safeMaxChars - 3)}...`
      return { text, highlightStart: -1, highlightEnd: -1 }
    }

    const focusCenter = Math.floor((focusStart + focusEnd) / 2)
    const maxSliceStart = Math.max(0, rawLine.length - safeMaxChars)
    const sliceStart = Math.min(Math.max(0, focusCenter - Math.floor(safeMaxChars / 2)), maxSliceStart)
    const sliceEnd = Math.min(rawLine.length, sliceStart + safeMaxChars)
    const prefix = sliceStart > 0 ? '...' : ''
    const suffix = sliceEnd < rawLine.length ? '...' : ''
    const text = `${prefix}${rawLine.slice(sliceStart, sliceEnd)}${suffix}`
    const offset = prefix.length - sliceStart

    return {
      text,
      highlightStart: Math.max(0, focusStart + offset),
      highlightEnd: Math.min(text.length, focusEnd + offset)
    }
  }

  const start = Math.max(0, lineIndex - contextLines)
  const end = Math.min(lines.length - 1, lineIndex + contextLines)
  const rendered: string[] = []

  for (let i = start; i <= end; i += 1) {
    const lineNo = i + 1
    const raw = lines[i] ?? ''
    const truncated =
      i === lineIndex
        ? truncateLineForPreview(raw, maxPreviewChars, highlightStart, highlightEnd)
        : truncateLineForPreview(raw, maxPreviewChars)
    const tagged =
      i === lineIndex
        ? `${truncated.text.slice(0, truncated.highlightStart)}[[${truncated.text.slice(
            truncated.highlightStart,
            truncated.highlightEnd
          )}]]${truncated.text.slice(truncated.highlightEnd)}`
        : truncated.text
    rendered.push(`${lineNo} | ${tagged}`)
  }

  return rendered.join('\n')
}

type MatchResult = {
  filePath: string
  line: number
  column: number
  preview: string
}

const searchInFile = (options: {
  content: string
  filePath: string
  query: string
  mode: 'substring' | 'regex'
  caseSensitive: boolean
  contextLines: number
  maxPreviewChars: number
  maxResults: number
  currentResultCount: number
}): MatchResult[] => {
  const {
    content,
    filePath,
    query,
    mode,
    caseSensitive,
    contextLines,
    maxPreviewChars,
    maxResults,
    currentResultCount
  } = options
  const lines = content.split(/\r?\n/)
  const matches: MatchResult[] = []

  if (mode === 'regex') {
    let regex: RegExp
    try {
      regex = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } catch (error) {
      throw new Error(`正则表达式无效: ${(error as Error).message}`)
    }
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      regex.lastIndex = 0
      let match = regex.exec(line)
      while (match) {
        const start = match.index
        const end = start + (match[0]?.length ?? 0)
        matches.push({
          filePath,
          line: i + 1,
          column: start + 1,
          preview: formatContextPreview(lines, i, contextLines, start, end, maxPreviewChars)
        })
        if (currentResultCount + matches.length >= maxResults) {
          return matches
        }
        if (match[0] === '') {
          regex.lastIndex += 1
        }
        match = regex.exec(line)
      }
    }
    return matches
  }

  const needle = caseSensitive ? query : query.toLowerCase()
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const haystack = caseSensitive ? line : line.toLowerCase()
    let from = 0
    while (true) {
      const found = haystack.indexOf(needle, from)
      if (found === -1) break
      matches.push({
        filePath,
        line: i + 1,
        column: found + 1,
        preview: formatContextPreview(
          lines,
          i,
          contextLines,
          found,
          found + needle.length,
          maxPreviewChars
        )
      })
      if (currentResultCount + matches.length >= maxResults) {
        return matches
      }
      from = found + Math.max(needle.length, 1)
    }
  }
  return matches
}

const walkSearchFiles = (rootDir: string, excludeDirs: string[], extensions?: string[]): string[] => {
  const ig = ignore()
  const gitignorePath = window.api.path.join(rootDir, '.gitignore')
  if (window.api.fs.existsSync(gitignorePath)) {
    try {
      ig.add(window.api.fs.readFileSync(gitignorePath, 'utf-8'))
    } catch {
      // ignore read errors
    }
  }

  const queue = [rootDir]
  const files: string[] = []
  const normalizedExts = extensions?.map((ext) =>
    ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  )

  while (queue.length > 0) {
    const currentDir = queue.pop()!
    let entries: string[] = []
    try {
      entries = window.api.fs.readdirSync(currentDir) as string[]
    } catch {
      continue
    }

    for (const entryName of entries) {
      const fullPath = window.api.path.join(currentDir, entryName)
      const relativePath = window.api.path.relative(rootDir, fullPath).replaceAll('\\', '/')
      if (relativePath && (ig.ignores(relativePath) || ig.ignores(`${relativePath}/`))) continue

      let stat: any
      try {
        stat = window.api.fs.lstatSync(fullPath)
      } catch {
        continue
      }

      const mode = stat.mode & 0o170000
      const isDir = mode === 0o040000
      const isFile = mode === 0o100000

      if (isDir) {
        if (!excludeDirs.includes(entryName)) queue.push(fullPath)
        continue
      }
      if (!isFile) continue

      if (normalizedExts && normalizedExts.length > 0) {
        const ext = window.api.path.extname(entryName).toLowerCase()
        if (!normalizedExts.includes(ext)) continue
      }
      files.push(fullPath)
    }
  }

  return files
}

export const getCodexBuiltinTools = (): Partial<Tools> => ({
  readFile: {
    title: '读取文件',
    description: '读取本地文件内容',
    inputSchema: z.object({
      path: z.string().describe('要读取的文件路径，支持相对路径（基于 terminalStartupPath）或绝对路径'),
      encoding: z.enum(['utf-8']).optional().default('utf-8').describe('文件编码，默认 utf-8')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const rawPath = params.path as string

      if (!rawPath) {
        return { toolResult: { content: [{ type: 'text', text: '读取文件失败：path 不能为空' }] } }
      }

      try {
        const filePath = resolvePath(rawPath)
        if (!window.api.fs.existsSync(filePath)) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `读取文件失败：文件不存在 ${filePath}` }]
            }
          }
        }
        const stat = window.api.fs.lstatSync(filePath)
        const isDir = (stat.mode & 0o170000) === 0o040000
        if (isDir) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `读取文件失败：目标是目录而非文件 ${filePath}` }]
            }
          }
        }
        const content = window.api.fs.readFileSync(filePath, 'utf-8')
        return { toolResult: { content: [{ type: 'text', text: content }] } }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `读取文件失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  search_project: {
    title: '项目全局搜索',
    description: '在项目目录中按关键词进行全局搜索，支持正则、扩展名过滤、排除目录和上下文预览',
    inputSchema: z.object({
      query: z.string().describe('要搜索的关键词或正则表达式'),
      path: z
        .string()
        .optional()
        .default('.')
        .describe('搜索根目录，支持相对路径（基于 terminalStartupPath）或绝对路径'),
      mode: z
        .enum(['substring', 'regex'])
        .optional()
        .default('substring')
        .describe('匹配模式：substring 为普通关键词，regex 为正则表达式'),
      caseSensitive: z.boolean().optional().default(false).describe('是否区分大小写，默认 false'),
      extensions: z
        .array(z.string())
        .optional()
        .describe('可选扩展名过滤，如 [".ts", ".vue", ".md"]；不传表示搜索全部文件'),
      excludeDirs: z
        .array(z.string())
        .optional()
        .default(DEFAULT_EXCLUDE_DIRS)
        .describe(`排除目录名，默认 ${DEFAULT_EXCLUDE_DIRS.join(', ')}`),
      contextLines: z
        .number()
        .int()
        .min(0)
        .max(5)
        .optional()
        .default(1)
        .describe('每条匹配前后展示的上下文行数，范围 0-5，默认 1'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe('最大返回条数，范围 1-200，默认 50'),
      maxPreviewChars: z
        .number()
        .int()
        .min(60)
        .max(500)
        .optional()
        .default(200)
        .describe('每行预览的最大字符数，范围 60-500，默认 200')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const query = String(params.query || '').trim()
      if (!query) {
        return { toolResult: { content: [{ type: 'text', text: '搜索失败：query 不能为空' }] } }
      }

      try {
        const rootDir = resolvePath(String(params.path || '.'))
        if (!window.api.fs.existsSync(rootDir)) {
          return {
            toolResult: { content: [{ type: 'text', text: `搜索失败：目录不存在 ${rootDir}` }] }
          }
        }

        const stat = window.api.fs.lstatSync(rootDir)
        const isDir = (stat.mode & 0o170000) === 0o040000
        if (!isDir) {
          return {
            toolResult: { content: [{ type: 'text', text: `搜索失败：路径不是目录 ${rootDir}` }] }
          }
        }

        const mode = params.mode === 'regex' ? 'regex' : 'substring'
        const caseSensitive = Boolean(params.caseSensitive)
        const extensions = Array.isArray(params.extensions)
          ? params.extensions.filter((ext: unknown) => typeof ext === 'string' && ext.trim().length > 0)
          : undefined
        const excludeDirs = Array.isArray(params.excludeDirs)
          ? params.excludeDirs.filter((dir: unknown) => typeof dir === 'string' && dir.trim().length > 0)
          : DEFAULT_EXCLUDE_DIRS
        const contextLines =
          typeof params.contextLines === 'number' ? Math.max(0, Math.min(5, params.contextLines)) : 1
        const maxResults =
          typeof params.maxResults === 'number' ? Math.max(1, Math.min(200, params.maxResults)) : 50
        const maxPreviewChars =
          typeof params.maxPreviewChars === 'number'
            ? Math.max(60, Math.min(500, params.maxPreviewChars))
            : 200

        const files = walkSearchFiles(rootDir, excludeDirs, extensions)
        const results: MatchResult[] = []

        for (const filePath of files) {
          if (results.length >= maxResults) break
          try {
            const fileStat = window.api.fs.lstatSync(filePath)
            if (fileStat.size > MAX_FILE_SIZE_BYTES) continue
            const content = window.api.fs.readFileSync(filePath, 'utf-8')
            if (isProbablyBinary(content)) continue

            const matches = searchInFile({
              content,
              filePath,
              query,
              mode,
              caseSensitive,
              contextLines,
              maxPreviewChars,
              maxResults,
              currentResultCount: results.length
            })
            results.push(...matches)
          } catch {
            continue
          }
        }

        if (results.length === 0) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text:
                    `未找到匹配结果\nquery: ${query}\npath: ${rootDir}\n` +
                    `excludeDirs: ${excludeDirs.join(', ')}\n扫描文件数: ${files.length}`
                }
              ]
            }
          }
        }

        const output = results
          .slice(0, maxResults)
          .map((item, index) => {
            const relativePath = window.api.path.relative(rootDir, item.filePath) || '.'
            return `#${index + 1} ${relativePath}:${item.line}:${item.column}\n${item.preview}`
          })
          .join('\n\n')

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text:
                  `搜索完成：找到 ${Math.min(results.length, maxResults)} 条结果` +
                  `${results.length >= maxResults ? `（已截断到 ${maxResults} 条）` : ''}\n` +
                  `query: ${query}\npath: ${rootDir}\n` +
                  `excludeDirs: ${excludeDirs.join(', ')}\n扫描文件数: ${files.length}\n\n${output}`
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `搜索失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  exec_command: {
    title: '执行cmd命令',
    description: '执行cmd命令',
    inputSchema: z.object({
      command: z.string().describe('要执行的命令'),
      id: z
        .string()
        .optional()
        .describe('终端ID，默认创建新终端，创建新终端后才可以获得，用户无法提供')
    }),
    needsApproval: true,
    execute: async (args: any, options: any) => {
      const { command, id } = args
      const { createTab } = useTerminal()
      const encodedCommand = btoa(String.fromCharCode(...new TextEncoder().encode(command)))
      const wrappedCommand = `cmd_file="/tmp/agentqi_$(date +%s)_$RANDOM" && echo "${encodedCommand}" | base64 -d > "$cmd_file" && bash "$cmd_file"; rm -f "$cmd_file"`

      const { id: tabId, result } = await createTab({
        command: wrappedCommand,
        id,
        toolCallId: options.toolCallId,
        showTerminal: true
      })
      return {
        toolResult: { content: [{ type: 'stdout', text: `终端ID: ${tabId}\n${result!.output}` }] }
      }
    }
  },
  apply_patch: {
    title: 'apply_patch',
    description:
      '按 hunk 精确编辑文件。patch 必须使用 *** Begin Patch / *** End Patch 包裹，并使用 Add/Update/Delete File 语法。',
    inputSchema: z.object({
      patch: z
        .string()
        .describe(
          '完整 patch 文本。必须包含 "*** Begin Patch" 和 "*** End Patch"，并使用 + / - / 空格前缀表示新增、删除、上下文行。'
        )
    }),
    render: ApplyPatchRender,
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const patchText =
        typeof args === 'string' ? args : typeof params.patch === 'string' ? params.patch : ''

      if (!patchText.trim()) {
        return {
          error: 'patch 不能为空',
          toolResult: {
            content: [{ type: 'text', text: 'apply_patch 失败：patch 不能为空' }]
          }
        }
      }

      const baseDir = useAgentStore().selectedAgent!.terminalStartupPath!
      try {
        const summaries = applyPatchActions(patchText, baseDir)
        return {
          summaries,
          toolResult: {
            content: [{ type: 'text', text: `Patch applied successfully.\n${summaries.join('\n')}` }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `apply_patch 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  parallel: {
    title: 'parallel',
    description:
      '并行执行多个工具调用。当前仅支持 recipient_name 为 exec_command，且命令必须是只读命令。',
    inputSchema: z.object({
      tool_uses: z
        .array(
          z.object({
            recipient_name: z.string().describe('工具名，当前仅支持 "exec_command"'),
            parameters: z
              .object({
                cmd: z.string().describe('要执行的只读命令'),
                workdir: z.string().optional().describe('命令工作目录'),
                shell: z.string().optional().describe('shell 路径，默认系统 shell'),
                yield_time_ms: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe('命令超时时间（毫秒）'),
                max_output_tokens: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe('输出截断上限（近似 token 数）'),
                login: z.boolean().optional().describe('兼容字段，当前忽略'),
                tty: z.boolean().optional().describe('兼容字段，当前忽略'),
                sandbox_permissions: z.string().optional().describe('兼容字段，当前忽略'),
                justification: z.string().optional().describe('兼容字段，当前忽略'),
                prefix_rule: z.array(z.string()).optional().describe('兼容字段，当前忽略')
              })
              .passthrough()
          })
        )
        .min(1)
        .describe('要并行执行的工具调用列表')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const toolUses = Array.isArray(params.tool_uses) ? params.tool_uses : []

      if (toolUses.length === 0) {
        return {
          error: 'tool_uses 不能为空',
          toolResult: {
            content: [{ type: 'text', text: 'parallel 失败：tool_uses 不能为空' }]
          }
        }
      }

      const results = await Promise.all(
        toolUses.map(async (toolUse: any, index: number) => {
          const recipientName =
            typeof toolUse?.recipient_name === 'string' ? toolUse.recipient_name : ''
          const rawParams = (toolUse?.parameters || {}) as Record<string, any>
          const cmd = typeof rawParams.cmd === 'string' ? rawParams.cmd : ''

          if (recipientName !== 'exec_command') {
            return {
              index,
              recipient_name: recipientName || '<empty>',
              ok: false,
              error: `仅支持 recipient_name=exec_command，收到: ${recipientName || '<empty>'}`
            }
          }

          const validation = validateReadOnlyCommand(cmd)
          if (!validation.ok) {
            return {
              index,
              recipient_name: recipientName,
              ok: false,
              error: validation.reason
            }
          }

          const output = await runParallelExec({
            cmd,
            workdir: typeof rawParams.workdir === 'string' ? rawParams.workdir : undefined,
            shell: typeof rawParams.shell === 'string' ? rawParams.shell : undefined,
            yield_time_ms:
              typeof rawParams.yield_time_ms === 'number' ? rawParams.yield_time_ms : undefined,
            max_output_tokens:
              typeof rawParams.max_output_tokens === 'number'
                ? rawParams.max_output_tokens
                : undefined
          })

          return {
            index,
            recipient_name: recipientName,
            ok: output.ok,
            error: output.error,
            output: {
              exit_code: output.exitCode,
              stdout: output.stdout,
              stderr: output.stderr
            }
          }
        })
      )

      const successCount = results.filter((item) => item.ok).length
      const summary = results
        .map((item) => {
          if (!item.ok) {
            return `[${item.index}] ${item.recipient_name} FAILED\n${item.error}`
          }
          const stdout = item.output?.stdout || '<empty>'
          const stderr = item.output?.stderr ? `\nstderr:\n${item.output.stderr}` : ''
          return `[${item.index}] ${item.recipient_name} exit=${item.output?.exit_code}\nstdout:\n${stdout}${stderr}`
        })
        .join('\n\n')

      return {
        results,
        toolResult: {
          content: [
            {
              type: 'text',
              text: `parallel completed: ${successCount}/${results.length} succeeded.\n\n${summary}`
            }
          ]
        }
      }
    }
  }
})
