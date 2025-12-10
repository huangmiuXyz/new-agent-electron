<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'

const { messageScrollRef } = useMessagesScroll()
const { showContextMenu } = useContextMenu<BaseMessage>();
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage } = useChatsStores()
const { Delete, Refresh, Copy, Edit, Branch, Language, Stop } = useIcon(['Delete', 'Refresh', 'Copy', 'Edit', 'Branch', 'Language', 'Stop'])


// 存储当前需要编辑的消息ID
const editingMessageId = ref<string | null>(null)

// 提供编辑功能给子组件
const triggerEdit = (messageId: string) => {
  editingMessageId.value = messageId
}

// 提供取消编辑功能
const cancelEdit = () => {
  editingMessageId.value = null
}

provide('messageEdit', {
  editingMessageId,
  triggerEdit,
  cancelEdit
})

const { currentSelectedModel } = storeToRefs(useSettingsStore())

// 翻译功能
const translateMessage = async (message: BaseMessage, targetLanguage: string) => {
  const settingsStore = useSettingsStore()
  const translationProviderId = settingsStore.defaultModels.translationProviderId
  const translationModelId = settingsStore.defaultModels.translationModelId

  if (!translationProviderId || !translationModelId) {
    messageApi.error('请先在设置中配置翻译模型')
    return
  }

  const provider = settingsStore.getProviderById(translationProviderId)
  const translationModel = provider?.models?.find(m => m.id === translationModelId)

  if (!translationModel || !provider) {
    messageApi.error('翻译模型配置不完整，请检查设置')
    return
  }

  const textParts = message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
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
    const { updateMessageMetadata } = useChatsStores()
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
    const { updateMessageMetadata } = useChatsStores()
    if (message.metadata) {
      updateMessageMetadata(currentChat.value!.id, message.id!, {
        ...message.metadata,
        translationLoading: false,
        translationController: undefined
      })
    }
  }
}

// 停止翻译功能
const stopTranslation = (message: BaseMessage) => {
  if (message.metadata?.translationController) {
    message.metadata.translationController()
    messageApi.info('正在停止翻译...')
  }
}

// 自定义语言翻译功能
const translateWithCustomLanguage = async (message: BaseMessage) => {
  const { confirm } = useModal()
  const [CustomLanguageSelector, { getFieldValue }] = useForm({
    fields: [{
      label: '自定义语言',
      type: 'text',
      name: 'customLanguage',
      placeholder: '请输入语言名称'
    }],
    initialData: {
      customLanguage: ''
    }
  })

  if (await confirm({
    title: '自定义翻译',
    content: CustomLanguageSelector
  })) {
    const customLanguage = getFieldValue('customLanguage')
    if (!customLanguage || customLanguage.trim() === '') {
      messageApi.error('请输入自定义语言名称')
      return
    }

    await translateMessage(message, customLanguage.trim())
  }
}

const onMessageRightClick = (event: MouseEvent, message: BaseMessage) => {
  event.preventDefault();
  event.stopPropagation();
  const messageMenuOptions: MenuItem<BaseMessage>[] = [
    {
      label: '编辑',
      icon: Edit,
      onClick: () => {
        triggerEdit(message.id!);
      }
    },
    {
      label: '从消息创建聊天分支',
      icon: Branch,
      onClick: (data) => {
        const { forkChat } = useChatsStores()
        forkChat(currentChat.value!.id, data.id!)
      }
    },
    {
      label: '复制',
      icon: Copy,
      onClick: () => copyText(message.parts.map(e => e.type === 'text' ? e.text : '').join(''))
    },
    {
      label: '翻译',
      icon: Language,
      children: [
        {
          label: '中文',
          icon: getLanguageFlag('中文'),
          onClick: () => translateMessage(message, '中文')
        },
        {
          label: '英文',
          icon: getLanguageFlag('英文'),
          onClick: () => translateMessage(message, '英文')
        },
        {
          label: '日文',
          icon: getLanguageFlag('日文'),
          onClick: () => translateMessage(message, '日文')
        },
        {
          label: '韩文',
          icon: getLanguageFlag('韩文'),
          onClick: () => translateMessage(message, '韩文')
        },
        {
          label: '法文',
          icon: getLanguageFlag('法文'),
          onClick: () => translateMessage(message, '法文')
        },
        {
          label: '德文',
          icon: getLanguageFlag('德文'),
          onClick: () => translateMessage(message, '德文')
        },
        {
          label: '西班牙文',
          icon: getLanguageFlag('西班牙文'),
          onClick: () => translateMessage(message, '西班牙文')
        },
        {
          label: '俄文',
          icon: getLanguageFlag('俄文'),
          onClick: () => translateMessage(message, '俄文')
        },
        {
          label: '自定义语言...',
          icon: getLanguageFlag('custom'),
          onClick: () => translateWithCustomLanguage(message)
        },
        {
          label: '停止翻译',
          icon: Stop,
          disabled: !message.metadata?.translationLoading || !message.metadata?.translationController,
          onClick: () => stopTranslation(message)
        }
      ]
    },
    {
      label: '重试',
      icon: Refresh,
      onClick: async (data) => {
        if (!currentSelectedModel.value) {
          messageApi.error('请先选择模型')
          return
        }
        const { regenerate } = useChat(currentChat.value!.id!)
        regenerate(data.id!)
      }
    },
    {
      label: '删除',
      icon: Delete,
      danger: true,
      onClick: (data) => {
        data.metadata?.stop?.()
        setTimeout(() => {
          deleteMessage(currentChat.value!.id, message.id!)
        });
      }
    }
  ];
  showContextMenu(event, messageMenuOptions, message);
};
</script>
<template>
  <div class="messages" :ref="ref => messageScrollRef = ref">
    <template v-for="(message, index) in currentChat?.messages" :key="`${message.id}-${index}`">
      <ChatMessageItemHuman v-if="message.role === 'user'" :message="message"
        @contextmenu="onMessageRightClick($event, message)" />
      <ChatMessageItemAi v-if="message.role === 'assistant'" :message="message"
        @contextmenu="onMessageRightClick($event, message)" />
    </template>
  </div>

</template>

<style scoped>
.messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
