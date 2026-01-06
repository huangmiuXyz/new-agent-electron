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

    const contextCount = agent.selectedAgent?.contextCount ?? 10
    const slicedMessages = messages.length > contextCount ? messages.slice(-contextCount) : messages

    return scope.run(() => {
      const chat = new _useChat<BaseMessage>({
        messages: slicedMessages,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onData: (data) => {
          console.log(data)
        },
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
                ragEnabled: agent.selectedAgent?.ragEnabled,
                temperature: agent.selectedAgent?.temperature,
                topP: agent.selectedAgent?.topP,
                topK: agent.selectedAgent?.topK,
                presencePenalty: agent.selectedAgent?.presencePenalty,
                frequencyPenalty: agent.selectedAgent?.frequencyPenalty,
                maxOutputTokens: agent.selectedAgent?.maxOutputTokens
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

      watch(() => chat.messages, (messages) => {
        chats!.messages = messages
      })
      return chat!
    })!
  }

  const sendMessages = async (content: string | Array<FileUIPart | TextUIPart>) => {
    const chat = createChat(chats?.messages!)
    const parts: Array<FileUIPart | TextUIPart> =
      typeof content === 'string' ? [{ type: 'text', text: content }] : content
    chat.sendMessage({
      id: chat.generateId(),
      role: 'user',
      parts
    })
  }

  const regenerate = (messageId: string) => {
    const chat = createChat(chats?.messages!)
    chat.regenerate({ messageId })
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
