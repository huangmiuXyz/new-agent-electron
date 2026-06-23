import { mkdtemp, readFile, stat, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { computeSnapshotTag, executeHashlineRead } from './hashline'
import { executeFileEdit } from './searchReplace'

describe('executeFileEdit', () => {
  it('supports add, move, and delete file operations', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))

    await expect(
      executeFileEdit({
        baseDir,
        type: 'add',
        path: 'src/hello.txt',
        new_path: '',
        content: 'hello'
      })
    ).resolves.toEqual([
      {
        status: 'A',
        path: 'src/hello.txt',
        new_hash: computeSnapshotTag('hello'),
        summary: `A src/hello.txt new_hash=${computeSnapshotTag('hello')}`
      }
    ])
    await expect(readFile(path.join(baseDir, 'src/hello.txt'), 'utf-8')).resolves.toBe('hello')

    await expect(
      executeFileEdit({
        baseDir,
        type: 'move',
        path: 'src/hello.txt',
        new_path: 'src/greeting.txt'
      })
    ).resolves.toEqual([
      {
        status: 'R',
        path: 'src/hello.txt',
        new_path: 'src/greeting.txt',
        old_hash: computeSnapshotTag('hello'),
        new_hash: computeSnapshotTag('hello'),
        summary: `R src/hello.txt -> src/greeting.txt old_hash=${computeSnapshotTag('hello')} new_hash=${computeSnapshotTag('hello')}`
      }
    ])
    await expect(readFile(path.join(baseDir, 'src/greeting.txt'), 'utf-8')).resolves.toBe('hello')

    await expect(
      executeFileEdit({
        baseDir,
        type: 'delete',
        path: 'src/greeting.txt'
      })
    ).resolves.toEqual([
      {
        status: 'D',
        path: 'src/greeting.txt',
        old_hash: computeSnapshotTag('hello'),
        summary: `D src/greeting.txt old_hash=${computeSnapshotTag('hello')}`
      }
    ])
    await expect(stat(path.join(baseDir, 'src/greeting.txt'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('returns old and new hashes for hashline updates', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/hello.txt')
    await executeFileEdit({
      baseDir,
      type: 'add',
      path: 'src/hello.txt',
      content: 'alpha\nbravo\ncharlie'
    })

    const oldHash = computeSnapshotTag('alpha\nbravo\ncharlie')
    const newContent = 'alpha\nBRAVO\ncharlie'
    await expect(
      executeFileEdit({
        baseDir,
        type: 'update',
        input: `¶src/hello.txt#${oldHash}\nreplace 2:\n+BRAVO`
      })
    ).resolves.toMatchObject([
      {
        status: 'M',
        path: 'src/hello.txt',
        old_hash: oldHash,
        new_hash: computeSnapshotTag(newContent),
        summary: `M src/hello.txt old_hash=${oldHash} new_hash=${computeSnapshotTag(newContent)}`
      }
    ])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(newContent)
  })

  it('supports exact string replacement mode', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/hello.txt')
    await executeFileEdit({
      baseDir,
      type: 'add',
      path: 'src/hello.txt',
      content: 'alpha\nbravo\ncharlie'
    })

    await expect(
      executeFileEdit({
        baseDir,
        type: 'replace',
        path: 'src/hello.txt',
        old_string: 'bravo',
        new_string: 'BRAVO'
      })
    ).resolves.toMatchObject([
      {
        status: 'M',
        path: 'src/hello.txt',
        replacements: 1
      }
    ])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('alpha\nBRAVO\ncharlie')
  })

  it('requires replace_all for repeated exact string replacements', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/repeat.txt')
    await executeFileEdit({
      baseDir,
      type: 'add',
      path: 'src/repeat.txt',
      content: 'same\nsame'
    })

    await expect(
      executeFileEdit({
        baseDir,
        type: 'replace',
        path: 'src/repeat.txt',
        old_string: 'same',
        new_string: 'changed'
      })
    ).rejects.toThrow('Found 2 matches')

    await executeFileEdit({
      baseDir,
      type: 'replace',
      path: 'src/repeat.txt',
      old_string: 'same',
      new_string: 'changed',
      replace_all: true
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('changed\nchanged')
  })

  it('supports readFile plain output as replace old_string without escaping', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/escape.txt')
    await mkdir(path.dirname(filePath), { recursive: true })
    const trickyBlock = [
      'const re = /\\d+\\.\\d+/g',
      'const msg = `hello ${name}`',
      '{"key": "value\\nwith tab\\t"}',
      'console.log("she said \\"hi\\"")',
      '+payload line',
      '¶src/file.ts#ABCD',
      '\tindented'
    ].join('\n')
    const content = ['before', trickyBlock, 'after'].join('\n')
    await writeFile(filePath, content, 'utf-8')

    const oldString = await executeHashlineRead({
      baseDir,
      path: 'src/escape.txt',
      start_line: 2,
      end_line: 8,
      format: 'plain'
    })

    await expect(
      executeFileEdit({
        baseDir,
        type: 'replace',
        path: 'src/escape.txt',
        old_string: oldString,
        new_string: 'REPLACED'
      })
    ).resolves.toMatchObject([{ status: 'M', path: 'src/escape.txt', replacements: 1 }])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('REPLACED')
  })

  it('supports LF-normalized readFile output as old_string for CRLF files', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/crlf.txt')
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(
      filePath,
      ['before', 'const path = "C:\\temp\\file.txt"', 'console.log("hi")', 'after'].join('\r\n'),
      'utf-8'
    )

    const oldString = await executeHashlineRead({
      baseDir,
      path: 'src/crlf.txt',
      start_line: 2,
      end_line: 3,
      format: 'plain'
    })

    expect(oldString).toBe('before\nconst path = "C:\\temp\\file.txt"\nconsole.log("hi")\nafter')
    await expect(
      executeFileEdit({
        baseDir,
        type: 'replace',
        path: 'src/crlf.txt',
        old_string: oldString,
        new_string: 'REPLACED'
      })
    ).resolves.toMatchObject([{ status: 'M', path: 'src/crlf.txt', replacements: 1 }])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('REPLACED')
  })

  it('does not rewrite unrelated mixed line endings during string replacement', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/mixed.txt')
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, 'crlf line\r\nold\nlast', 'utf-8')

    await expect(
      executeFileEdit({
        baseDir,
        type: 'replace',
        path: 'src/mixed.txt',
        old_string: 'old',
        new_string: 'new'
      })
    ).resolves.toMatchObject([{ status: 'M', path: 'src/mixed.txt', replacements: 1 }])
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('crlf line\r\nnew\nlast')
  })

  it('rejects block anchor matches when the body is too different', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'agent-qi-edit-file-'))
    const filePath = path.join(baseDir, 'src/fuzzy.ts')
    await mkdir(path.dirname(filePath), { recursive: true })
    const content = ['function run() {', '  deleteImportantData()', '}'].join('\n')
    await writeFile(filePath, content, 'utf-8')

    await expect(
      executeFileEdit({
        baseDir,
        type: 'replace',
        path: 'src/fuzzy.ts',
        old_string: ['function run() {', '  console.log("hello")', '}'].join('\n'),
        new_string: 'SAFE'
      })
    ).rejects.toThrow('Could not find oldString')
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(content)
  })
})
