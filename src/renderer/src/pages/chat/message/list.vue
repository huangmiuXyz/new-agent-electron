<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import { useElementSize } from '@vueuse/core'

const { messageScrollRef } = useMessagesScroll()
const { showContextMenu } = useContextMenu<BaseMessage>()
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage } = useChatsStores()
const { Delete, Refresh, Copy, Edit, Branch, Language } = useIcon([
  'Delete',
  'Refresh',
  'Copy',
  'Edit',
  'Branch',
  'Language',
  'Stop'
])

// 使用翻译hook
const { translateMessage, translateWithCustomLanguage } = useTranslation()

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

const lastMessageIndex = computed(() => {
  if (!currentChat.value || currentChat.value.messages.length === 0) return -1
  return currentChat.value.messages.length - 1
})

const { height: containerHeight } = useElementSize(messageScrollRef)

const lastMessageHeight = computed(() => {
  if (lastMessageIndex.value >= 0 && containerHeight.value > 0) {
    return `${containerHeight.value}px`
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
  <div class="messages" :ref="(ref) => (messageScrollRef = ref)">
    <template v-for="(message, index) in currentChat?.messages" :key="`${message.id}-${index}`">
      <ChatMessageItemHuman
        v-if="message.role === 'user'"
        :message="message"
        @contextmenu="onMessageRightClick($event, message)"
      />
      <ChatMessageItemAi
        v-if="message.role === 'assistant'"
        :message="message"
        :class="{ 'last-message': index === lastMessageIndex }"
        :style="{
          minHeight: index === lastMessageIndex ? lastMessageHeight : 'auto',
          height: 'auto',
          flex: 'none'
        }"
        @contextmenu="onMessageRightClick($event, message)"
      />
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
  padding-bottom: 16px;
}
</style>
