import { mkdtemp, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { computeSnapshotTag } from './hashline'
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
    ).resolves.toEqual([
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
})
