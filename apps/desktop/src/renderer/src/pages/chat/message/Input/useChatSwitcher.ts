import { computed, ref, watch } from 'vue'
import { useChatsStores } from '@renderer/stores/chats'

export const useChatSwitcher = () => {
  const chatStore = useChatsStores()
  const showChatSwitcher = ref(false)
  const chatSwitcherQuery = ref('')
  const chatSwitcherMode = ref<'list' | 'create' | 'rename' | 'delete'>('list')
  const chatSwitcherTargetId = ref<string | null>(null)
  const chatSwitcherDraftTitle = ref('')

  const sortedChats = computed(() =>
    [...chatStore.allChats].sort((a, b) => b.createdAt - a.createdAt)
  )

  const filteredChats = computed(() => {
    const keyword = chatSwitcherQuery.value.trim().toLowerCase()
    if (!keyword) return sortedChats.value
    return sortedChats.value.filter((chat) => {
      const parentTitle = chat.parentChatId
        ? chatStore.getChatById(chat.parentChatId)?.title || ''
        : ''
      return `${chat.title} ${parentTitle}`.toLowerCase().includes(keyword)
    })
  })

  const chatSwitcherTargetChat = computed(() =>
    chatSwitcherTargetId.value ? chatStore.getChatById(chatSwitcherTargetId.value) || null : null
  )

  const isChatGenerating = (chat: Chat) => chatStore.isChatGenerating(chat.id)

  const getChatSecondaryText = (chat: Chat) => {
    if (!chat.parentChatId) return ''
    return chatStore.getChatById(chat.parentChatId)?.title || '子会话'
  }

  const resetChatSwitcherState = () => {
    chatSwitcherMode.value = 'list'
    chatSwitcherTargetId.value = null
    chatSwitcherDraftTitle.value = ''
  }

  watch(showChatSwitcher, (visible) => {
    if (!visible) {
      chatSwitcherQuery.value = ''
      resetChatSwitcherState()
    }
  })

  const selectChatFromSwitcher = (chatId: string) => {
    chatStore.setActiveChat(chatId)
    showChatSwitcher.value = false
  }

  const openCreateChatInline = () => {
    chatSwitcherMode.value = 'create'
    chatSwitcherTargetId.value = null
    chatSwitcherDraftTitle.value = ''
  }

  const openRenameChatInline = (chat: Chat) => {
    chatSwitcherMode.value = 'rename'
    chatSwitcherTargetId.value = chat.id
    chatSwitcherDraftTitle.value = chat.title
  }

  const openDeleteChatInline = (chat: Chat) => {
    chatSwitcherMode.value = 'delete'
    chatSwitcherTargetId.value = chat.id
    chatSwitcherDraftTitle.value = chat.title
  }

  const submitCreateChatInline = () => {
    chatStore.createChat(chatSwitcherDraftTitle.value.trim() || '新的聊天')
    showChatSwitcher.value = false
  }

  const submitRenameChatInline = () => {
    const chatId = chatSwitcherTargetId.value
    const title = chatSwitcherDraftTitle.value.trim()
    if (!chatId || !title) return
    chatStore.renameChat(chatId, title)
    resetChatSwitcherState()
  }

  const submitDeleteChatInline = () => {
    const chatId = chatSwitcherTargetId.value
    if (!chatId) return
    chatStore.deleteChat(chatId)
    resetChatSwitcherState()
  }

  return {
    chatStore,
    showChatSwitcher,
    chatSwitcherQuery,
    chatSwitcherMode,
    chatSwitcherDraftTitle,
    filteredChats,
    chatSwitcherTargetChat,
    isChatGenerating,
    getChatSecondaryText,
    resetChatSwitcherState,
    selectChatFromSwitcher,
    openCreateChatInline,
    openRenameChatInline,
    openDeleteChatInline,
    submitCreateChatInline,
    submitRenameChatInline,
    submitDeleteChatInline
  }
}
