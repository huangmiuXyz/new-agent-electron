import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWorkPath = 'E:/projects/test-project'
const mockRipgrepPath = 'C:/Users/test/.rg/rg.exe'

const mockGetWorkPath = vi.fn().mockReturnValue(mockWorkPath)
const mockGetChatById = vi.fn().mockReturnValue({ agentId: 'default' })
const mockGetAgentById = vi.fn().mockReturnValue(null)
const mockExecFileCommand = vi.fn()
const mockGetBundledRipgrepPath = vi.fn().mockReturnValue(mockRipgrepPath)
const mockInjectBundledRipgrepPath = vi.fn()
const mockCreateTab = vi.fn()
const mockHashlineRead = vi.fn()

vi.mock('./command-utils', () => ({
  getDedicatedFileToolHint: (
    command: string,
    tools: { searchTool?: string; readTool?: string; listTool?: string }
  ) => {
    const trimmed = command.trim()
    if (tools.searchTool && /^rg(?:\s|$)/.test(trimmed)) {
      return [
        '检测到 shell 文件搜索命令: rg',
        `请改用 ${tools.searchTool}。搜索工具内部会使用 bundled ripgrep，不依赖 shell PATH 中是否存在 rg。`,
        `${tools.readTool} 用于读取定位后的文件，${tools.listTool} 用于列目录；exec_command 仅用于测试、构建、包管理、git 等真正需要终端的命令。`
      ].join('\n')
    }
    if (tools.readTool && /^cat(?:\s|$)/.test(trimmed)) {
      return [
        '检测到 shell 文件读取命令: cat',
        `请改用 ${tools.readTool} 读取文件和行号范围。`,
        `需要先搜索内容或文件名时，请使用 ${tools.searchTool}；需要列目录时，请使用 ${tools.listTool}。`
      ].join('\n')
    }
    if (tools.listTool && /^ls(?:\s|$)/.test(trimmed)) {
      return [
        '检测到 shell 文件列表命令: ls',
        `请改用 ${tools.listTool} 列目录；需要搜索内容或文件名时，请使用 ${tools.searchTool}。`,
        'exec_command 仅用于测试、构建、包管理、git 等真正需要终端的命令。'
      ].join('\n')
    }
    return null
  },
  injectBundledRipgrepPath: (...args: string[]) => mockInjectBundledRipgrepPath(...args)
}))

vi.mock('../components/ApplyPatchRender.vue', () => ({
  default: {}
}))
vi.mock('../components/codex/ReadFileRender.vue', () => ({ default: {} }))
vi.mock('../components/codex/SearchProjectRender.vue', () => ({ default: {} }))
vi.mock('../components/codex/EditFileRender.vue', () => ({ default: {} }))
vi.mock('../components/codex/ListDirRender.vue', () => ({ default: {} }))
vi.mock('../components/codex/ChangeWorkingDirectoryRender.vue', () => ({ default: {} }))

