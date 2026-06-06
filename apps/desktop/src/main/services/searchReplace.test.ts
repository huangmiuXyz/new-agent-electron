import { mkdtemp, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
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
    ).resolves.toEqual(['A src/hello.txt'])
    await expect(readFile(path.join(baseDir, 'src/hello.txt'), 'utf-8')).resolves.toBe('hello')

    await expect(
      executeFileEdit({
        baseDir,
        type: 'move',
        path: 'src/hello.txt',
        new_path: 'src/greeting.txt'
      })
    ).resolves.toEqual(['R src/hello.txt -> src/greeting.txt'])
    await expect(readFile(path.join(baseDir, 'src/greeting.txt'), 'utf-8')).resolves.toBe('hello')

    await expect(
      executeFileEdit({
        baseDir,
        type: 'delete',
        path: 'src/greeting.txt'
      })
    ).resolves.toEqual(['D src/greeting.txt'])
    await expect(stat(path.join(baseDir, 'src/greeting.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
