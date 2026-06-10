import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRipgrepPath = 'C:/Users/test/.rg/rg.exe'
const mockGetBundledRipgrepPath = vi.fn().mockReturnValue(mockRipgrepPath)

beforeEach(() => {
  vi.stubGlobal('navigator', { platform: 'Win32' })
  vi.stubGlobal('window', {
    api: {
      getBundledRipgrepPath: mockGetBundledRipgrepPath
    }
  })
  mockGetBundledRipgrepPath.mockReturnValue(mockRipgrepPath)
})

afterEach(() => {
  vi.restoreAllMocks()
})

import { getDedicatedFileToolHint, injectBundledRipgrepPath } from './command-utils'

describe('injectBundledRipgrepPath', () => {
  describe('basic rg command', () => {
    it('should replace leading rg with bundled path on Windows', () => {
      const result = injectBundledRipgrepPath('rg -n "test" .')
      expect(result).toContain(mockRipgrepPath)
      expect(result).not.toMatch(/^rg\s/)
    })

    it('should preserve command arguments after rg', () => {
      const result = injectBundledRipgrepPath('rg -n "test" .')
      expect(result).toContain('-n "test" .')
    })

    it('should not modify non-rg commands', () => {
      const result = injectBundledRipgrepPath('grep -rn "test" .')
      expect(result).toBe('grep -rn "test" .')
    })

    it('should not modify commands that start with rgx', () => {
      const result = injectBundledRipgrepPath('rgx search')
      expect(result).toBe('rgx search')
    })

    it('should handle bare rg command', () => {
      const result = injectBundledRipgrepPath('rg')
      expect(result).toContain(mockRipgrepPath)
    })

    it('should preserve leading whitespace', () => {
      const result = injectBundledRipgrepPath('  rg -n "test" .')
      expect(result).toMatch(/^\s+/)
      expect(result).toContain(mockRipgrepPath)
    })
  })

  describe('piped rg commands', () => {
    it('should replace both rg commands in a pipe on Windows', () => {
      const result = injectBundledRipgrepPath('rg --files | rg "\\.ts$"')
      expect(result).toContain(mockRipgrepPath)
      const occurrences = result.split(mockRipgrepPath).length - 1
      expect(occurrences).toBe(2)
    })

    it('should replace rg in pipe with directory argument', () => {
      const result = injectBundledRipgrepPath('rg --files apps/desktop/src/main/services | rg "\\.ts$"')
      expect(result).toContain(mockRipgrepPath)
      const occurrences = result.split(mockRipgrepPath).length - 1
      expect(occurrences).toBe(2)
    })

    it('should preserve pipe structure and arguments', () => {
      const result = injectBundledRipgrepPath('rg --files | rg "\\.ts$"')
      expect(result).toContain('--files')
      expect(result).toContain('"\\.ts$"')
      expect(result).toContain('|')
    })

    it('should not treat regex alternation in double quotes as a pipeline', () => {
      const result = injectBundledRipgrepPath('rg -i "TODO|FIXME|XXX" apps/desktop/src')
      expect(result).toContain('"TODO|FIXME|XXX"')
      expect(result).not.toContain('"TODO | FIXME | XXX"')
    })

    it('should preserve regex alternation while replacing rg commands in a real pipeline', () => {
      const result = injectBundledRipgrepPath('rg -i "TODO|FIXME|XXX" apps/desktop/src | rg "\\.ts:"')
      expect(result).toContain('"TODO|FIXME|XXX"')
      expect(result).toContain('"\\.ts:"')
      const occurrences = result.split(mockRipgrepPath).length - 1
      expect(occurrences).toBe(2)
    })

    it('should replace only rg commands, not other piped commands', () => {
      const result = injectBundledRipgrepPath('cat file.txt | rg "pattern"')
      expect(result).toContain('cat file.txt')
      expect(result).toContain(mockRipgrepPath)
      const occurrences = result.split(mockRipgrepPath).length - 1
      expect(occurrences).toBe(1)
    })

    it('should handle multiple pipes with rg', () => {
      const result = injectBundledRipgrepPath('rg -n "test" . | rg "src" | rg "\\.ts"')
      expect(result).toContain(mockRipgrepPath)
      const occurrences = result.split(mockRipgrepPath).length - 1
      expect(occurrences).toBe(3)
    })
  })

  describe('when no bundled ripgrep path', () => {
    it('should return original command when getBundledRipgrepPath returns null', () => {
      mockGetBundledRipgrepPath.mockReturnValue(null)
      const result = injectBundledRipgrepPath('rg -n "test" .')
      expect(result).toBe('rg -n "test" .')
    })

    it('should return original piped command when getBundledRipgrepPath returns null', () => {
      mockGetBundledRipgrepPath.mockReturnValue(null)
      const result = injectBundledRipgrepPath('rg --files | rg "\\.ts$"')
      expect(result).toBe('rg --files | rg "\\.ts$"')
    })
  })
})

describe('getDedicatedFileToolHint', () => {
  const tools = {
    searchTool: 'search_project',
    readTool: 'readFile',
    listTool: 'list_dir'
  }

  it('should steer rg to the dedicated search tool', () => {
    const hint = getDedicatedFileToolHint('rg -n "needle" .', tools)

    expect(hint).toContain('检测到 shell 文件搜索命令: rg')
    expect(hint).toContain('请改用 search_project')
    expect(hint).toContain('bundled ripgrep')
  })

  it('should detect rg in command chains', () => {
    const hint = getDedicatedFileToolHint('npm test && rg -n "needle" .', tools)

    expect(hint).toContain('检测到 shell 文件搜索命令: rg')
  })

  it('should steer cat to the dedicated read tool', () => {
    const hint = getDedicatedFileToolHint('cat src/main.ts', tools)

    expect(hint).toContain('检测到 shell 文件读取命令: cat')
    expect(hint).toContain('请改用 readFile')
  })

  it('should steer ls to the dedicated list tool', () => {
    const hint = getDedicatedFileToolHint('ls src', tools)

    expect(hint).toContain('检测到 shell 文件列表命令: ls')
    expect(hint).toContain('请改用 list_dir')
  })

  it('should not steer search commands when search_project is unavailable', () => {
    const hint = getDedicatedFileToolHint('rg -n "needle" .', {
      readTool: 'readFile',
      listTool: 'list_dir'
    })

    expect(hint).toBeNull()
  })

  it('should not steer list commands when list_dir is unavailable', () => {
    const hint = getDedicatedFileToolHint('ls src', {
      searchTool: 'search_project',
      readTool: 'readFile'
    })

    expect(hint).toBeNull()
  })

  it('should not steer read commands when readFile is unavailable', () => {
    const hint = getDedicatedFileToolHint('cat src/main.ts', {
      searchTool: 'search_project',
      listTool: 'list_dir'
    })

    expect(hint).toBeNull()
  })

  it('should allow non-file terminal commands', () => {
    const hint = getDedicatedFileToolHint('npm test', tools)

    expect(hint).toBeNull()
  })
})
