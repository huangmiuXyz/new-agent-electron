import { computed, type ComputedRef } from 'vue'
import { useAgentStore } from '@renderer/stores/agent'
import { useCanvasStore } from '@renderer/stores/canvas'
import { useChatsStores } from '@renderer/stores/chats'
import { useSettingsStore } from '@renderer/stores/settings'
import { useContextMenu, type MenuItem } from '@renderer/composables/useContextMenu'
import { storeToRefs } from 'pinia'

export const useAgentWorkPath = (options: {
  currentChatAgent: ComputedRef<Agent | null | undefined>
}) => {
  const chatStore = useChatsStores()
  const agentStore = useAgentStore()
  const canvasStore = useCanvasStore()
  const settingsStore = useSettingsStore()
  const { display } = storeToRefs(settingsStore)
  const { showContextMenu } = useContextMenu()
  const { Delete, HistoryClock } = useIcon(['Delete', 'HistoryClock'])

  const currentAgentWorkPath = computed(() => options.currentChatAgent.value?.workPath?.trim() || '')
  const canChooseLocalWorkPath = computed(() => {
    const api = window.api as Partial<typeof window.api> | undefined
    return (
      !isMobile.value &&
      typeof api?.showOpenDialog === 'function' &&
      Boolean(api.path && api.fs)
    )
  })

  const workPathButtonTitle = computed(() => {
    const agentName = options.currentChatAgent.value?.name || '当前智能体'
    return currentAgentWorkPath.value
      ? `${agentName} 工作路径：${currentAgentWorkPath.value}`
      : `设置 ${agentName} 的工作路径`
  })

  const workPathButtonLabel = computed(() => {
    if (!currentAgentWorkPath.value) return '工作路径'
    const api = window.api as Partial<typeof window.api> | undefined
    return (
      api?.path?.basename(currentAgentWorkPath.value) ||
      currentAgentWorkPath.value.split(/[\\/]/).filter(Boolean).pop() ||
      currentAgentWorkPath.value
    )
  })

  const recentWorkPaths = computed(() => display.value.workPathHistory || [])

  const addToWorkPathHistory = (path: string) => {
    const history = [...display.value.workPathHistory]
    const filtered = history.filter((p) => p !== path)
    filtered.unshift(path)
    display.value.workPathHistory = filtered.slice(0, 10)
  }

  const applyWorkPath = (workPath: string) => {
    let chatId = chatStore.currentChat?.id
    if (!chatId) chatId = chatStore.createChat()

    const chat = chatStore.getChatById(chatId)
    const agentId = chat?.agentId || 'default'
    const agent = agentStore.getAgentById(agentId)
    if (!agent) {
      messageApi.error('未找到当前智能体')
      return
    }

    agentStore.updateAgent(agent.id, { workPath })
    canvasStore.resetWorkspaceRoot(chatId)
    addToWorkPathHistory(workPath)
    messageApi.success(`已设置工作路径：${workPath}`)
  }

  const chooseCurrentAgentWorkPath = async () => {
    if (!canChooseLocalWorkPath.value) {
      messageApi.warning('移动端暂不支持本机工作路径，请使用临时工作区')
      return
    }

    let chatId = chatStore.currentChat?.id
    if (!chatId) chatId = chatStore.createChat()

    const chat = chatStore.getChatById(chatId)
    const agentId = chat?.agentId || 'default'
    const agent = agentStore.getAgentById(agentId)
    if (!agent) {
      messageApi.error('未找到当前智能体')
      return
    }

    const result = await window.api.showOpenDialog({
      title: `选择 ${agent.name} 的工作路径`,
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: agent.workPath || undefined
    })

    if (result.canceled || !result.filePaths?.[0]) return

    const workPath = result.filePaths[0]
    agentStore.updateAgent(agent.id, { workPath })
    canvasStore.resetWorkspaceRoot(chatId)
    addToWorkPathHistory(workPath)
    messageApi.success(`已设置工作路径：${workPath}`)
  }

  const clearCurrentAgentWorkPath = () => {
    if (!canChooseLocalWorkPath.value || !currentAgentWorkPath.value) return
    const chatId = chatStore.currentChat?.id
    const agentId = chatStore.currentChat?.agentId || 'default'
    const agent = agentStore.getAgentById(agentId)
    if (!agent) return
    agentStore.updateAgent(agent.id, { workPath: '' })
    if (chatId) canvasStore.resetWorkspaceRoot(chatId)
    messageApi.success('已清空工作路径')
  }

  const openWorkPathContextMenu = (event: MouseEvent) => {
    const items: MenuItem[] = []

    for (const path of recentWorkPaths.value) {
      const api = window.api as Partial<typeof window.api> | undefined
      const label = api?.path?.basename(path) || path.split(/[\\/]/).filter(Boolean).pop() || path
      items.push({
        label,
        icon: HistoryClock,
        onClick: () => applyWorkPath(path)
      })
    }

    if (items.length > 0) {
      items.push({ type: 'divider' })
    }

    items.push({
      label: '浏览...',
      onClick: () => { void chooseCurrentAgentWorkPath() }
    })

    items.push({ type: 'divider' })

    items.push({
      label: '清空工作路径',
      icon: Delete,
      danger: true,
      disabled: !currentAgentWorkPath.value,
      onClick: clearCurrentAgentWorkPath
    })

    showContextMenu(event, items)
  }

  return {
    currentAgentWorkPath,
    canChooseLocalWorkPath,
    workPathButtonTitle,
    workPathButtonLabel,
    recentWorkPaths,
    chooseCurrentAgentWorkPath,
    openWorkPathContextMenu
  }
}
