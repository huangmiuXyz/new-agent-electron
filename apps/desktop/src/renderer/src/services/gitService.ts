import { chatService } from './chatService'
import { useSettingsStore } from '@renderer/stores/settings'

type GitExecResult = {
  code: number | null
  stdout: string
  stderr: string
  errorMessage?: string
  errorCode?: string
}

export type GitBranchInfo = {
  name: string
  current: boolean
  upstream?: string
}

export type GitStatusEntry = {
  path: string
  originalPath?: string
  indexStatus: string
  workingTreeStatus: string
  staged: boolean
  modified: boolean
  deleted: boolean
  untracked: boolean
  renamed: boolean
  copied: boolean
  conflicted: boolean
}

export type GitRepositoryStatus = {
  root: string
  branch: string
  upstream?: string
  detached: boolean
  ahead: number
  behind: number
  isClean: boolean
  entries: GitStatusEntry[]
}

export type GitDiffOptions = {
  cached?: boolean
  filePath?: string
}

export type GitLogEntry = {
  commit: string
  authorName: string
  authorEmail: string
  authoredAt: string
  subject: string
}

export type GitCommitModelOption = {
  providerId: string
  providerName: string
  providerType: string
  modelId: string
  modelName: string
  isFavorite: boolean
}

export type GitCommitMessageGenerateOptions = {
  providerId: string
  modelId: string
  staged?: boolean
  maxDiffLength?: number
  locale?: 'zh-CN' | 'en'
}

const GIT_STATUS_UNTRACKED = '?'
const GIT_STATUS_UNMERGED = 'U'

const runGit = async (
  args: string[],
  options: { cwd: string; maxBuffer?: number } = { cwd: '' }
): Promise<GitExecResult> => {
  return window.api.execFileCommand('git', args, {
    cwd: options.cwd,
    maxBuffer: options.maxBuffer || 8 * 1024 * 1024
  })
}

const getGitErrorMessage = (result: GitExecResult) => {
  return result.stderr.trim() || result.stdout.trim() || result.errorMessage?.trim() || 'git command failed'
}

const assertGitOk = (result: GitExecResult) => {
  if (result.code === 0) return
  throw new Error(getGitErrorMessage(result))
}

