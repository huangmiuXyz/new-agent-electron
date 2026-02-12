import { useSettingsStore } from '@renderer/stores/settings'

export function usePromptOptimize() {
  const settingsStore = useSettingsStore()
  const service = chatService()

  const isOptimizing = ref(false)
  const optimizeModelId = useLocalStorage('optimizeModelId', settingsStore.selectedModelId)
  const optimizeProviderId = useLocalStorage('optimizeProviderId', settingsStore.selectedProviderId)

  const optimizePrompt = async (
    inputText: string,
    options?: {
      modelId?: string
      providerId?: string
      onProgress?: (text: string) => void
      onFinish?: () => void
    }
  ) => {
    if (!inputText.trim() || isOptimizing.value) return null

    const modelId = options?.modelId || optimizeModelId.value
    const providerId = options?.providerId || optimizeProviderId.value

    if (!modelId || !providerId) {
      messageApi.warning('请先选择一个用于优化的语言模型')
      return null
    }

    const provider = settingsStore.getProviderById(providerId)
    if (!provider) return null

    isOptimizing.value = true
    const originalPrompt = inputText
    let optimizedText = ''

    try {
      await service.streamText(
        `你是一个专业的 AI 绘画提示词专家。你的任务是将用户提供的简单描述，改写并扩充成详细、生动且专业的 AI 绘画提示词。请遵循以下规则：
1. 使用英语（除非用户特别要求其他语言）。
2. 增加关于光影、构图、风格、艺术媒介、细节描述的词汇。
3. 保持原始意图，不要改变主题。
4. 只返回优化后的提示词内容，不要有任何解释性文字。

用户描述：${originalPrompt}`,
        {
          model: modelId,
          apiKey: provider.apiKey || '',
          baseURL: provider.baseUrl || '',
          provider: provider.id,
          providerType: provider.providerType,
          onData: (text) => {
            optimizedText += text
            options?.onProgress?.(optimizedText)
          },
          onFinish: () => {
            isOptimizing.value = false
            options?.onFinish?.()
          }
        }
      )

      return optimizedText || originalPrompt
    } catch (error) {
      console.error('Prompt optimization failed:', error)
      isOptimizing.value = false
      return originalPrompt
    }
  }

  const handleOptimizeModelChange = (val: { modelId: string; providerId: string }) => {
    optimizeModelId.value = val.modelId
    optimizeProviderId.value = val.providerId
  }

  return {
    isOptimizing,
    optimizeModelId,
    optimizeProviderId,
    optimizePrompt,
    handleOptimizeModelChange
  }
}
