import { describe, it, expect, vi } from 'vitest'

vi.mock('xterm', () => ({ Terminal: class {} }))
vi.mock('xterm-addon-fit', () => ({ FitAddon: class {} }))

vi.stubGlobal('useSettingsStore', () => ({
  display: { showTerminal: false, darkMode: false, terminalHeight: 200 },
  terminal: { fontSize: 14, cursorBlink: true, fontFamily: 'monospace' },
  updateDisplaySettings: vi.fn()
}))
vi.stubGlobal('useChatsStores', () => ({ currentChat: { agentId: 'default', id: 'c1' } }))
vi.stubGlobal('useAgentStore', () => ({ getAgentById: () => null }))
vi.stubGlobal('useCanvasStore', () => ({ getWorkPath: () => null }))
vi.stubGlobal('useShortcuts', () => ({ register: vi.fn() }))

import { encodeCommandForPty, stripCommandEcho } from './useTerminal'

const BRACKETED_PASTE_START = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'

describe('encodeCommandForPty', () => {
  describe('single-line commands', () => {
    it('should append CR for simple command', () => {
      expect(encodeCommandForPty('ls -la')).toBe('ls -la\r')
    })

    it('should not use bracketed paste for single line', () => {
      const result = encodeCommandForPty('npm test')
      expect(result).not.toContain(BRACKETED_PASTE_START)
      expect(result).not.toContain(BRACKETED_PASTE_END)
    })

    it('should handle empty string', () => {
      expect(encodeCommandForPty('')).toBe('\r')
    })

    it('should preserve command content verbatim', () => {
      const cmd = 'echo "hello world" && pnpm --filter desktop typecheck'
      expect(encodeCommandForPty(cmd)).toBe(`${cmd}\r`)
    })
  })

  describe('multiline commands (LF)', () => {
    it('should wrap multiline command in bracketed paste', () => {
      const cmd = 'echo line1\necho line2'
      const result = encodeCommandForPty(cmd)
      expect(result).toBe(`${BRACKETED_PASTE_START}echo line1\recho line2${BRACKETED_PASTE_END}\r`)
    })

    it('should convert LF to CR inside bracketed paste', () => {
      const cmd = 'line1\nline2\nline3'
      const result = encodeCommandForPty(cmd)
      expect(result).toContain('line1\rline2\rline3')
      expect(result).not.toContain('line1\nline2')
    })

    it('should handle three-line heredoc-style command', () => {
      const cmd = 'cat <<EOF\nhello\nEOF'
      const result = encodeCommandForPty(cmd)
      expect(result).toBe(`${BRACKETED_PASTE_START}cat <<EOF\rhello\rEOF${BRACKETED_PASTE_END}\r`)
    })

    it('should handle PowerShell here-string', () => {
      const cmd = '$x = @"\nhello\n"@\nWrite-Output $x'
      const result = encodeCommandForPty(cmd)
      expect(result).toContain('$x = @"\rhello\r"@\rWrite-Output $x')
    })

    it('should preserve trailing newline as CR', () => {
      const cmd = 'echo hi\n'
      const result = encodeCommandForPty(cmd)
      expect(result).toBe(`${BRACKETED_PASTE_START}echo hi\r${BRACKETED_PASTE_END}\r`)
    })
  })

  describe('multiline commands (CRLF)', () => {
    it('should normalize CRLF to CR inside bracketed paste', () => {
      const cmd = 'echo line1\r\necho line2'
      const result = encodeCommandForPty(cmd)
      expect(result).toBe(`${BRACKETED_PASTE_START}echo line1\recho line2${BRACKETED_PASTE_END}\r`)
      expect(result).not.toContain('\r\n')
    })

    it('should handle mixed CRLF and LF', () => {
      const cmd = 'line1\r\nline2\nline3'
      const result = encodeCommandForPty(cmd)
      expect(result).toContain('line1\rline2\rline3')
      expect(result).not.toContain('\n')
    })
  })

  describe('multiline commands (CR only)', () => {
    it('should keep CR-only line endings inside bracketed paste', () => {
      const cmd = 'echo line1\recho line2'
      const result = encodeCommandForPty(cmd)
      expect(result).toBe(`${BRACKETED_PASTE_START}echo line1\recho line2${BRACKETED_PASTE_END}\r`)
    })
  })

  describe('bracketed paste sequence integrity', () => {
    it('should start with ESC[200~', () => {
      const result = encodeCommandForPty('a\nb')
      expect(result.startsWith('\x1b[200~')).toBe(true)
    })

    it('should end with ESC[201~ followed by CR', () => {
      const result = encodeCommandForPty('a\nb')
      expect(result.endsWith('\x1b[201~\r')).toBe(true)
    })
  })

  describe('cmd /c multiline batch with Chinese and special chars', () => {
    const cmdBatch = [
      'cmd /c "(',
      '  echo # 迷雾森林',
      '  echo.',
      '  echo 第一章 迷路',
      '  echo.',
      '  echo 林深不知道自己是第几次看表了。',
      '  echo.',
      ') > story.txt & type story.txt"'
    ].join('\n')

    it('should wrap in bracketed paste and convert all LF to CR', () => {
      const result = encodeCommandForPty(cmdBatch)
      expect(result.startsWith('\x1b[200~')).toBe(true)
      expect(result.endsWith('\x1b[201~\r')).toBe(true)
      expect(result).not.toContain('\n')
      expect(result).toContain('cmd /c "(\r')
      expect(result).toContain('  echo # 迷雾森林\r')
      expect(result).toContain('  echo.\r')
      expect(result).toContain('  echo 第一章 迷路\r')
      expect(result).toContain('  echo 林深不知道自己是第几次看表了。\r')
      expect(result).toContain(') > story.txt & type story.txt"')
    })

    it('should preserve Chinese characters verbatim', () => {
      const result = encodeCommandForPty(cmdBatch)
      expect(result).toContain('迷雾森林')
      expect(result).toContain('第一章 迷路')
      expect(result).toContain('林深不知道自己是第几次看表了。')
    })

    it('should preserve special shell characters (#, >, &, parens) verbatim', () => {
      const result = encodeCommandForPty(cmdBatch)
      expect(result).toContain('echo # 迷雾森林')
      expect(result).toContain(') > story.txt & type story.txt"')
      expect(result).toContain('cmd /c "(')
    })

    it('should not contain any LF characters in output', () => {
      const result = encodeCommandForPty(cmdBatch)
      expect(result.includes('\n')).toBe(false)
    })

    it('should handle CRLF variant of the same batch command', () => {
      const cmdBatchCRLF = cmdBatch.replace(/\n/g, '\r\n')
      const result = encodeCommandForPty(cmdBatchCRLF)
      expect(result).not.toContain('\r\n')
      expect(result).not.toContain('\n')
      expect(result).toContain('cmd /c "(\r')
      expect(result).toContain('  echo # 迷雾森林\r')
    })
  })
})

