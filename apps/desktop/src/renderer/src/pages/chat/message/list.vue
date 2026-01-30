<script setup lang="ts">
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import { useElementSize } from '@vueuse/core'

const messageScrollRef = useTemplateRef('messageScrollRef')
const prevMessageRef = ref<HTMLElement>()

const autoScrollEnabled = ref(true)
const { showContextMenu } = useContextMenu<BaseMessage>()
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage } = useChatsStores()

const processedMessages = computed(() => {
  const messages = currentChat.value?.messages || []
  const result: any[] = []

  messages.forEach((msg, index) => {
    const dividerIndex = messages.length - contextCount.value
    if (index === dividerIndex && contextCount.value < messages.length) {
      result.push({
        id: `divider-${currentChat.value?.id}-${dividerIndex}`,
        virtualType: 'divider'
      })
    }
    result.push({
      ...msg,
      virtualType: 'message',
      index
    })
  })

  return result
})

const { Delete, Refresh, Continue, Copy, Edit, Branch, Language } = useIcon([
  'Delete',
  'Refresh',
  'Copy',
  'Edit',
  'Branch',
  'Language',
  'Stop',
  'Continue'
])

const { translateMessage, translateWithCustomLanguage } = useTranslation()

const editingMessageId = ref<string | null>(null)

const triggerEdit = (messageId: string) => {
  editingMessageId.value = messageId
}

const cancelEdit = () => {
  editingMessageId.value = null
}

provide('messageEdit', {
  editingMessageId,
  triggerEdit,
  cancelEdit
})

const { currentSelectedModel } = storeToRefs(useSettingsStore())
const { selectedAgent } = storeToRefs(useAgentStore())

const contextCount = computed(() => {
  return selectedAgent.value?.contextCount ?? 10
})

const lastMessageIndex = computed(() => {
  if (!currentChat.value || currentChat.value.messages.length === 0) return -1
  return currentChat.value.messages.length - 1
})

const { height: containerHeight } = useElementSize(computed(() => (messageScrollRef.value as any)?.$el))
const { height: prevMessageHeight } = useElementSize(prevMessageRef)

const lastMessageHeight = computed(() => {
  if (lastMessageIndex.value >= 0 && containerHeight.value > 0 && prevMessageHeight.value > 0) {
    const height = containerHeight.value - prevMessageHeight.value - 10
    return `${Math.max(0, height)}px`
  }
  return 'auto'
})

// 自动滚动到底部
watch(
  () => processedMessages.value.length,
  () => {
    if (autoScrollEnabled.value) {
      nextTick(() => {
        (messageScrollRef.value as any)?.scrollToItem(processedMessages.value.length - 1)
      })
    }
  }
)

// 处理流式输出时的滚动
watch(
  () => currentChat.value?.messages.at(-1)?.parts,
  () => {
    if (autoScrollEnabled.value) {
      (messageScrollRef.value as any)?.scrollToItem(processedMessages.value.length - 1)
    }
  },
  { deep: true }
)

const onScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50
  autoScrollEnabled.value = isAtBottom
}

const onMessageRightClick = (event: MouseEvent, message: BaseMessage) => {
  event.preventDefault()
  event.stopPropagation()
  const messageMenuOptions: MenuItem<BaseMessage>[] = [
    {
      label: '编辑',
      icon: Edit,
      onClick: () => {
        triggerEdit(message.id!)
      }
    },
    {
      label: '创建分支',
      icon: Branch,
      onClick: (data) => {
        const { forkChat } = useChatsStores()
        forkChat(currentChat.value!.id, data.id!)
      }
    },
    {
      label: '创建分支并继续',
      icon: Branch,
      onClick: (data) => {
        const { forkChat } = useChatsStores()
        forkChat(currentChat.value!.id, data.id!)
        const { regenerate } = useChat(currentChat.value!.id!)
        regenerate(currentChat.value?.messages.at(-1)?.id!)
      }
    },
    {
      label: '复制',
      icon: Copy,
      onClick: () => copyText(message.parts.map((e) => (e.type === 'text' ? e.text : '')).join(''))
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
      label: '继续',
      icon: Continue,
      onClick: async () => {
        if (!currentSelectedModel.value) {
          messageApi.error('请先选择模型')
          return
        }
        const { continueMessages } = useChat(currentChat.value!.id!)
        continueMessages()
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
        })
      }
    }
  ]
  showContextMenu(event, messageMenuOptions, message)
}
</script>
<template>
  <div class="messages-container">
    <DynamicScroller
      ref="messageScrollRef"
      :items="processedMessages"
      :min-item-size="50"
      class="scroller"
      key-field="id"
      @scroll="onScroll"
    >
      <template v-slot="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :size-dependencies="[item.parts, item.content]"
          :data-index="index"
          :data-active="active"
        >
          <template v-if="item.virtualType === 'divider'">
            <div class="context-divider">
              <div class="divider-line"></div>
              <span class="divider-text">上下文分割线</span>
              <div class="divider-line"></div>
            </div>
          </template>
          <template v-else>
            <ChatMessageItemHuman
              v-if="item.role === 'user'"
              :message="item"
              :ref="item.index === lastMessageIndex - 1 ? 'prevMessageRef' : undefined"
              @contextmenu="onMessageRightClick($event, item)"
            />
            <ChatMessageItemAi
              v-if="item.role === 'assistant'"
              :message="item"
              :style="{
                minHeight: item.index === lastMessageIndex ? lastMessageHeight : 'auto',
                height: 'auto',
                flex: 'none'
              }"
              @contextmenu="onMessageRightClick($event, item)"
            />
          </template>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </div>
</template>

<style scoped>
.messages-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.scroller {
  flex: 1;
}

:deep(.vue-recycle-scroller__item-wrapper) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

.context-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  padding: 0 20px;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
  opacity: 0.5;
}

.divider-text {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-weight: 500;
}
</style>
