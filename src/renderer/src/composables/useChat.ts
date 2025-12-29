import { Chat as _useChat } from '@ai-sdk/vue'
import type { FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import { lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

export const useChat = (chatId: string) => {
  const { getChatById } = useChatsStores()
  const chats = getChatById(chatId)

  const { currentSelectedProvider, currentSelectedModel, thinkingMode } =
    storeToRefs(useSettingsStore())
  const agent = useAgentStore()
  const mcpClient = agent.getMcpByAgent(agent.selectedAgent!.id!).mcpServers
  const service = chatService()
  const mcpTools = agent.selectedAgent!.tools! || []
  const builtinTools = agent.selectedAgent!.builtinTools! || []
  const { apiKey, baseUrl, id: provider, providerType } = toRefs(currentSelectedProvider.value!)
  const { id: model } = toRefs(currentSelectedModel.value!)
  const createChat = (messages: BaseMessage[]): _useChat<BaseMessage> => {
    const scope = effectScope()

    return scope.run(() => {
      const chat = new _useChat<BaseMessage>({
        messages,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        transport: {
          sendMessages: ({ messages }) => {
            return service.createAgent(
              chat.id,
              {
                model: model.value!,
                apiKey: apiKey!.value!,
                baseURL: baseUrl.value,
                provider: provider.value,
                providerType: providerType.value
              },
              messages,
              {
                mcpClient,
                instructions: agent.selectedAgent?.systemPrompt,
                mcpTools,
                builtinTools,
                knowledgeBaseIds: agent.selectedAgent?.knowledgeBaseIds,
                thinkingMode: thinkingMode.value,
                ragEnabled: agent.selectedAgent?.ragEnabled
              },
              (_mid: string, metadata: Partial<MetaData>) => {
                chat.lastMessage.metadata = { ...chat.lastMessage.metadata, ...metadata }
              }
            )
          },
          reconnectToStream: undefined as any
        },
        onFinish: () => {
          useTitle(chatId).generateTitle()
          scope.stop()
        },
        onError: (error) => {
          update(error)
        }
      })

      const _update = (error?: Error) => {
        chat.lastMessage.metadata = { ...chat.lastMessage.metadata, error }
      }

      const update = throttle(_update, 150, { edges: ['leading', 'trailing'] })
      return chat!
    })!
  }

  const sendMessages = async (content: string | Array<FileUIPart | TextUIPart>) => {
    const chat = createChat(chats?.messages!)
    const parts: Array<FileUIPart | TextUIPart> =
      typeof content === 'string' ? [{ type: 'text', text: content }] : content

    chats!.messages.push({
      id: chat.generateId(),
      role: 'user',
      parts
    })
    chats!.messages.push({
      id: chat.generateId(),
      role: 'assistant',
      parts: []
    })
    chat.sendMessage()
  }

  const regenerate = (messageId: string) => {
    const index = chats?.messages.findIndex((m) => m.id === messageId)!
    if (index === -1) return

    let targetIndex = index
    const message = chats!.messages[index]

    if (message.role === 'user') {
      const nextMessage = chats!.messages[index + 1]
      if (nextMessage && nextMessage.role === 'assistant') {
        targetIndex = index + 1
      } else {
        const newAssistantMessage = {
          id: nanoid(),
          role: 'assistant' as const,
          parts: []
        }
        chats!.messages.splice(index + 1, 0, newAssistantMessage)
        targetIndex = index + 1
      }
    }

    const messages = chats?.messages.slice(0, targetIndex)!
    const assistantMessage = {
      id: nanoid(),
      role: 'assistant' as const,
      parts: [],
      metadata: { cid: nanoid() } as MetaData
    }
    chats!.messages[targetIndex] = assistantMessage
    messages.push(assistantMessage)
    const chat = createChat(messages)
    chat.sendMessage()
  }
  const approval = (part: ToolUIPart, approved: boolean) => {
    const chat = createChat(chats?.messages!)
    chat.addToolApprovalResponse({
      id: part.approval?.id!,
      approved
    })
  }
  return {
    sendMessages,
    regenerate,
    approval
  }
}
