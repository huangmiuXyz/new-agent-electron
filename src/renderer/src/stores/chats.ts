import type { BaseMessage, StoredMessage } from '@langchain/core/messages'
import { mapStoredMessagesToChatMessages } from '@langchain/core/messages'

export const useChatsStores = defineStore(
  'chats',
  () => {
    const chats = ref<Chat[]>([])
    const activeChatId = ref<string | null>(null)

    const currentChat = computed(() => {
      return chats.value.find((c) => c.id === activeChatId.value) || null
    })

    const createChat = (title = '新的聊天') => {
      const agentStore = useAgentStore()
      const id = nanoid()
      const chat: Chat = {
        id,
        title,
        messages: [],
        createdAt: Date.now(),
        agentId: agentStore.selectedAgentId || 'default'
      }
      chats.value.push(chat)
      activeChatId.value = id
      return id
    }
    const getChatById = (id: string) => {
      return chats.value.find((c) => c.id === id)
    }
    const deleteChat = (id: string) => {
      chats.value = chats.value.filter((c) => c.id !== id)

      if (activeChatId.value === id) {
        activeChatId.value = chats.value[0]?.id || null
      }
    }
    const deleteMessage = (cid: string, mid: string) => {
      const chat = getChatById(cid)!
      chat.messages = chat?.messages.filter((m) => m.id !== mid)
    }

    const renameChat = (id: string, title: string) => {
      const chat = getChatById(id)
      if (chat) chat.title = title
    }

    const setActiveChat = (id: string) => {
      activeChatId.value = id
    }

    const addMessageToChat = (msg: BaseMessage) => {
      currentChat.value!.messages.push(msg)
      return msg.id
    }
    const updateMessage = (cid: string, mid: string, newContent: string | any[]) => {
      const chat = getChatById(cid)
      if (!chat) return
      const msg = chat.messages.find((m) => m.id === mid)
      if (msg) {
        msg.content = newContent
      }
    }

    return {
      chats,
      activeChatId,
      currentChat,
      createChat,
      deleteChat,
      renameChat,
      setActiveChat,
      addMessageToChat,
      getChatById,
      deleteMessage,
      updateMessage
    }
  },
  {
    persist: {
      serializer: {
        deserialize: (state) => {
          const parsedState = JSON.parse(state)
          if (parsedState.chats) {
            parsedState.chats = parsedState.chats.map((chat: Chat) => ({
              ...chat,
              messages: mapStoredMessagesToChatMessages(chat.messages as unknown as StoredMessage[])
            }))
          }
          return parsedState
        },
        serialize: (state) => {
          return JSON.stringify({
            ...state,
            chats: state.chats.map((chat: Chat) => ({
              ...chat,
              messages: chat.messages.map((m) => {
                return m.toDict()
              })
            }))
          })
        }
      }
    }
  }
)