describe('stripCommandEcho', () => {
  describe('single-line command echo', () => {
    it('should remove the echoed command line', () => {
      const output = 'npm test\nresult line 1\nresult line 2'
      expect(stripCommandEcho(output, 'npm test')).toBe('result line 1\nresult line 2')
    })

    it('should preserve output after command on same line', () => {
      const output = 'npm test some output\nmore output'
      expect(stripCommandEcho(output, 'npm test')).toBe('some output\nmore output')
    })

    it('should handle command not found in output', () => {
      const output = 'completely different output'
      expect(stripCommandEcho(output, 'npm test')).toBe('completely different output')
    })

    it('should replace non-breaking spaces before matching', () => {
      const output = 'npm\u00a0test\noutput'
      expect(stripCommandEcho(output, 'npm test')).toBe('output')
    })

    it('should trim trailing whitespace', () => {
      const output = 'npm test\noutput  '
      expect(stripCommandEcho(output, 'npm test')).toBe('output')
    })
  })

  describe('multiline command echo', () => {
    it('should remove all echoed command lines for LF multiline command', () => {
      const command = 'echo line1\necho line2'
      const output = 'echo line1\necho line2\nresult1\nresult2'
      expect(stripCommandEcho(output, command)).toBe('result1\nresult2')
    })

    it('should remove echoed command lines for CRLF multiline command', () => {
      const command = 'echo line1\r\necho line2'
      const output = 'echo line1\necho line2\nresult1'
      expect(stripCommandEcho(output, command)).toBe('result1')
    })

    it('should remove echoed three-line command', () => {
      const command = 'cat <<EOF\nhello\nEOF'
      const output = 'cat <<EOF\nhello\nEOF\nhello'
      expect(stripCommandEcho(output, command)).toBe('hello')
    })

    it('should preserve command output that coincidentally matches a command line', () => {
      const command = 'echo hello\necho world'
      const output = 'echo hello\necho world\nhello\nworld'
      expect(stripCommandEcho(output, command)).toBe('hello\nworld')
    })

    it('should stop stripping if a command line does not match', () => {
      const command = 'echo line1\necho line2'
      const output = 'echo line1\ntotally different\nresult'
      expect(stripCommandEcho(output, command)).toBe('totally different\nresult')
    })

    it('should handle multiline command with trailing newline', () => {
      const command = 'echo hi\n'
      const output = 'echo hi\nhi'
      expect(stripCommandEcho(output, command)).toBe('hi')
    })

    it('should skip blank command lines against blank output lines', () => {
      const command = 'echo a\n\necho b'
      const output = 'echo a\n\necho b\na\n\nb'
      expect(stripCommandEcho(output, command)).toBe('a\n\nb')
    })

    it('should handle first command line not at index 0', () => {
      const command = 'echo line1\necho line2'
      const output = 'prompt> echo line1\necho line2\nresult'
      expect(stripCommandEcho(output, command)).toBe('result')
    })

    it('should strip echo of cmd /c multiline batch with Chinese and special chars', () => {
      const command = [
        'cmd /c "(',
        '  echo # 迷雾森林',
        '  echo.',
        '  echo 第一章 迷路',
        '  echo.',
        '  echo 林深不知道自己是第几次看表了。',
        '  echo.',
        ') > story.txt & type story.txt"'
      ].join('\n')

      const output = [
        'cmd /c "(',
        '  echo # 迷雾森林',
        '  echo.',
        '  echo 第一章 迷路',
        '  echo.',
        '  echo 林深不知道自己是第几次看表了。',
        '  echo.',
        ') > story.txt & type story.txt"',
        '# 迷雾森林',
        '',
        '第一章 迷路',
        '',
        '林深不知道自己是第几次看表了。',
        ''
      ].join('\n')

      expect(stripCommandEcho(output, command)).toBe(
        ['# 迷雾森林', '', '第一章 迷路', '', '林深不知道自己是第几次看表了。'].join('\n')
      )
    })

    it('should strip echo of cmd /c batch with CRLF command against LF output', () => {
      const command = 'cmd /c "(\r\n  echo hi\r\n)"'
      const output = 'cmd /c "(\n  echo hi\n)"\nhi'
      expect(stripCommandEcho(output, command)).toBe('hi')
    })

    it('should strip echo when terminal wraps long lines in cmd /c batch', () => {
      const longLine = '  echo ' + 'A'.repeat(200)
      const command = `cmd /c "(\n${longLine}\n)"`
      const output = `cmd /c "(\n${longLine}\n)"\n${'A'.repeat(200)}`
      expect(stripCommandEcho(output, command)).toBe('A'.repeat(200))
    })
  })

  describe('edge cases', () => {
    it('should return trimmed output when command is undefined', () => {
      expect(stripCommandEcho('output  ', undefined)).toBe('output')
    })

    it('should return trimmed output when command is empty string', () => {
      expect(stripCommandEcho('output  ', '')).toBe('output')
    })

    it('should handle empty output', () => {
      expect(stripCommandEcho('', 'npm test')).toBe('')
    })

    it('should handle output with only the command echo', () => {
      expect(stripCommandEcho('npm test', 'npm test')).toBe('')
    })
  })
})
