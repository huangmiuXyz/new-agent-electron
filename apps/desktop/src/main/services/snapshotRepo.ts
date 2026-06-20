import { ipcMain, app } from 'electron'
import { promises as fs, mkdirSync, writeFileSync, statSync } from 'fs'
import { spawn, execSync } from 'child_process'
import nodePath from 'path'
import crypto from 'crypto'

export type SnapshotPatch = {
  hash: string
  files: string[]
}

type RepoState = {
  gitdir: string
}

const repos = new Map<string, RepoState>()

const hashBaseDir = (baseDir: string) =>
  crypto.createHash('sha256').update(baseDir).digest('hex').slice(0, 16)

const getRepoDir = (baseDir: string) => {
  const hash = hashBaseDir(baseDir)
  return nodePath.join(app.getPath('userData'), 'agent-qi-snapshots', hash)
}

const findSourceGitDir = (baseDir: string): string | undefined => {
  let dir = baseDir
  while (true) {
    const gitDir = nodePath.join(dir, '.git')
    try {
      const s = statSync(gitDir)
      if (s.isDirectory()) return gitDir
    } catch {}
    const parent = nodePath.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

const gitExec = async (args: string[], cwd?: string): Promise<string> => {
  return new Promise((resolve, reject) => {

    const child = spawn('git', args, { cwd, windowsHide: true, stdio: 'pipe' })
    const timer = setTimeout(() => { child.kill(); reject(new Error('git timed out')) }, 30000)
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out.trim())
      else reject(new Error(err.trim() || `exit code ${code}`))
    })
    child.on('error', (e) => { clearTimeout(timer); console.log('[snapshot] spawn error:', e.message); reject(e) })
  })
}

const getRepo = (baseDir: string): RepoState => {
  const resolved = nodePath.resolve(baseDir)
  const existing = repos.get(resolved)
  if (existing) return existing

  const gitdir = getRepoDir(resolved)
  const sourceGitDir = findSourceGitDir(resolved)
  const state: RepoState = { gitdir }

  try {
    statSync(gitdir)
    console.log('[snapshot] repo already exists:', gitdir)
  } catch {
    console.log('[snapshot] creating new repo at:', gitdir)
    mkdirSync(gitdir, { recursive: true })
    const qp = (p: string) => `"${p.replace(/"/g, '\\"')}"`
    const g = (cmd: string) => {
      console.log('[snapshot] execSync:', cmd.slice(0, 120))
      return execSync(cmd, { encoding: 'utf-8', windowsHide: true })
    }
    const da = `--git-dir=${qp(gitdir)}`
    try {
      g(`git ${da} --work-tree=${qp(resolved)} init`)
      g(`git ${da} config core.autocrlf false`)
      g(`git ${da} config core.longpaths true`)
      g(`git -c user.name=snapshot -c user.email=snapshot@local ${da} commit --allow-empty -m root`)
      console.log('[snapshot] repo init ok')
    } catch (e) {
      console.log('[snapshot] repo init failed:', e)
      throw e
    }

    if (sourceGitDir) {
      const objectsDir = nodePath.join(gitdir, 'objects', 'info')
      mkdirSync(objectsDir, { recursive: true })
      writeFileSync(
        nodePath.join(objectsDir, 'alternates'),
        nodePath.join(sourceGitDir, 'objects') + '\n'
      )
      console.log('[snapshot] alternates written:', nodePath.join(sourceGitDir, 'objects'))
    }
  }

  repos.set(resolved, state)
  return state
}


const gitInRepo = async (repo: RepoState, baseDir: string, args: string[]) =>
  gitExec(['--git-dir', repo.gitdir, '--work-tree', baseDir, ...args], baseDir)

export const isGitAvailable = async (): Promise<boolean> => {
  try {
    await gitExec(['--version'])
    return true
  } catch {
    return false
  }
}

export const initSnapshotRepo = async (baseDir: string): Promise<boolean> => {
  if (!(await isGitAvailable())) return false
  const sourceGitDir = findSourceGitDir(baseDir)
  if (!sourceGitDir) return false
  try {
    getRepo(baseDir)
    return true
  } catch {
    return false
  }
}

