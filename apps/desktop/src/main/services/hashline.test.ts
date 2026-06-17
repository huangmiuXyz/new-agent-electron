import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  applyHashlineOperations,
  computeSnapshotTag,
  executeHashlineRead,
  formatHashLines,
  parseHashlineOperations
} from './hashline'

describe('parseHashlineOperations', () => {
  it('accepts insert-after syntax', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`insert after 2:\n+inserted line`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nbravo\ninserted line\ncharlie')
  })

  it('accepts multi-line replacement payloads', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`replace 2..2:\n+first\n+second`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nfirst\nsecond\ncharlie')
  })

  it('accepts delete syntax', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations('delete 2')

    expect(applyHashlineOperations(source, operations)).toBe('alpha\ncharlie')
  })

  it('formats read output body lines with line numbers only', () => {
    expect(formatHashLines('alpha\nbravo')).toBe('1:alpha\n2:bravo')
    expect(computeSnapshotTag('alpha\nbravo')).toMatch(/^[0-9A-F]{4}$/)
  })
})

describe('executeHashlineRead', () => {
  it('returns plain selected text without hashline prefixes', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    await writeFile(path.join(baseDir, 'sample.txt'), 'alpha\nbravo\ncharlie', 'utf-8')

    await expect(
      executeHashlineRead({
        baseDir,
        path: 'sample.txt',
        start_line: 2,
        end_line: 2,
        format: 'plain'
      })
    ).resolves.toBe('alpha\nbravo\ncharlie')
  })

  it('preserves backslashes, template literals and JSON quotes in plain mode', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    const content = [
      'const re = /\\d+\\.\\d+/g',
      'const msg = `hello ${name}`',
      '{"key": "value\\nwith tab\\t"}',
      'console.log("she said \\"hi\\"")'
    ].join('\n')
    await writeFile(path.join(baseDir, 'escape.txt'), content, 'utf-8')

    await expect(
      executeHashlineRead({ baseDir, path: 'escape.txt', format: 'plain' })
    ).resolves.toBe(content)
  })

  it('preserves leading whitespace and tabs in plain mode', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    const content = ['\tindented', '    spaces', '\t\tdeep'].join('\n')
    await writeFile(path.join(baseDir, 'ws.txt'), content, 'utf-8')

    await expect(
      executeHashlineRead({ baseDir, path: 'ws.txt', format: 'plain' })
    ).resolves.toBe(content)
  })

  it('preserves unicode and emoji in plain mode', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    const content = '中文测试 🚀 にほんご ñ üÉ — em—dash'.concat('\n', '¶slash#TAG +payload')
    await writeFile(path.join(baseDir, 'uni.txt'), content, 'utf-8')

    await expect(
      executeHashlineRead({ baseDir, path: 'uni.txt', format: 'plain' })
    ).resolves.toBe(content)
  })

  it('does not mangle lines that look like hashline operations in plain mode', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    const content = [
      'replace 2..3:',
      '+added line',
      '¶src/file.ts#ABCD',
      'delete 5',
      '*** End Patch'
    ].join('\n')
    await writeFile(path.join(baseDir, 'ops.txt'), content, 'utf-8')

    await expect(
      executeHashlineRead({ baseDir, path: 'ops.txt', format: 'plain' })
    ).resolves.toBe(content)
  })

  it('preserves CRLF line endings as LF after normalization in plain mode', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    await writeFile(path.join(baseDir, 'crlf.txt'), 'line1\r\nline2\r\nline3', 'utf-8')

    await expect(
      executeHashlineRead({ baseDir, path: 'crlf.txt', format: 'plain' })
    ).resolves.toBe('line1\nline2\nline3')
  })

  it('renders hashline mode without escaping file content', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-read-file-'))
    const content = ['const re = /\\n\\t/', '`template ${x}`', '+payload line'].join('\n')
    await writeFile(path.join(baseDir, 'hash.txt'), content, 'utf-8')

    const out = await executeHashlineRead({ baseDir, path: 'hash.txt', format: 'hashline' })

    // The header, lines metadata and each source line must appear verbatim (no escaping).
    expect(out).toContain('¶hash.txt#')
    expect(out).toContain('1:const re = /\\n\\t/')
    expect(out).toContain('2:`template ${x}`')
    expect(out).toContain('3:+payload line')
  })
})
