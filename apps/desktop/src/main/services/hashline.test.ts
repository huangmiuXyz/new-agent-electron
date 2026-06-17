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
})