export const trackSnapshot = async (baseDir: string): Promise<SnapshotPatch | null> => {
  const resolved = nodePath.resolve(baseDir)
  console.log('[snapshot] trackSnapshot baseDir:', resolved)

  const sourceGitDir = findSourceGitDir(resolved)
  console.log('[snapshot] sourceGitDir:', sourceGitDir)
  if (!sourceGitDir) {
    console.log('[snapshot] no source git dir found')
    return null
  }

  let repo: RepoState
  try {
    repo = getRepo(resolved)
    console.log('[snapshot] repo gitdir:', repo.gitdir)
  } catch (e) {
    console.log('[snapshot] getRepo failed:', e)
    return null
  }

  try {
    console.log('[snapshot] git add...')
    await gitInRepo(repo, resolved, ['add', '--all', '--sparse', '--', resolved])
    console.log('[snapshot] git add ok')
  } catch (e) {
    console.log('[snapshot] git add failed:', e)
    return null
  }

  let hash: string
  try {
    hash = await gitInRepo(repo, resolved, ['write-tree'])
    console.log('[snapshot] write-tree hash:', hash)
  } catch (e) {
    console.log('[snapshot] write-tree failed:', e)
    return null
  }
  if (!hash) {
    console.log('[snapshot] write-tree returned empty')
    return null
  }

  let filesText: string
  try {
    filesText = (await gitInRepo(repo, resolved, ['diff', '--cached', '--name-only', 'HEAD', '--', resolved])).replace(/^HEAD/g, '').trim()
    console.log('[snapshot] diff files:', filesText)
  } catch (e) {
    console.log('[snapshot] diff failed:', e)
    return null
  }

  const files = filesText ? filesText.split('\n').map((f) => f.trim()).filter(Boolean) : []
  const absFiles = files.map((f) => nodePath.join(resolved, f).replace(/\\/g, '/'))
  console.log('[snapshot] success, returning hash:', hash, 'files:', absFiles.length)
  return { hash, files: absFiles }
}

export const revertSnapshot = async (baseDir: string, patches: SnapshotPatch[]): Promise<void> => {
  const resolved = nodePath.resolve(baseDir)
  const repo = getRepo(resolved)
  const seen = new Set<string>()

  for (const patch of patches) {
    for (const file of patch.files) {
      if (seen.has(file)) continue
      seen.add(file)
      const relFile = nodePath.relative(resolved, file).replace(/\\/g, '/')
      const absFile = nodePath.resolve(resolved, relFile)

      try {
        await gitInRepo(repo, resolved, ['checkout', patch.hash, '--', relFile])
      } catch {
        try {
          const treeCheck = await gitInRepo(repo, resolved, ['ls-tree', patch.hash, '--', relFile])
          if (!treeCheck.trim()) {
            try { await fs.unlink(absFile) } catch {}
          }
        } catch {}
      }
    }
  }
}

export const diffSnapshot = async (baseDir: string, hash: string): Promise<string> => {
  const resolved = nodePath.resolve(baseDir)
  const repo = getRepo(resolved)
  return await gitInRepo(repo, resolved, ['diff', '--no-ext-diff', '--cached', hash, '--', resolved])
}

export const cleanupSnapshotRepo = async (baseDir: string): Promise<void> => {
  const resolved = nodePath.resolve(baseDir)
  const repo = repos.get(resolved)
  if (!repo) return
  try {
    await gitInRepo(repo, resolved, ['gc', `--prune=7.days`])
  } catch {}
  repos.delete(resolved)
}

export const setupSnapshotRepoHandlers = () => {
  ipcMain.handle('snapshot:revert', async (_event, raw: string) => {
    try {
      const payload = JSON.parse(raw) as { baseDir: string; patches: SnapshotPatch[] }
      console.log('[snapshot] revert called, patches:', payload.patches.length)
      await revertSnapshot(payload.baseDir, payload.patches)
      console.log('[snapshot] revert ok')
      return { ok: true }
    } catch (error) {
      console.log('[snapshot] revert error:', (error as Error).message)
      return { ok: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('snapshot:diff', async (_event, raw: string) => {
    try {
      const payload = JSON.parse(raw) as { baseDir: string; hash: string }
      const d = await diffSnapshot(payload.baseDir, payload.hash)
      return { ok: true, diff: d }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })
}
