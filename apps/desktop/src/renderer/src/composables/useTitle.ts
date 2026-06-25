export const useTitle = (chatId: string) => {
  const settingsStore = useSettingsStore()
  const { getChatById, renameChat, setTitleGenerating } = useChatsStores()
  const chat = getChatById(chatId)
  const isGeneratingTitle = ref(false)

  const generateTitle = async (userMessageText?: string) => {
    const hasDefaultTitle = chat!.title === '新的聊天'

    if (hasDefaultTitle && userMessageText && !isGeneratingTitle.value) {
      const titleModel = settingsStore.getTitleGenerationModel

      if (titleModel) {
        const provider = settingsStore.getProviderById(
          settingsStore.defaultModels.titleGenerationProviderId
        )
        const prompt = `请根据以下对话内容，生成一个简洁、准确的聊天标题。标题应该：\n1. 不超过15个字符\n2. 准确反映对话主题\n3. 使用中文\n4. 不要包含引号或其他标点符号\n\n对话内容：\n${userMessageText}\n\n只返回标题，不要其他内容：`

        const service = chatService()
        try {
          isGeneratingTitle.value = true
          setTitleGenerating(chatId, true)

          const generatedTitle = (
            await service.generateText(prompt, {
              model: titleModel.id,
              apiKey: provider?.apiKey || '',
              baseURL: provider?.baseUrl || '',
              provider: provider?.id || '',
              providerType: provider?.providerType || 'openai'
            })
          ).text
          const cleanTitle = generatedTitle.trim().replace(/[""''""']/g, '')
          renameChat(chatId, cleanTitle)
        } catch (error) {
          messageApi.error((error as Error).message)
        } finally {
          isGeneratingTitle.value = false
          setTitleGenerating(chatId, false)
        }
      }
    }
  }

  return {
    generateTitle,
    isGeneratingTitle: readonly(isGeneratingTitle)
  }
}