const mockPathApi = {
  isAbsolute: vi.fn((p: string) => /^[A-Z]:/i.test(p) || p.startsWith('/')),
  resolve: vi.fn((...args: string[]) => args.join('/').replace(/\/+/g, '/')),
  normalize: vi.fn((p: string) => p.replace(/\/+/g, '/')),
  relative: vi.fn((from: string, to: string) => {
    if (to.startsWith(from)) return to.slice(from.length).replace(/^\//, '')
    return ''
  }),
  join: vi.fn((...args: string[]) => args.join('/').replace(/\/+/g, '/'))
}

const defaultOptions = {
  toolCallId: 'test-tool-call-id',
  chatId: 'test-chat-id',
  model: 'test-model',
  provider: 'test-provider'
}

beforeEach(() => {
  vi.stubGlobal('navigator', { platform: 'Win32' })
  vi.stubGlobal('window', {
    api: {
      path: mockPathApi,
      fs: {},
      execFileCommand: mockExecFileCommand,
      getBundledRipgrepPath: mockGetBundledRipgrepPath,
      hashline: { read: mockHashlineRead },
      process: { env: { SystemRoot: 'C:\\Windows', SHELL: '/bin/bash' } }
    }
  })

  vi.stubGlobal('useCanvasStore', () => ({
    getWorkPath: mockGetWorkPath,
    setWorkspaceRoot: vi.fn()
  }))
  vi.stubGlobal('useChatsStores', () => ({
    getChatById: mockGetChatById,
    currentChat: { agentId: 'default' }
  }))
  vi.stubGlobal('useAgentStore', () => ({
    getAgentById: mockGetAgentById
  }))
  vi.stubGlobal('useTerminal', () => ({
    createTab: mockCreateTab
  }))

  mockGetWorkPath.mockReturnValue(mockWorkPath)
  mockGetChatById.mockReturnValue({ agentId: 'default' })
  mockGetAgentById.mockReturnValue(null)
  mockInjectBundledRipgrepPath.mockImplementation((cmd: string) => cmd)
  mockExecFileCommand.mockReset()
  mockCreateTab.mockReset()
  mockHashlineRead.mockReset()
  mockCreateTab.mockResolvedValue({
    id: 'terminal-1',
    result: { output: 'terminal output' }
  })
  mockPathApi.resolve.mockImplementation((...args: string[]) => args.join('/').replace(/\/+/g, '/'))
  mockPathApi.normalize.mockImplementation((p: string) => p.replace(/\/+/g, '/'))
  mockPathApi.isAbsolute.mockImplementation((p: string) => /^[A-Z]:/i.test(p) || p.startsWith('/'))
  mockPathApi.relative.mockImplementation((from: string, to: string) => {
    if (to.startsWith(from)) return to.slice(from.length).replace(/^\//, '')
    return ''
  })
  mockGetBundledRipgrepPath.mockReturnValue(mockRipgrepPath)
})

import { getCodexBuiltinTools } from './codex-tools'

const getSearchProjectTool = () => {
  const tools = getCodexBuiltinTools()
  return tools.search_project!
}

const getExecCommandTool = () => {
  const tools = getCodexBuiltinTools()
  return tools.exec_command!
}

const getReadFileTool = () => {
  const tools = getCodexBuiltinTools()
  return tools.readFile!
}

const extractText = (result: any): string => result.toolResult.content[0].text

const successResult = (stdout = 'match result', stderr = '') => ({
  code: 0,
  stdout,
  stderr
})

const noMatchResult = (stderr = '') => ({
  code: 1,
  stdout: '',
  stderr
})

const errorResult = (code: number, stderr = '', stdout = '', errorMessage = '') => ({
  code,
  stdout,
  stderr,
  errorMessage
})

describe('search_project', () => {
  describe('inputSchema', () => {
    it('should have correct title', () => {
      const tool = getSearchProjectTool()
      expect(tool.title).toBe('项目搜索')
    })

    it('should mention ripgrep in description', () => {
      const tool = getSearchProjectTool()
      expect(tool.description).toContain('ripgrep')
      expect(tool.description).toContain('rg')
    })

    it('should have cmd in inputSchema', () => {
      const tool = getSearchProjectTool()
      const schema = tool.inputSchema as any
      expect(schema.shape.cmd).toBeDefined()
    })
  })

  describe('empty or missing cmd', () => {
    it('should return error when cmd is empty string', async () => {
      const tool = getSearchProjectTool()
      const result = await tool.execute({ cmd: '' }, defaultOptions)
      expect(extractText(result)).toBe('search_project 失败：cmd 不能为空')
    })

    it('should return error when cmd is whitespace only', async () => {
      const tool = getSearchProjectTool()
      const result = await tool.execute({ cmd: '   ' }, defaultOptions)
      expect(extractText(result)).toBe('search_project 失败：cmd 不能为空')
    })

    it('should return error when cmd property is missing', async () => {
      const tool = getSearchProjectTool()
      const result = await tool.execute({}, defaultOptions)
      expect(extractText(result)).toBe('search_project 失败：cmd 不能为空')
    })

    it('should throw when args is null (access before try/catch)', async () => {
      const tool = getSearchProjectTool()
      await expect(tool.execute(null, defaultOptions)).rejects.toThrow()
    })

    it('should throw when args is undefined (access before try/catch)', async () => {
      const tool = getSearchProjectTool()
      await expect(tool.execute(undefined, defaultOptions)).rejects.toThrow()
    })

    it('should treat numeric cmd as valid command string', async () => {
      mockExecFileCommand.mockResolvedValue(noMatchResult())

      const tool = getSearchProjectTool()
      const result = await tool.execute({ cmd: 123 }, defaultOptions)
      const text = extractText(result)

      expect(text).toContain('cmd: 123')
    })
  })

  describe('successful search (exit code 0)', () => {
    it('should return results with stdout', async () => {
      mockExecFileCommand.mockResolvedValue(successResult(
        'src/main.ts:1:const app = createApp()\nsrc/utils.ts:5:export function helper()'
      ))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "createApp" .' }, defaultOptions))

      expect(text).toContain('命令执行完成')
      expect(text).toContain('cmd: rg -n "createApp" .')
      expect(text).toContain('stdout:')
      expect(text).toContain('src/main.ts:1:const app = createApp()')
      expect(text).not.toContain('提示：')
    })

    it('should include resolved_cmd when it differs from cmd', async () => {
      mockInjectBundledRipgrepPath.mockImplementation(
        (cmd: string) => cmd.replace(/^rg/, `"${mockRipgrepPath}"`)
      )
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('cmd: rg -n "test" .')
      expect(text).toContain('resolved_cmd:')
    })

    it('should not include resolved_cmd when it equals cmd', async () => {
      mockInjectBundledRipgrepPath.mockImplementation((cmd: string) => cmd)
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('cmd: rg -n "test" .')
      expect(text).not.toContain('resolved_cmd:')
    })

    it('should include both stdout and stderr sections', async () => {
      mockExecFileCommand.mockResolvedValue({
        code: 0,
        stdout: 'found match',
        stderr: 'warning message'
      })

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('stdout:\nfound match')
      expect(text).toContain('stderr:\nwarning message')
    })

    it('should not include stderr section when stderr is empty', async () => {
      mockExecFileCommand.mockResolvedValue(successResult('found match'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('stdout:')
      expect(text).not.toContain('stderr:')
    })

    it('should include cwd in output', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('cwd:')
    })

    it('should summarize candidate files and line numbers', async () => {
      mockExecFileCommand.mockResolvedValue(successResult(
        [
          'src/main.ts:10:const app = createApp()',
          'src/main.ts:20:app.mount("#app")',
          'src/utils.ts:5:export const helper = true'
        ].join('\n')
      ))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "app" src -g "*.ts"' }, defaultOptions))

      expect(text).toContain('search_summary:')
      expect(text).toContain('candidate_files:')
      expect(text).toContain('src/main.ts (2 matches lines: 10, 20)')
      expect(text).toContain('src/utils.ts (1 match lines: 5)')
      expect(text).toContain('multi_tool_use_parallel')
    })

    it('should tell the model to refine broad searches before reading files', async () => {
      const stdout = Array.from({ length: 13 }, (_, index) => `src/file${index}.ts:1:match`).join('\n')
      mockExecFileCommand.mockResolvedValue(successResult(stdout))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "match" src' }, defaultOptions))

      expect(text).toContain('Search matched 13 files')
      expect(text).toContain('Refine with a narrower path')
      expect(text).toContain('Do not read every candidate')
    })
  })

  describe('no matches found (rg exit code 1, no stdout)', () => {
    it('should indicate no matches for rg command', async () => {
      mockExecFileCommand.mockResolvedValue(noMatchResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "nonexistent" .' }, defaultOptions))

      expect(text).toContain('命令执行完成，无标准输出')
      expect(text).toContain('（rg 未找到匹配项）')
      expect(text).toContain('cmd: rg -n "nonexistent" .')
    })

    it('should not add rg-specific annotation for non-rg command', async () => {
      mockExecFileCommand.mockResolvedValue(noMatchResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'grep -r "test" .' }, defaultOptions))

      expect(text).toContain('命令执行完成，无标准输出')
      expect(text).not.toContain('（rg 未找到匹配项）')
    })

    it('should include stderr in no-match output', async () => {
      mockExecFileCommand.mockResolvedValue(noMatchResult('some warning'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('stderr:')
      expect(text).toContain('some warning')
    })

    it('should treat exit code 1 with stdout as success (not no-match)', async () => {
      mockExecFileCommand.mockResolvedValue({
        code: 1,
        stdout: 'some output',
        stderr: ''
      })

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('命令执行完成')
      expect(text).toContain('stdout:')
      expect(text).toContain('some output')
      expect(text).not.toContain('无标准输出')
    })

    it('should include hint for non-rg command with no matches', async () => {
      mockExecFileCommand.mockResolvedValue(noMatchResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'grep -r "test" .' }, defaultOptions))

      expect(text).toContain('提示：')
    })
  })

  describe('command failure (exit code not 0 or 1)', () => {
    it('should return error with stderr message', async () => {
      mockExecFileCommand.mockResolvedValue(errorResult(2, 'error: invalid argument'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg --invalid-flag "test"' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
      expect(text).toContain('error: invalid argument')
    })

    it('should use stdout when stderr is empty', async () => {
      mockExecFileCommand.mockResolvedValue(errorResult(2, '', 'some error output'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg --bad "test"' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
      expect(text).toContain('some error output')
    })

    it('should truncate stdout to 10000 chars in error', async () => {
      const longOutput = 'x'.repeat(20000)
      mockExecFileCommand.mockResolvedValue(errorResult(2, '', longOutput))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg --bad "test"' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
      const failedPart = text.replace('search_project 失败：', '')
      expect(failedPart.length).toBeLessThanOrEqual(10000)
    })

    it('should use errorMessage as fallback', async () => {
      mockExecFileCommand.mockResolvedValue(errorResult(127, '', '', 'command not found'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
      expect(text).toContain('command not found')
    })

    it('should fallback to generic message when all outputs are empty', async () => {
      mockExecFileCommand.mockResolvedValue(errorResult(2))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('search_project 失败：command execution failed')
    })
  })

  describe('non-rg command hint', () => {
    it('should add hint when command does not start with rg', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'grep -rn "test" .' }, defaultOptions))

      expect(text).toContain('提示：')
      expect(text).toContain('search_project 是项目搜索工具')
      expect(text).toContain('rg -n "keyword" .')
    })

    it('should not add hint when command starts with rg', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).not.toContain('提示：')
    })

    it('should not add hint when command starts with whitespace then rg', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: '  rg -n "test" .' }, defaultOptions))

      expect(text).not.toContain('提示：')
    })

    it('should add hint when command starts with grep', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'grep -rn "keyword" src/' }, defaultOptions))

      expect(text).toContain('提示：')
    })

    it('should add hint for cat command', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'cat file.txt | grep pattern' }, defaultOptions))

      expect(text).toContain('提示：')
    })
  })

  describe('startsWithRipgrep detection', () => {
    it('should treat "rg" followed by space as rg command', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).not.toContain('提示：')
    })

    it('should treat "rg" at end of string as rg command', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg' }, defaultOptions))

      expect(text).not.toContain('提示：')
    })

    it('should not treat "rgx" as rg command', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rgx search' }, defaultOptions))

      expect(text).toContain('提示：')
    })

    it('should not treat rg in middle of pipe as rg command', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'cat file | rg "test"' }, defaultOptions))

      expect(text).toContain('提示：')
    })
  })

  describe('piped rg command', () => {
    it('should handle rg --files | rg pattern', async () => {
      mockExecFileCommand.mockResolvedValue(successResult('src/main.ts\nsrc/utils.ts'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg --files | rg "test"' }, defaultOptions))

      expect(text).toContain('命令执行完成')
      expect(text).toContain('stdout:')
      expect(text).toContain('src/main.ts')
    })

    it('should handle rg --files with directory and piped rg regex filter', async () => {
      mockExecFileCommand.mockResolvedValue(successResult(
        'apps/desktop/src/main/services/database.ts\napps/desktop/src/main/services/fs.ts\napps/desktop/src/main/services/logger.ts'
      ))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg --files apps/desktop/src/main/services | rg "\\.ts$"' }, defaultOptions))

      expect(text).toContain('命令执行完成')
      expect(text).toContain('stdout:')
      expect(text).toContain('apps/desktop/src/main/services/database.ts')
      expect(text).toContain('apps/desktop/src/main/services/fs.ts')
      expect(text).toContain('apps/desktop/src/main/services/logger.ts')
    })
  })

  describe('exception handling', () => {
    it('should catch error when workPath is not set', async () => {
      mockGetWorkPath.mockReturnValue(null)

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
    })

    it('should catch error when execFileCommand throws', async () => {
      mockExecFileCommand.mockRejectedValue(new Error('Network error'))

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
      expect(text).toContain('Network error')
    })

    it('should catch error when path resolution fails', async () => {
      mockGetWorkPath.mockReturnValue(null)

      const tool = getSearchProjectTool()
      const text = extractText(await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions))

      expect(text).toContain('search_project 失败：')
    })
  })

  describe('path resolution', () => {
    it('should pass cwd and maxBuffer to execFileCommand', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions)

      expect(mockExecFileCommand).toHaveBeenCalled()
      const lastCall = mockExecFileCommand.mock.calls[mockExecFileCommand.mock.calls.length - 1]
      const optionsArg = lastCall[lastCall.length - 1]
      expect(optionsArg.cwd).toBeDefined()
      expect(optionsArg.maxBuffer).toBe(8 * 1024 * 1024)
    })

    it('should use chatId from options for workPath', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      await tool.execute({ cmd: 'rg -n "test" .' }, { ...defaultOptions, chatId: 'chat-456' })

      expect(mockGetWorkPath).toHaveBeenCalledWith('chat-456')
    })

    it('should resolve relative path "." to workPath', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions)

      expect(mockGetWorkPath).toHaveBeenCalled()
    })
  })

  describe('injectBundledRipgrepPath integration', () => {
    it('should call injectBundledRipgrepPath with the user command', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions)

      expect(mockInjectBundledRipgrepPath).toHaveBeenCalledWith('rg -n "test" .')
    })

    it('should pass resolved command to execFileCommand', async () => {
      const resolvedCmd = `"${mockRipgrepPath}" -n "test" .`
      mockInjectBundledRipgrepPath.mockReturnValue(resolvedCmd)
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions)

      expect(mockExecFileCommand).toHaveBeenCalled()
    })
  })

  describe('Windows command execution', () => {
    it('should use PowerShell on Windows platform', async () => {
      mockExecFileCommand.mockResolvedValue(successResult())

      const tool = getSearchProjectTool()
      await tool.execute({ cmd: 'rg -n "test" .' }, defaultOptions)

      expect(mockExecFileCommand).toHaveBeenCalled()
      const callArgs = mockExecFileCommand.mock.calls[0]
      expect(callArgs[0]).toContain('powershell')
      expect(callArgs[1]).toEqual(
        expect.arrayContaining(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'])
      )
    })
  })
})

