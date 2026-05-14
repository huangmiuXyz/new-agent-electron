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

import { injectBundledRipgrepPath } from './command-utils'

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
