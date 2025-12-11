export interface TranslationOptions {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  modelType: string
}

export function useTranslation() {
  const { currentChat } = storeToRefs(useChatsStores())
  const { updateMessageMetadata } = useChatsStores()

  /**
   * 翻译消息
   * @param message 要翻译的消息
   * @param targetLanguage 目标语言
   */
  const translateMessage = async (message: BaseMessage, targetLanguage: string) => {
    const settingsStore = useSettingsStore()
    const translationProviderId = settingsStore.defaultModels.translationProviderId
    const translationModelId = settingsStore.defaultModels.translationModelId

    if (!translationProviderId || !translationModelId) {
      messageApi.error('请先在设置中配置翻译模型')
      return
    }

    const provider = settingsStore.getProviderById(translationProviderId)
    const translationModel = provider?.models?.find((m) => m.id === translationModelId)

    if (!translationModel || !provider) {
      messageApi.error('翻译模型配置不完整，请检查设置')
      return
    }

    const textParts = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')

    if (!textParts.trim()) {
      messageApi.error('没有可翻译的文本内容')
      return
    }

    try {
      if (!provider.apiKey) {
        messageApi.error('翻译模型配置不完整，请检查设置')
        return
      }

      // 创建 AbortController 用于停止翻译
      const translationController = new AbortController()

      // 设置翻译加载状态并存储 AbortController
      if (message.metadata) {
        updateMessageMetadata(currentChat.value!.id, message.id!, {
          ...message.metadata,
          translationLoading: true,
          translationController: () => translationController.abort()
        })
      }

      const { translateText } = chatService()
      const result = await translateText(
        textParts,
        targetLanguage,
        {
          model: translationModel.id,
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl,
          provider: provider.id,
          modelType: provider.modelType
        },
        translationController.signal
      )

      if (message.metadata) {
        if (!message.metadata.translations) {
          message.metadata.translations = []
        }
        message.metadata.translations.push({
          text: result,
          targetLanguage,
          timestamp: Date.now()
        })

        // 清除翻译加载状态并更新翻译结果
        if (message.metadata) {
          updateMessageMetadata(currentChat.value!.id, message.id!, {
            ...message.metadata,
            translations: message.metadata.translations,
            translationLoading: false,
            translationController: undefined
          })
        }
      }

      messageApi.success('翻译完成')
    } catch (error) {
      console.error('翻译失败:', error)
      // 如果是手动中止的错误，不显示错误消息
      if ((error as Error).name !== 'AbortError') {
        messageApi.error(`翻译失败: ${(error as Error).message}`)
      }

      // 翻译失败时也要清除加载状态
      if (message.metadata) {
        updateMessageMetadata(currentChat.value!.id, message.id!, {
          ...message.metadata,
          translationLoading: false,
          translationController: undefined
        })
      }
    }
  }

  /**
   * 自定义语言翻译功能
   * @param message 要翻译的消息
   */
  const translateWithCustomLanguage = async (message: BaseMessage) => {
    const { confirm } = useModal()
    const [CustomLanguageSelector, { getFieldValue }] = useForm({
      fields: [
        {
          label: '自定义语言',
          type: 'text',
          name: 'customLanguage',
          placeholder: '请输入语言名称'
        }
      ],
      initialData: {
        customLanguage: ''
      }
    })

    if (
      await confirm({
        title: '自定义翻译',
        content: CustomLanguageSelector
      })
    ) {
      const customLanguage = getFieldValue('customLanguage')
      if (!customLanguage || customLanguage.trim() === '') {
        messageApi.error('请输入自定义语言名称')
        return
      }

      await translateMessage(message, customLanguage.trim())
    }
  }

  /**
   * 停止翻译
   * @param message 要停止翻译的消息
   */
  const stopTranslation = (message: BaseMessage) => {
    if (message.metadata?.translationController) {
      message.metadata.translationController()
    }
  }

  /**
   * 检查消息是否正在翻译
   * @param message 要检查的消息
   */
  const isTranslating = (message: BaseMessage) => {
    return !!message.metadata?.translationLoading
  }

  /**
   * 获取消息的翻译结果
   * @param message 要获取翻译结果的消息
   * @param targetLanguage 目标语言（可选）
   */
  const getTranslations = (message: BaseMessage, targetLanguage?: string) => {
    if (!message.metadata?.translations) return []

    if (targetLanguage) {
      return message.metadata.translations.filter((t) => t.targetLanguage === targetLanguage)
    }

    return message.metadata.translations
  }

  return {
    translateMessage,
    translateWithCustomLanguage,
    stopTranslation,
    isTranslating,
    getTranslations
  }
}