describe('exec_command', () => {
  it('should expose command as header summary', () => {
    const tool = getExecCommandTool()

    expect(tool.renderSummary?.({ command: 'pnpm typecheck:web' }, undefined)).toBe(
      '💻 pnpm typecheck:web'
    )
  })

  it('should steer shell rg searches to search_project without opening a terminal', async () => {
    const tool = getExecCommandTool()
    const text = extractText(await tool.execute({ command: 'rg -n "createApp" .' }, defaultOptions))

    expect(text).toContain('检测到 shell 文件搜索命令: rg')
    expect(text).toContain('请改用 search_project')
    expect(text).toContain('bundled ripgrep')
    expect(mockCreateTab).not.toHaveBeenCalled()
  })

  it('should steer shell file reads to readFile without opening a terminal', async () => {
    const tool = getExecCommandTool()
    const text = extractText(await tool.execute({ command: 'cat src/main.ts' }, defaultOptions))

    expect(text).toContain('检测到 shell 文件读取命令: cat')
    expect(text).toContain('请改用 readFile')
    expect(mockCreateTab).not.toHaveBeenCalled()
  })

  it('should run rg when search_project is not enabled for the current agent', async () => {
    const tool = getExecCommandTool()
    const text = extractText(
      await tool.execute(
        { command: 'rg -n "createApp" .' },
        { ...defaultOptions, availableBuiltinTools: ['exec_command'] } as any
      )
    )

    expect(mockCreateTab).toHaveBeenCalledWith({
      command: 'rg -n "createApp" .',
      cwd: mockWorkPath,
      id: undefined,
      toolCallId: defaultOptions.toolCallId,
      showTerminal: true
    })
    expect(text).toContain('终端ID: terminal-1')
  })

  it('should run ls when list_dir is not enabled for the current agent', async () => {
    const tool = getExecCommandTool()
    const text = extractText(
      await tool.execute(
        { command: 'ls src' },
        { ...defaultOptions, availableBuiltinTools: ['exec_command', 'search_project', 'readFile'] } as any
      )
    )

    expect(mockCreateTab).toHaveBeenCalledWith({
      command: 'ls src',
      cwd: mockWorkPath,
      id: undefined,
      toolCallId: defaultOptions.toolCallId,
      showTerminal: true
    })
    expect(text).toContain('终端ID: terminal-1')
  })

  it('should still run non-file terminal commands', async () => {
    const tool = getExecCommandTool()
    const text = extractText(await tool.execute({ command: 'npm test', terminal_id: 'terminal-1' }, defaultOptions))

    expect(mockCreateTab).toHaveBeenCalledWith({
      command: 'npm test',
      cwd: mockWorkPath,
      id: 'terminal-1',
      toolCallId: defaultOptions.toolCallId,
      showTerminal: true
    })
    expect(text).toContain('终端ID: terminal-1')
    expect(text).toContain('terminal output')
  })

  it('should truncate very large terminal output', async () => {
    mockCreateTab.mockResolvedValue({
      id: 'terminal-1',
      result: { output: 'x'.repeat(40000) }
    })

    const tool = getExecCommandTool()
    const text = extractText(await tool.execute({ command: 'npm test' }, defaultOptions))

    expect(text.length).toBeLessThan(31000)
    expect(text).toContain('output truncated')
  })
})

