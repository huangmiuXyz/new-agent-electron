import { ref, computed, type ComputedRef } from 'vue'
import { gitService, type GitRepositoryStatus } from '@renderer/services/gitService'

export function useCanvasGit(options: {
  currentChatId: ComputedRef<string | undefined>
  currentWorkspaceDir: ComputedRef<string>
}) {
  const message = messageApi
  const modal = useModal()
  const {
    Download: DownloadIcon,
    Refresh: RefreshIcon,
    Branch: BranchIcon,
    Check: CheckIcon
  } = useIcon(['Download', 'Refresh', 'Branch', 'Check'])
  const { showContextMenu } = useContextMenu<any>()
  const settingsStore = useSettingsStore()

  const gitStatus = ref<GitRepositoryStatus | null>(null)
  const gitCommitMessage = ref('')
  const gitLoading = ref(false)
  const gitGeneratingCommitMessage = ref(false)
  const gitCommitting = ref(false)
  const gitError = ref('')
  const gitCommitProviderId = ref('')
  const gitCommitModelId = ref('')
  const gitGenerateAfterModelPick = ref(false)
  const gitActionLoading = ref(false)

  const gitEntries = computed(() => gitStatus.value?.entries || [])
  const hasGitRepo = computed(() => Boolean(gitStatus.value))
  const hasGitChanges = computed(() => gitEntries.value.length > 0)
  const hasStagedGitChanges = computed(() => gitEntries.value.some((entry) => entry.staged))
  const gitAheadCount = computed(() => Math.max(0, gitStatus.value?.ahead || 0))
  const isGitPrimaryPushAction = computed(() => !hasGitChanges.value && gitAheadCount.value > 0)
  const gitPrimaryButtonLabel = computed(() => {
    if (isGitPrimaryPushAction.value) {
      return `推送（${gitAheadCount.value}）`
    }
    return '提交'
  })
  const gitPrimaryButtonLoadingLabel = computed(() =>
    isGitPrimaryPushAction.value ? '推送中...' : '提交中...'
  )
  const isGitPrimaryButtonDisabled = computed(() => {
    if (isGitPrimaryPushAction.value) {
      return gitActionLoading.value
    }
    return gitCommitting.value || !gitCommitMessage.value.trim()
  })

  const diff = useCanvasGitDiff({
    currentWorkspaceDir: options.currentWorkspaceDir,
    gitEntries,
  })

  const ensureGitModelSelection = () => {
    if (gitCommitProviderId.value && gitCommitModelId.value) return
    const providerId = settingsStore.selectedProviderId
    const modelId = settingsStore.selectedModelId
    const provider = providerId ? settingsStore.getProviderById(providerId) : null
    const hasTextModel = Boolean(
      provider?.models?.some((item) => item.id === modelId && item.category === 'text')
    )

    if (providerId && modelId && hasTextModel) {
      gitCommitProviderId.value = providerId
      gitCommitModelId.value = modelId
      return
    }

    const fallback = gitService.listCommitMessageModels()[0]
    gitCommitProviderId.value = fallback?.providerId || ''
    gitCommitModelId.value = fallback?.modelId || ''
  }

  const [GitCloneForm, gitCloneFormActions] = useForm({
    showHeader: false,
    fields: [
      {
        name: 'repoUrl',
        type: 'text',
        label: '仓库地址',
        placeholder: 'https://github.com/user/repo.git',
        required: true
      },
      {
        name: 'targetDir',
        type: 'path',
        label: '目标目录',
        required: true,
        dialogOptions: {
          properties: ['openDirectory']
        }
      },
      {
        name: 'directoryName',
        type: 'text',
        label: '文件夹名称',
        placeholder: '可选，默认使用仓库名'
      }
    ]
  })

  const refreshGitStatus = async () => {
    gitLoading.value = true
    gitError.value = ''

    try {
      ensureGitModelSelection()
      const cwd = options.currentWorkspaceDir.value
      if (!(await gitService.isGitRepository(cwd))) {
        gitStatus.value = null
        diff.gitSelectedPath.value = ''
        diff.gitDiffPreview.value = null
        return
      }

      const status = await gitService.getStatus(cwd)
      gitStatus.value = status
      const nextPath =
        status.entries.find((entry) => entry.path === diff.gitSelectedPath.value)?.path ||
        status.entries[0]?.path ||
        ''
      await diff.refreshGitDiff(nextPath)
    } catch (error) {
      gitStatus.value = null
      diff.gitSelectedPath.value = ''
      diff.gitDiffPreview.value = null
      gitError.value = (error as Error).message
    } finally {
      gitLoading.value = false
    }
  }

  const generateGitCommitMessage = async () => {
    ensureGitModelSelection()
    if (!gitCommitProviderId.value || !gitCommitModelId.value) {
      message.warning('请先选择模型')
      return
    }

    gitGeneratingCommitMessage.value = true
    try {
      gitCommitMessage.value = await gitService.generateCommitMessage(options.currentWorkspaceDir.value, {
        providerId: gitCommitProviderId.value,
        modelId: gitCommitModelId.value,
        staged: hasStagedGitChanges.value
      })
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      gitGeneratingCommitMessage.value = false
    }
  }

  const handleGitCommitModelSelect = ({
    modelId,
    providerId
  }: {
    modelId: string
    providerId: string
  }) => {
    gitCommitProviderId.value = providerId
    gitCommitModelId.value = modelId
    if (!gitGenerateAfterModelPick.value) return
    gitGenerateAfterModelPick.value = false
    void generateGitCommitMessage()
  }

  const commitGitChanges = async () => {
    const commitMessage = gitCommitMessage.value.trim()
    if (!commitMessage) {
      message.warning('请先输入提交信息')
      return
    }
    if (!gitEntries.value.length) {
      message.warning('当前没有可提交的变更')
      return
    }

    gitCommitting.value = true
    try {
      if (!hasStagedGitChanges.value) {
        await gitService.stageAll(options.currentWorkspaceDir.value)
      }
      await gitService.commit(options.currentWorkspaceDir.value, commitMessage)
      gitCommitMessage.value = ''
      await refreshGitStatus()
      message.success('提交成功')
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      gitCommitting.value = false
    }
  }

  const runGitHeaderAction = async (action: () => Promise<void>, successMessage: string) => {
    if (gitActionLoading.value) return
    gitActionLoading.value = true
    try {
      await action()
      await refreshGitStatus()
      message.success(successMessage)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      gitActionLoading.value = false
    }
  }

  const pullGitChanges = async () => {
    await runGitHeaderAction(async () => {
      await gitService.pull(options.currentWorkspaceDir.value)
    }, '拉取完成')
  }

  const pushGitChanges = async () => {
    await runGitHeaderAction(async () => {
      await gitService.push(options.currentWorkspaceDir.value)
    }, '推送完成')
  }

  const runGitPrimaryAction = async () => {
    if (isGitPrimaryPushAction.value) {
      await pushGitChanges()
      return
    }
    await commitGitChanges()
  }

  const fetchGitChanges = async () => {
    await runGitHeaderAction(async () => {
      await gitService.fetch(options.currentWorkspaceDir.value)
    }, '抓取完成')
  }

  const checkoutGitBranch = async (branchName: string) => {
    await runGitHeaderAction(async () => {
      await gitService.checkoutBranch(options.currentWorkspaceDir.value, branchName)
    }, `已切换到 ${branchName}`)
  }

  const cloneGitRepository = async () => {
    const workspaceDir = options.currentWorkspaceDir.value
    gitCloneFormActions.setFieldValue('repoUrl', '')
    gitCloneFormActions.setFieldValue('targetDir', window.api.path.dirname(workspaceDir))
    gitCloneFormActions.setFieldValue('directoryName', '')

    const confirmed = await modal.confirm({
      title: '克隆仓库',
      content: GitCloneForm,
      confirmText: '开始克隆',
      cancelText: '取消'
    })

    if (!confirmed) return

    const repoUrl = String(gitCloneFormActions.getFieldValue('repoUrl') || '').trim()
    const targetDir = String(gitCloneFormActions.getFieldValue('targetDir') || '').trim()
    const directoryName = String(gitCloneFormActions.getFieldValue('directoryName') || '').trim()

    if (!repoUrl) {
      message.warning('请输入仓库地址')
      return
    }
    if (!targetDir) {
      message.warning('请选择目标目录')
      return
    }

    gitActionLoading.value = true
    try {
      const clonedPath = await gitService.cloneRepository(
        options.currentWorkspaceDir.value,
        repoUrl,
        targetDir,
        directoryName
      )
      message.success(`克隆完成：${clonedPath}`)
      await window.api.shell.openPath(clonedPath)
    } catch (error) {
      message.error((error as Error).message)
    } finally {
      gitActionLoading.value = false
    }
  }

  const openGitActionsMenu = async (event: MouseEvent) => {
    let branchChildren: any[] = []

    if (hasGitRepo.value) {
      try {
        const branches = await gitService.listBranches(options.currentWorkspaceDir.value)
        branchChildren = branches.map((branch: any) => ({
          label: branch.name,
          icon: branch.current ? CheckIcon : BranchIcon,
          disabled: branch.current || gitActionLoading.value,
          shortcut: branch.current ? '当前' : branch.upstream || '',
          onClick: () => {
            void checkoutGitBranch(branch.name)
          }
        }))
      } catch (error) {
        message.error((error as Error).message)
        return
      }
    }

    const optionsList: any[] = [
      {
        label: '拉取',
        icon: RefreshIcon,
        disabled: !hasGitRepo.value || gitActionLoading.value,
        onClick: () => {
          void pullGitChanges()
        }
      },
      {
        label: '推送',
        icon: RefreshIcon,
        disabled: !hasGitRepo.value || gitActionLoading.value,
        onClick: () => {
          void pushGitChanges()
        }
      },
      {
        label: '克隆仓库',
        icon: DownloadIcon,
        disabled: gitActionLoading.value,
        onClick: () => {
          void cloneGitRepository()
        }
      },
      {
        label: '切换到...',
        icon: BranchIcon,
        disabled: !hasGitRepo.value || branchChildren.length === 0 || gitActionLoading.value,
        children: branchChildren
      },
      {
        label: '抓取',
        icon: RefreshIcon,
        disabled: !hasGitRepo.value || gitActionLoading.value,
        onClick: () => {
          void fetchGitChanges()
        }
      }
    ]

    showContextMenu(event, optionsList)
  }

  return {
    gitStatus,
    gitCommitMessage,
    gitLoading,
    gitGeneratingCommitMessage,
    gitCommitting,
    gitError,
    gitCommitProviderId,
    gitCommitModelId,
    gitGenerateAfterModelPick,
    gitActionLoading,
    gitEntries,
    hasGitRepo,
    hasGitChanges,
    hasStagedGitChanges,
    gitAheadCount,
    isGitPrimaryPushAction,
    gitPrimaryButtonLabel,
    gitPrimaryButtonLoadingLabel,
    isGitPrimaryButtonDisabled,
    GitCloneForm,
    refreshGitStatus,
    commitGitChanges,
    pullGitChanges,
    pushGitChanges,
    fetchGitChanges,
    checkoutGitBranch,
    cloneGitRepository,
    generateGitCommitMessage,
    handleGitCommitModelSelect,
    runGitPrimaryAction,
    openGitActionsMenu,
    gitSelectedPath: diff.gitSelectedPath,
    gitDiffPreview: diff.gitDiffPreview,
    gitDiffMode: diff.gitDiffMode,
    gitDiffLoading: diff.gitDiffLoading,
    gitSelectedEntry: diff.gitSelectedEntry,
    gitDiffView: diff.gitDiffView,
    refreshGitDiff: diff.refreshGitDiff,
  }
}
