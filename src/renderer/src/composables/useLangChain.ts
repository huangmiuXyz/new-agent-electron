import { useSettingsStore } from '../stores/settings'
import { useChatsStores } from '../stores/chats'
import { useAgentStore } from '../stores/agent'
import { ChatConfig, ChatService } from '../services/ChatService'
import { ToolService } from '../services/tool/ToolService'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { reactive } from 'vue'
import { nanoid } from '../utils/nanoid'

export const useLangChain = () => {
  const settings = useSettingsStore()
  const chatStore = useChatsStores()
  const agentStore = useAgentStore()

  // 使用依赖注入创建服务
  const chatService = new ChatService()

  const chatStream = async (input: string, chatId: string) => {
    const chat = chatStore.getChatById(chatId)!
    const userMsg = new HumanMessage({
      id: nanoid(),
      content: input
    })
    chat.messages.push(userMsg)

    const { provider, model } = settings.getModelById(
      settings.currentSelectedProvider!.id,
      settings.currentSelectedModel!.id
    )!

    const mcpConfig = agentStore.getMcpByAgent(chat.agentId!)!
    const agent = agentStore.getAgentById(chat.agentId!)!

    const content = reactive<any[]>([{ type: 'text', text: '' }])
    const additional_kwargs = reactive<any>({
      reasoning_content: '',
      provider,
      model
    })

    const chatConfig: ChatConfig = {
      provider,
      model,
      chat,
      agent,
      mcpConfig,
      content,
      additional_kwargs
    }

    await chatService.generateResponse(chat.messages, chatConfig, () => chatStore.$persist())
  }

  const regenerate = async (messageId: string, chatId: string) => {
    const chat = chatStore.getChatById(chatId)!
    const index = chat.messages.findIndex((m) => m.id === messageId)

    if (index === -1) {
      console.error('未找到消息')
      return
    }

    const targetMessage = chat.messages[index]
    if (AIMessage.isInstance(targetMessage)) {
      chat.messages = chat.messages.slice(0, index)
    } else {
      chat.messages = chat.messages.slice(0, index + 1)
    }

    await chatStream(chat.messages[chat.messages.length - 1].content as string, chatId)
  }

  const toolService = new ToolService()

  return {
    chatStream,
    regenerate,
    list_models: chatService.listModels.bind(chatService),
    getMcpTools: toolService.getTools.bind(toolService),
    call_tools: toolService.callTool.bind(toolService)
  }
}