describe('readFile', () => {
  it('should request plain format (no hashline prefixes) in replace mode', async () => {
    mockHashlineRead.mockResolvedValue({ ok: true, text: 'alpha\nbravo' })

    const tool = getReadFileTool()
    await tool.execute({ path: 'src/app.ts', start_line: 1, end_line: 2 }, defaultOptions)

    expect(mockHashlineRead).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'src/app.ts', format: 'plain' })
    )
  })

  it('should pass through file content verbatim without escaping', async () => {
    const content = [
      'const re = /\\d+\\.\\d+/g',
      'const msg = `hello ${name}`',
      '{"key": "value\\nwith tab\\t"}',
      'console.log("she said \\"hi\\"")',
      '+payload line',
      '¶src/file.ts#ABCD',
      '\tindented'
    ].join('\n')
    mockHashlineRead.mockResolvedValue({ ok: true, text: content })

    const tool = getReadFileTool()
    const text = extractText(await tool.execute({ path: 'escape.txt' }, defaultOptions))

    expect(text).toBe(content)
  })

  it('should return error text when hashline read reports failure', async () => {
    mockHashlineRead.mockResolvedValue({ ok: false, error: 'File does not exist' })

    const tool = getReadFileTool()
    const text = extractText(await tool.execute({ path: 'missing.txt' }, defaultOptions))

    expect(text).toBe('读取文件失败: File does not exist')
  })
})
