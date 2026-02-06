<script setup lang="ts">
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import { useElementSize } from '@vueuse/core'
import { AutoScrollContainer } from '@incremark/vue'
import { useMessageScroll } from '@renderer/composables/useMessageScroll'

const { messageScrollRef } = useMessageScroll()
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

const { currentSelectedModel, display } = storeToRefs(useSettingsStore())
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
    const height = containerHeight.value - prevMessageHeight.value - 20
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
      onClick: () => {
        const selection = window.getSelection()
        const selectedText = selection?.toString() || ''
        if (selectedText) {
          copyText(selectedText)
        } else {
          copyText(message.parts.map((e) => (e.type === 'text' ? e.text : '')).join(''))
        }
      },
      children: [
        {
          label: '复制选中文字',
          icon: Copy,
          onClick: () => {
            const selection = window.getSelection()
            const selectedText = selection?.toString() || ''
            if (selectedText) {
              copyText(selectedText)
            }
          }
        },
        {
          label: '复制当前信息',
          icon: Copy,
          onClick: () => copyText(message.parts.map((e) => (e.type === 'text' ? e.text : '')).join(''))
        },
        {
          label: '复制当前话题',
          icon: Copy,
          onClick: async () => {
            const allMessages = currentChat.value?.messages || []
            if (allMessages.length === 0) return

            // 分片处理，每片 100 条消息
            const CHUNK_SIZE = 100
            const contentChunks: string[] = []

            for (let i = 0; i < allMessages.length; i += CHUNK_SIZE) {
              const chunk = allMessages.slice(i, i + CHUNK_SIZE)
              const chunkContent = chunk.map((msg) => {
                const role = msg.role === 'user' ? '用户' : '助手'
                const content = msg.parts.map((e) => (e.type === 'text' ? e.text : '')).join('')
                return `${role}: ${content}`
              }).join('\n\n')
              contentChunks.push(chunkContent)

              // 每处理一个分片让出控制权，避免阻塞 UI
              if (i + CHUNK_SIZE < allMessages.length) {
                await new Promise(resolve => setTimeout(resolve, 0))
              }
            }

            const finalContent = contentChunks.join('\n\n')
            copyText(finalContent)
          }
        }
      ]
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
        setTimeout(() => {
          regenerate(data.id!)
        })
      }
    },
    {
      label: '继续',
      icon: Continue,
      onClick: async (data) => {
        if (!currentSelectedModel.value) {
          messageApi.error('请先选择模型')
          return
        }
        data.metadata?.stop?.()
        const { continueMessages } = useChat(currentChat.value!.id!)
        setTimeout(() => {
          continueMessages()
        })
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
  <div class="message-list-wrapper" :class="{ 'is-centered': display.chatCenteredLayout }">
    <AutoScrollContainer  ref="messageScrollRef" :enabled="autoScrollEnabled"
      :threshold="5">
      <div class="messages-content">
        <template v-for="(message, index) in currentChat?.messages" :key="message.id">
          <div :id="`message-${message.id}`" class="message-item-wrapper">
            <div
              v-if="index === currentChat!.messages.length - contextCount && contextCount < currentChat!.messages.length"
              class="context-divider">
              <div class="divider-line"></div>
              <span class="divider-text">上下文分割线</span>
              <div class="divider-line"></div>
            </div>
            <ChatMessageItemHuman v-if="message.role === 'user'" :message="message"
              :ref="index === lastMessageIndex - 1 ? 'prevMessageRef' : undefined"
              @contextmenu="onMessageRightClick($event, message)" />
            <ChatMessageItemAi v-else-if="message.role === 'assistant'" :message="message" :style="{
              minHeight: index === lastMessageIndex ? lastMessageHeight : 'auto',
              height: 'auto',
              flex: 'none'
            }" @contextmenu="onMessageRightClick($event, message)" />
            <ChatMessageItemSystem v-else-if="message.role === 'system'" :message="message" />
          </div>
        </template>
      </div>
    </AutoScrollContainer>

    <ChatMessageNav :container="messageScrollRef" />
  </div>
</template>

<style scoped>
.message-list-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

.message-list-wrapper.is-centered {
  max-width: 800px;
  margin: 0 auto;
}

.messages-content {
  display: block;
  width: 100%;
}

.message-item-wrapper {
  content-visibility: auto;
  contain-intrinsic-size: auto 100px;

  contain: content;
  display: flow-root;
  will-change: transform;

  margin-bottom: 8px;
  transition: background-color 0.5s ease;
}

.message-item-wrapper.highlight-jump {
  background-color: rgba(var(--accent-rgb), 0.15);
  border-radius: 8px;
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
