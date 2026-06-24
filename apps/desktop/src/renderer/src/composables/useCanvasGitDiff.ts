import { ref, computed, type ComputedRef } from 'vue'
import { gitService, type GitStatusEntry } from '@renderer/services/gitService'

type GitDiffMode = 'staged' | 'worktree'

type GitDiffPreview =
  | {
      kind: 'diff'
      path: string
      originalText: string
      modifiedText: string
      originalPath: string
      modifiedPath: string
      hint: string
      availableModes: GitDiffMode[]
      activeMode: GitDiffMode
    }
  | {
      kind: 'message'
      message: string
    }

export function useCanvasGitDiff(options: {
  currentWorkspaceDir: ComputedRef<string>
  gitEntries: ComputedRef<GitStatusEntry[]>
}) {
  const gitSelectedPath = ref('')
  const gitDiffPreview = ref<GitDiffPreview | null>(null)
  const gitDiffMode = ref<GitDiffMode>('worktree')
  const gitDiffLoading = ref(false)

  const gitSelectedEntry = computed(
    () => options.gitEntries.value.find((entry) => entry.path === gitSelectedPath.value) || null
  )
  const gitDiffView = computed(() =>
    gitDiffPreview.value?.kind === 'diff' ? gitDiffPreview.value : null
  )

  const getGitAbsolutePath = (cwd: string, path: string) => window.api.path.join(cwd, path)

  const buildGitDiffPreview = async (
    cwd: string,
    entry: GitStatusEntry,
    preferredMode = gitDiffMode.value
  ): Promise<GitDiffPreview> => {
    if (entry.untracked) {
      const absolutePath = getGitAbsolutePath(cwd, entry.path)
      const content = window.api.fs.existsSync(absolutePath)
        ? window.api.fs.readFileSync(absolutePath, 'utf-8')
        : ''
      return {
        kind: 'diff',
        path: entry.path,
        originalText: '',
        modifiedText: content,
        originalPath: `/dev/null/${entry.path}`,
        modifiedPath: entry.path,
        hint: '未跟踪文件，对比的是空白内容与当前工作区文件。',
        availableModes: ['worktree'],
        activeMode: 'worktree'
      }
    }

    const availableModes: GitDiffMode[] = []
    if (entry.staged) availableModes.push('staged')
    if (entry.workingTreeStatus !== ' ' && entry.workingTreeStatus !== '?')
      availableModes.push('worktree')
    const activeMode = availableModes.includes(preferredMode)
      ? preferredMode
      : availableModes[0] || 'worktree'

    const worktreeAbsolutePath = getGitAbsolutePath(cwd, entry.path)

    if (activeMode === 'staged') {
      const headPath = entry.originalPath || entry.path
      const originalText =
        (await gitService.getFileContent(cwd, {
          ref: 'HEAD',
          filePath: headPath,
          allowMissing: true
        })) || ''
      const modifiedText =
        (await gitService.getFileContent(cwd, {
          ref: 'INDEX',
          filePath: entry.path,
          allowMissing: true
        })) || ''
      return {
        kind: 'diff',
        path: entry.path,
        originalText,
        modifiedText,
        originalPath: headPath,
        modifiedPath: entry.path,
        hint: '暂存区对比：左侧是 HEAD，右侧是 INDEX。',
        availableModes,
        activeMode
      }
    }

    const indexPath =
      entry.workingTreeStatus === 'R' && entry.originalPath ? entry.originalPath : entry.path
    const originalText =
      (await gitService.getFileContent(cwd, {
        ref: 'INDEX',
        filePath: indexPath,
        allowMissing: true
      })) || ''
    const modifiedText = window.api.fs.existsSync(worktreeAbsolutePath)
      ? window.api.fs.readFileSync(worktreeAbsolutePath, 'utf-8')
      : ''

    return {
      kind: 'diff',
      path: entry.path,
      originalText,
      modifiedText,
      originalPath: indexPath,
      modifiedPath: entry.path,
      hint: '工作区对比：左侧是 INDEX，右侧是 WORKTREE。',
      availableModes,
      activeMode
    }
  }

  const refreshGitDiff = async (
    path = gitSelectedPath.value,
    preferredMode = gitDiffMode.value
  ) => {
    gitSelectedPath.value = path
    gitDiffPreview.value = null
    const entry = options.gitEntries.value.find((item) => item.path === path)
    if (!entry) return

    gitDiffLoading.value = true
    try {
      gitDiffPreview.value = await buildGitDiffPreview(
        options.currentWorkspaceDir.value,
        entry,
        preferredMode
      )
      if (gitDiffPreview.value.kind === 'diff') {
        gitDiffMode.value = gitDiffPreview.value.activeMode
      }
    } catch (error) {
      gitDiffPreview.value = {
        kind: 'message',
        message: `加载 diff 失败：${(error as Error).message}`
      }
    } finally {
      gitDiffLoading.value = false
    }
  }

  return {
    gitSelectedPath,
    gitDiffPreview,
    gitDiffMode,
    gitDiffLoading,
    gitSelectedEntry,
    gitDiffView,
    refreshGitDiff,
  }
}
