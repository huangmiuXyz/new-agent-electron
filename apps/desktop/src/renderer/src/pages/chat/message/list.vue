<script setup lang="ts">
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import { useElementSize } from '@vueuse/core'
import { AutoScrollContainer } from '@incremark/vue'

const messageScrollRef = useTemplateRef('messageScrollRef')
const prevMessageRef = ref<HTMLElement>()

const autoScrollEnabled = ref(true)
const { showContextMenu } = useContextMenu<BaseMessage>()
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage } = useChatsStores()
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

const { height: containerHeight } = useElementSize(messageScrollRef)
const { height: prevMessageHeight } = useElementSize(prevMessageRef)

const lastMessageHeight = computed(() => {
  if (lastMessageIndex.value >= 0 && containerHeight.value > 0 && prevMessageHeight.value > 0) {
    const height = containerHeight.value - prevMessageHeight.value - 10
    return `${Math.max(0, height)}px`
  }
  return 'auto'
})

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
        data.metadata?.stop?.()
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
  <AutoScrollContainer ref="messageScrollRef" :enabled="autoScrollEnabled" :threshold="0">
    <div class="messages-content">
      <template v-for="(message, index) in currentChat?.messages" :key="`${currentChat?.id}-${message.id}-${index}`">
        <div v-if="index === currentChat!.messages.length - contextCount && contextCount < currentChat!.messages.length"
          class="context-divider">
          <div class="divider-line"></div>
          <span class="divider-text">上下文分割线</span>
          <div class="divider-line"></div>
        </div>
        <ChatMessageItemHuman v-if="message.role === 'user'" :message="message"
          :ref="index === lastMessageIndex - 1 ? 'prevMessageRef' : undefined"
          @contextmenu="onMessageRightClick($event, message)" />
        <ChatMessageItemAi v-if="message.role === 'assistant'" :message="message" :style="{
          minHeight: index === lastMessageIndex ? lastMessageHeight : 'auto',
          height: 'auto',
          flex: 'none'
        }" @contextmenu="onMessageRightClick($event, message)" />
      </template>
    </div>
  </AutoScrollContainer>
</template>

<style scoped>
.messages-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

:deep(.auto-scroll-container),
.auto-scroll-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