const parseBranchHeader = (line: string) => {
  const raw = line.replace(/^##\s*/, '').trim()
  const branchSegment = raw.split('...')[0]?.trim() || 'HEAD'
  const upstreamSegment = raw.includes('...') ? raw.split('...')[1]?.split('[')[0]?.trim() : ''
  const aheadMatch = raw.match(/ahead (\d+)/)
  const behindMatch = raw.match(/behind (\d+)/)

  return {
    branch: branchSegment === 'HEAD (no branch)' ? 'HEAD' : branchSegment,
    upstream: upstreamSegment || undefined,
    detached: branchSegment === 'HEAD (no branch)' || branchSegment === 'HEAD',
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0
  }
}

const parseStatusEntry = (line: string): GitStatusEntry | null => {
  if (!line || line.startsWith('##')) return null
  if (line.length < 3) return null

  const indexStatus = line[0] || ' '
  const workingTreeStatus = line[1] || ' '
  const payload = line.slice(3).trim()

  if (!payload) return null

  const renameParts = payload.split(' -> ')
  const originalPath = renameParts.length > 1 ? renameParts[0] : undefined
  const path = renameParts.length > 1 ? renameParts[renameParts.length - 1] : payload
  const staged = indexStatus !== ' ' && indexStatus !== GIT_STATUS_UNTRACKED
  const modified = indexStatus === 'M' || workingTreeStatus === 'M'
  const deleted = indexStatus === 'D' || workingTreeStatus === 'D'
  const untracked = indexStatus === GIT_STATUS_UNTRACKED && workingTreeStatus === GIT_STATUS_UNTRACKED
  const renamed = indexStatus === 'R' || workingTreeStatus === 'R'
  const copied = indexStatus === 'C' || workingTreeStatus === 'C'
  const conflicted = indexStatus === GIT_STATUS_UNMERGED || workingTreeStatus === GIT_STATUS_UNMERGED

  return {
    path,
    originalPath,
    indexStatus,
    workingTreeStatus,
    staged,
    modified,
    deleted,
    untracked,
    renamed,
    copied,
    conflicted
  }
}

const normalizePaths = (paths: string[]) => {
  return paths
    .map((path) => String(path || '').trim())
    .filter(Boolean)
}

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength))}\n\n...[diff truncated]`
}

export const gitService = {
  listCommitMessageModels(): GitCommitModelOption[] {
    const settingsStore = useSettingsStore()

    return settingsStore.getAllProviders
      .flatMap((provider) => {
        return (provider.models || [])
          .filter((model) => model.category === 'text')
          .map((model) => ({
            providerId: provider.id,
            providerName: provider.name,
            providerType: provider.providerType,
            modelId: model.id,
            modelName: model.name,
            isFavorite: settingsStore.isFavoriteModel(provider.id, model.id)
          } satisfies GitCommitModelOption))
      })
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
        if (a.providerName !== b.providerName) return a.providerName.localeCompare(b.providerName)
        return a.modelName.localeCompare(b.modelName)
      })
  },

  async isGitRepository(cwd: string) {
    const result = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd })
    return result.code === 0 && result.stdout.trim() === 'true'
  },

  async getRepositoryRoot(cwd: string) {
    const result = await runGit(['rev-parse', '--show-toplevel'], { cwd })
    assertGitOk(result)
    return result.stdout.trim()
  },

  async getStatus(cwd: string): Promise<GitRepositoryStatus> {
    const [rootResult, statusResult] = await Promise.all([
      runGit(['rev-parse', '--show-toplevel'], { cwd }),
      runGit(['status', '--porcelain=v1', '--branch'], { cwd })
    ])
    assertGitOk(rootResult)
    assertGitOk(statusResult)

    const lines = statusResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
    const header = lines[0]?.startsWith('##') ? parseBranchHeader(lines[0]) : {
      branch: 'HEAD',
      upstream: undefined,
      detached: true,
      ahead: 0,
      behind: 0
    }
    const entries = lines
      .slice(lines[0]?.startsWith('##') ? 1 : 0)
      .map(parseStatusEntry)
      .filter((entry): entry is GitStatusEntry => Boolean(entry))

    return {
      root: rootResult.stdout.trim(),
      branch: header.branch,
      upstream: header.upstream,
      detached: header.detached,
      ahead: header.ahead,
      behind: header.behind,
      isClean: entries.length === 0,
      entries
    }
  },

  async getDiff(cwd: string, options: GitDiffOptions = {}) {
    const args = ['diff']
    if (options.cached) {
      args.push('--cached')
    }
    if (options.filePath) {
      args.push('--', options.filePath)
    }

    const result = await runGit(args, { cwd })
    assertGitOk(result)
    return result.stdout
  },

  async listBranches(cwd: string): Promise<GitBranchInfo[]> {
    const format = '%(refname:short)|%(upstream:short)|%(HEAD)'
    const result = await runGit(['branch', '--list', '--format', format], { cwd })
    assertGitOk(result)

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, upstream, headMarker] = line.split('|')
        return {
          name,
          upstream: upstream || undefined,
          current: headMarker === '*'
        } satisfies GitBranchInfo
      })
  },

  async getRecentLog(cwd: string, limit = 20): Promise<GitLogEntry[]> {
    const format = '%H%x1f%an%x1f%ae%x1f%aI%x1f%s'
    const result = await runGit(['log', `--max-count=${Math.max(1, limit)}`, `--format=${format}`], { cwd })
    assertGitOk(result)

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [commit, authorName, authorEmail, authoredAt, subject] = line.split('\u001f')
        return {
          commit,
          authorName,
          authorEmail,
          authoredAt,
          subject
        } satisfies GitLogEntry
      })
  },

  async generateCommitMessage(
    cwd: string,
    {
      providerId,
      modelId,
      staged,
      maxDiffLength = 12000,
      locale = 'zh-CN'
    }: GitCommitMessageGenerateOptions
  ) {
    const settingsStore = useSettingsStore()
    const provider = settingsStore.getProviderById(providerId)
    const model = provider?.models?.find((item) => item.id === modelId)

    if (!provider || !model) {
      throw new Error('未找到可用模型，请重新选择模型')
    }

    const status = await this.getStatus(cwd)
    const hasStagedChanges = status.entries.some((entry) => entry.staged)
    const useStagedDiff = staged ?? hasStagedChanges
    const diff = await this.getDiff(cwd, { cached: useStagedDiff })
    const trimmedDiff = diff.trim()

    if (!trimmedDiff) {
      throw new Error(useStagedDiff ? '当前没有已暂存的变更可生成提交信息' : '当前没有变更可生成提交信息')
    }

    const prompt = locale === 'en'
      ? [
        'Write a concise git commit message based on the diff below.',
        'Requirements:',
        '1. Return only the commit message.',
        '2. Prefer Conventional Commit style when appropriate.',
        '3. Use one single-line subject, no code fences, no bullets.',
        '4. Keep it under 72 characters if possible.',
        `5. The diff scope is ${useStagedDiff ? 'staged changes' : 'working tree changes'}.`,
        '',
        'Git status summary:',
        JSON.stringify({
          branch: status.branch,
          ahead: status.ahead,
          behind: status.behind,
          entries: status.entries.map((entry) => ({
            path: entry.path,
            indexStatus: entry.indexStatus,
            workingTreeStatus: entry.workingTreeStatus
          }))
        }, null, 2),
        '',
        'Diff:',
        truncateText(trimmedDiff, maxDiffLength)
      ].join('\n')
      : [
        '请根据下面的 git diff 生成一条简洁准确的提交信息。',
        '要求：',
        '1. 只返回提交信息本身，不要解释，不要代码块，不要项目符号。',
        '2. 尽量使用 Conventional Commit 风格，例如 feat:、fix:、refactor:。',
        '3. 只写一行主题，尽量控制在 72 个字符以内。',
        `4. 当前 diff 范围是${useStagedDiff ? '已暂存变更' : '工作区变更'}。`,
        '5. 优先概括用户可感知或代码层面的主要变化，不要罗列细枝末节。',
        '',
        'Git 状态摘要：',
        JSON.stringify({
          branch: status.branch,
          ahead: status.ahead,
          behind: status.behind,
          entries: status.entries.map((entry) => ({
            path: entry.path,
            indexStatus: entry.indexStatus,
            workingTreeStatus: entry.workingTreeStatus
          }))
        }, null, 2),
        '',
        'Diff：',
        truncateText(trimmedDiff, maxDiffLength)
      ].join('\n')

    const service = chatService()
    const result = await service.generateText(prompt, {
      model: model.id,
      apiKey: provider.apiKey || '',
      baseURL: provider.baseUrl || '',
      provider: provider.id,
      providerType: provider.providerType
    })

    return result.text.trim().replace(/^["'`]+|["'`]+$/g, '')
  },

  async stageFiles(cwd: string, paths: string[]) {
    const normalizedPaths = normalizePaths(paths)
    if (normalizedPaths.length === 0) return
    const result = await runGit(['add', '--', ...normalizedPaths], { cwd })
    assertGitOk(result)
  },

  async unstageFiles(cwd: string, paths: string[]) {
    const normalizedPaths = normalizePaths(paths)
    if (normalizedPaths.length === 0) return
    const result = await runGit(['reset', 'HEAD', '--', ...normalizedPaths], { cwd })
    assertGitOk(result)
  },

  async checkoutFile(cwd: string, filePath: string) {
    const normalizedPath = String(filePath || '').trim()
    if (!normalizedPath) {
      throw new Error('filePath 不能为空')
    }

    const result = await runGit(['checkout', '--', normalizedPath], { cwd })
    assertGitOk(result)
  },

  async commit(cwd: string, message: string) {
    const trimmedMessage = String(message || '').trim()
    if (!trimmedMessage) {
      throw new Error('commit message 不能为空')
    }

    const result = await runGit(['commit', '-m', trimmedMessage], { cwd })
    assertGitOk(result)
    return result.stdout.trim()
  }
}
