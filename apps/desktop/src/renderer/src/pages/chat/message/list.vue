<script setup lang="ts">
import { FileUIPart, TextUIPart } from 'ai'
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import { copyElementImageToClipboard } from '@renderer/utils'
import { useElementSize, useThrottleFn } from '@vueuse/core'
import { nextTick } from 'vue'
import { useMessageScroll } from '@renderer/composables/useMessageScroll'
import { acquireZIndex } from '@renderer/utils/z-index-manager'

const { messageScrollRef } = useMessageScroll()
const scrollHostRef = ref<HTMLElement | null>(null)
const prevMessageWrapperRef = ref<HTMLElement | null>(null)

const autoScrollEnabled = ref(true)
const copyPreviewZIndex = acquireZIndex()
const { showContextMenu } = useContextMenu<BaseMessage>()
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage, updateMessage, loadMoreMessagesBefore } = useChatsStores()
const isLoadingMore = ref(false)
const mobileEditModal = useModal()
const { Delete, Refresh, Continue, Copy, Edit, Branch, Language, Image } = useIcon([
  'Delete',
  'Refresh',
  'Copy',
  'Edit',
  'Branch',
  'Language',
  'Image',
  'Stop',
  'Continue'
])

const { translateMessage, translateWithCustomLanguage } = useTranslation()

const editingMessageId = ref<string | null>(null)
const mobileCopyPreviewVisible = ref(false)
const mobileCopyPreviewText = ref('')
const mobileCopySelectedText = ref('')
const mobileSelectionSnapshot = ref('')
const mobileEditingMessageId = ref<string | null>(null)
const mobileEditDraftContent = ref<Array<FileUIPart | TextUIPart>>([])

const triggerEdit = (messageId: string) => {
  autoScrollEnabled.value = false
  editingMessageId.value = messageId
}

const cancelEdit = () => {
  editingMessageId.value = null
  nextTick(() => {
    autoScrollEnabled.value = true
  })
}

provide('messageEdit', {
  editingMessageId,
  triggerEdit,
  cancelEdit
})

const { currentSelectedModel, display } = storeToRefs(useSettingsStore())
const agentStore = useAgentStore()

const visibleMessages = computed(() => {
  return currentChat.value?.messages || []
})

// —— 消息入场动画追踪 ——
// 历史消息（会话恢复 / 切换会话加载）不播动画；只有在本视图中"新加入"的消息
// （用户发送、AI 新回复）才播放一次上浮淡入动画。
const seenMessageIds = ref<Set<string>>(new Set())
const animatingMessageIds = ref<Set<string>>(new Set())
const historySettled = ref(false)
const MESSAGE_ENTER_ANIMATION_MS = 320

const markMessageEntering = (messageId: string) => {
  const next = new Set(animatingMessageIds.value)
  next.add(messageId)
  animatingMessageIds.value = next

  window.setTimeout(() => {
    const current = new Set(animatingMessageIds.value)
    current.delete(messageId)
    animatingMessageIds.value = current
  }, MESSAGE_ENTER_ANIMATION_MS)
}

const settleEmptyHistory = () => {
  window.requestAnimationFrame(() => {
    if (visibleMessages.value.length === 0) {
      historySettled.value = true
    }
  })
}

// 切换会话时重置，使新会话的历史消息不播动画
watch(
  () => currentChat.value?.id,
  () => {
    seenMessageIds.value = new Set()
    animatingMessageIds.value = new Set()
    historySettled.value = false
    settleEmptyHistory()
  }
)

watch(
  visibleMessages,
  (messages) => {
    if (!historySettled.value) {
      // 历史未落定：非空批次记为历史；空会话下一帧落定，后续首条消息播放动画。
      if (messages.length === 0) {
        settleEmptyHistory()
        return
      }
      seenMessageIds.value = new Set(messages.map((m) => m.id).filter(Boolean) as string[])
      historySettled.value = true
      return
    }

    const nextSeen = new Set(seenMessageIds.value)
    messages.forEach((message) => {
      if (!message.id || nextSeen.has(message.id)) return
      nextSeen.add(message.id)
      markMessageEntering(message.id)
    })
    seenMessageIds.value = nextSeen
  },
  { immediate: true }
)

const isNewlyEntered = (messageId: string | undefined): boolean => {
  return !!messageId && animatingMessageIds.value.has(messageId)
}

const contextCount = computed(() => {
  const agentId = currentChat.value?.agentId
  return (agentId ? agentStore.getAgentById(agentId)?.contextCount : undefined) ?? 0
})

// 判断是否存在上下文压缩消息
const hasCompressedContext = computed(() => {
  return visibleMessages.value.some(
    (msg) =>
      msg.role === 'system' &&
      (msg.metadata?.isCompressedContext ||
        msg.parts?.some((p) => p.type === 'text' && p.text?.includes('[上下文已压缩]')))
  )
})

const lastMessageIndex = computed(() => {
  if (visibleMessages.value.length === 0) return -1
  return visibleMessages.value.length - 1
})

const autoScrollTrigger = computed(() => {
  const msgs = visibleMessages.value
  const last = msgs[msgs.length - 1]
  if (!last) return `${msgs.length}`
  let textLen = 0
  for (const p of last.parts) {
    if (p.type === 'text') textLen += (p as TextUIPart).text.length
  }
  return `${msgs.length}:${last.id}:${last.parts.length}:${textLen}`
})

const handleScrollTop = useThrottleFn(async (event: Event) => {
  const el = event.target as HTMLElement
  if (!el || isLoadingMore.value) return
  if (el.scrollTop > 50) return
  const chat = currentChat.value
  if (!chat) return
  isLoadingMore.value = true
  const prevScrollHeight = el.scrollHeight
  try {
    await loadMoreMessagesBefore(chat.id)
    await nextTick()
    el.scrollTop = el.scrollHeight - prevScrollHeight
  } finally {
    isLoadingMore.value = false
  }
}, 300)

onMounted(() => {
  const el = scrollHostRef.value
  if (el) {
    el.addEventListener('scroll', handleScrollTop as EventListener)
  }
})

onUnmounted(() => {
  const el = scrollHostRef.value
  if (el) {
    el.removeEventListener('scroll', handleScrollTop as EventListener)
  }
})

const { height: containerHeight } = useElementSize(scrollHostRef)
const { height: prevMessageHeight } = useElementSize(prevMessageWrapperRef)
const LAST_MESSAGE_BOTTOM_GAP = 16

const lastMessageHeight = computed(() => {
  if (lastMessageIndex.value >= 0 && containerHeight.value > 0 && prevMessageHeight.value > 0) {
    const prevHeight = prevMessageHeight.value
    const height = containerHeight.value - prevHeight - LAST_MESSAGE_BOTTOM_GAP
    return `${Math.max(0, height)}px`
  }
  return 'auto'
})

const getMessageText = (message: BaseMessage) => {
  return message.parts.map((e) => (e.type === 'text' ? e.text : '')).join('')
}

const copyMessageAsImage = async (message: BaseMessage) => {
  if (!message.id) return

  const element = document.getElementById(`message-${message.id}`)
  if (!element) {
    messageApi.error('未找到当前信息')
    return
  }

  const closeLoading = messageApi.loading('正在复制为图片...')
  try {
    const hideSelectors = ['.context-divider']
    const copied = await copyElementImageToClipboard(element, {
      filter: (node) => !hideSelectors.some((selector) => node.matches(selector)),
      width: Math.max(element.scrollWidth, element.getBoundingClientRect().width)
    })

    closeLoading()

    if (copied) {
      messageApi.success('已复制为图片')
      return
    }

    messageApi.error('复制图片失败')
  } catch (error) {
    closeLoading()
    console.error('复制图片失败:', error)
    messageApi.error('复制图片失败')
  }
}

const isContextDividerVisible = (index: number) => {
  return (
    index === visibleMessages.value.length - contextCount.value &&
    contextCount.value < visibleMessages.value.length &&
    !hasCompressedContext.value
  )
}

const setPrevMessageWrapperRef = (el: Element | null) => {
  prevMessageWrapperRef.value = el instanceof HTMLElement ? el : null
}

const openMobileCopyPreview = (message: BaseMessage, selectedText = '') => {
  mobileCopyPreviewText.value = getMessageText(message)
  mobileCopySelectedText.value = selectedText
  mobileCopyPreviewVisible.value = true
}

const closeMobileCopyPreview = () => {
  mobileCopyPreviewVisible.value = false
  mobileCopyPreviewText.value = ''
  mobileCopySelectedText.value = ''
}

const resizeEditTextarea = (target: HTMLTextAreaElement) => {
  target.style.height = 'auto'

  if (isMobile.value) {
    const maxHeight = Math.max(window.innerHeight * 0.5, 160)
    target.style.height = `${Math.min(target.scrollHeight, maxHeight)}px`
    target.style.overflowY = target.scrollHeight > maxHeight ? 'auto' : 'hidden'
    return
  }

  target.style.height = `${target.scrollHeight}px`
}

const resetMobileEditState = () => {
  mobileEditingMessageId.value = null
  mobileEditDraftContent.value = []
}

const closeMobileEditModal = () => {
  resetMobileEditState()
  mobileEditModal.remove()
}

const saveMobileEdit = () => {
  if (!currentChat.value || !mobileEditingMessageId.value) return

  const filteredContent = mobileEditDraftContent.value.filter((part) => {
    if (part.type === 'text') {
      return part.text && part.text.trim() !== ''
    }

    return true
  })

  updateMessage(currentChat.value.id, mobileEditingMessageId.value, filteredContent)
}

const saveMobileEditAndClose = () => {
  saveMobileEdit()
  closeMobileEditModal()
}

const saveMobileEditAndRetry = () => {
  if (!currentChat.value || !mobileEditingMessageId.value) return

  const messageId = mobileEditingMessageId.value
  saveMobileEdit()
  closeMobileEditModal()

  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const { regenerate } = useChat(currentChat.value.id)
  setTimeout(() => {
    regenerate(messageId)
  })
}

const MobileEditContent = defineComponent({
  setup() {
    const textareaRefs = ref<Array<HTMLTextAreaElement | null>>([])

    const containerStyle = {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
      overflowY: 'auto' as const,
      overflowX: 'hidden' as const,
      WebkitOverflowScrolling: 'touch' as const,
      touchAction: 'pan-y' as const,
      padding: '12px'
    }

    const tipStyle = {
      fontSize: '12px',
      color: 'var(--text-tertiary)'
    }

    const getTextareaStyle = () => ({
      width: '100%',
      minHeight: '88px',
      maxHeight: isMobile.value ? '50vh' : 'none',
      padding: '12px',
      fontSize: `${display.value.fontSize}px`,
      lineHeight: '1.6',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '10px',
      outline: 'none',
      resize: 'none' as const,
      fontFamily: 'inherit',
      backgroundColor: 'var(--bg-input)',
      overflowY: isMobile.value ? ('auto' as const) : ('hidden' as const),
      WebkitOverflowScrolling: 'touch' as const,
      touchAction: 'pan-y' as const,
      boxSizing: 'border-box' as const
    })

    const syncTextareaHeights = () => {
      nextTick(() => {
        textareaRefs.value.forEach((textarea) => {
          if (textarea) resizeEditTextarea(textarea)
        })
      })
    }

    onMounted(syncTextareaHeights)
    onUpdated(syncTextareaHeights)

    return () =>
      h('div', { style: containerStyle }, [
        ...mobileEditDraftContent.value
          .map((block, idx) => {
            if (block.type !== 'text') return null

            return h('textarea', {
              key: `mobile-edit-${idx}`,
              value: block.text,
              rows: 1,
              placeholder: '编辑消息内容...',
              style: getTextareaStyle(),
              ref: ((el: Element | null) => {
                textareaRefs.value[idx] = el as HTMLTextAreaElement | null
              }) as any,
              onInput: (event: Event) => {
                const target = event.target as HTMLTextAreaElement
                block.text = target.value
                resizeEditTextarea(target)
              }
            })
          })
          .filter(Boolean),
        h('div', { style: tipStyle }, '仅支持编辑文本内容，附件会原样保留。')
      ])
  }
})

const openMobileEditModal = (message: BaseMessage) => {
  mobileEditingMessageId.value = message.id ?? null
  mobileEditDraftContent.value = JSON.parse(JSON.stringify(message.parts))

  mobileEditModal.confirm({
    title: '编辑消息',
    content: MobileEditContent,
    cancelText: '保存',
    confirmText: '保存并重试',
    showCancel: true,
    onOk: saveMobileEditAndRetry,
    onCancel: saveMobileEditAndClose,
    onClose: closeMobileEditModal,
    width: 'min(680px, 100%)',
    variant: isMobile.value ? 'drawer' : 'center',
    maxHeight: isMobile.value ? 'calc(var(--vh, 100vh) - 8px)' : '85vh',
    modalBodyStyle: isMobile.value
      ? {
          padding: '0',
          overflow: 'hidden',
          minHeight: '0'
        }
      : undefined
  })
}

const onMessageRightClick = (event: MouseEvent, message: BaseMessage) => {
  event.preventDefault()
  event.stopPropagation()
  mobileSelectionSnapshot.value = window.getSelection()?.toString().trim() || ''

  // 判断是否为系统消息
  const isSystemMessage = message.role === 'system'

  // 系统消息只显示删除选项
  if (isSystemMessage) {
    const systemMenuOptions: MenuItem<BaseMessage>[] = [
      {
        label: '删除',
        icon: Delete,
        danger: true,
        onClick: () => {
          setTimeout(() => {
            deleteMessage(currentChat.value!.id, message.id!)
          })
        }
      }
    ]
    showContextMenu(event, systemMenuOptions, message)
    return
  }

  const messageMenuOptions: MenuItem<BaseMessage>[] = [
    {
      label: '编辑',
      icon: Edit,
      onClick: () => {
        if (isMobile.value) {
          openMobileEditModal(message)
          return
        }
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
      onClick: async (data) => {
        if (!currentSelectedModel.value) {
          messageApi.error('请先选择模型')
          return
        }
        const chatsStore = useChatsStores()
        const selectedMessage = data
        const newChatId = await chatsStore.forkChat(currentChat.value!.id, data.id!)
        if (!newChatId) return
        const { regenerate } = useChat(newChatId)
        setTimeout(() => {
          regenerate(selectedMessage.id!)
        })
      }
    },
    {
      label: '复制',
      icon: Copy,
      onClick: () => {
        const selection = window.getSelection()
        const selectedText = selection?.toString().trim() || mobileSelectionSnapshot.value
        if (selectedText) {
          if (isMobile.value) {
            openMobileCopyPreview(message, selectedText)
            return
          }
          copyText(selectedText)
        } else {
          copyText(getMessageText(message))
        }
      },
      children: [
        {
          label: '复制选中文字',
          icon: Copy,
          onClick: () => {
            const selection = window.getSelection()
            const selectedText = selection?.toString().trim() || mobileSelectionSnapshot.value
            if (selectedText) {
              if (isMobile.value) {
                openMobileCopyPreview(message, selectedText)
                return
              }
              copyText(selectedText)
              return
            }
            if (isMobile.value) {
              openMobileCopyPreview(message)
              return
            }
            messageApi.warning('请先选中文本')
          }
        },
        {
          label: '复制当前信息',
          icon: Copy,
          onClick: () => copyText(getMessageText(message))
        },
        {
          label: '复制为图片',
          icon: Image,
          onClick: () => copyMessageAsImage(message)
        },
        {
          label: '复制当前话题',
          icon: Copy,
          onClick: async () => {
            const allMessages = visibleMessages.value
            if (allMessages.length === 0) return

            // 分片处理，每片 100 条消息
            const CHUNK_SIZE = 100
            const contentChunks: string[] = []

            for (let i = 0; i < allMessages.length; i += CHUNK_SIZE) {
              const chunk = allMessages.slice(i, i + CHUNK_SIZE)
              const chunkContent = chunk
                .map((msg) => {
                  const role = msg.role === 'user' ? '用户' : '助手'
                  const content = msg.parts.map((e) => (e.type === 'text' ? e.text : '')).join('')
                  return `${role}: ${content}`
                })
                .join('\n\n')
              contentChunks.push(chunkContent)

              // 每处理一个分片让出控制权，避免阻塞 UI
              if (i + CHUNK_SIZE < allMessages.length) {
                await new Promise((resolve) => setTimeout(resolve, 0))
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
      disabled: useChatsStores().isChatGenerating(currentChat.value!.id) && !message.metadata?.loading,
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
    ...(message.role === 'assistant'
      ? [
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
          }
        ]
      : []),
    {
      label: '删除',
      icon: Delete,
      danger: true,
      onClick: (data) => {
        setTimeout(() => {
          deleteMessage(currentChat.value!.id, data.id!)
        })
      }
    }
  ]
  showContextMenu(event, messageMenuOptions, message)
}
</script>
<template>
  <div class="message-list-wrapper">
    <div ref="scrollHostRef" class="message-scroll-host">
      <MessageScrollContainer
        ref="messageScrollRef"
        :enabled="autoScrollEnabled"
        :threshold="5"
        :auto-scroll-trigger="autoScrollTrigger"
        :reset-key="currentChat?.id ?? null"
      >
        <div :class="{ 'is-centered': display.chatCenteredLayout }" class="messages-content">
          <template v-for="(message, index) in visibleMessages" :key="message.id">
            <div
              v-memo="[
                message,
                index === lastMessageIndex,
                index === lastMessageIndex ? lastMessageHeight : '',
                editingMessageId === message.id,
                isContextDividerVisible(index),
                isNewlyEntered(message.id)
              ]"
              :id="`message-${message.id}`"
              class="message-item-wrapper"
              :class="{
                'is-last-message': index === lastMessageIndex,
                'is-newly-entered': isNewlyEntered(message.id)
              }"
              :style="index === lastMessageIndex ? { minHeight: lastMessageHeight } : undefined"
              :ref="
                index === lastMessageIndex - 1
                  ? (ref) => setPrevMessageWrapperRef(ref as Element)
                  : undefined
              "
            >
              <div v-if="isContextDividerVisible(index)" class="context-divider">
                <div class="divider-line"></div>
                <span class="divider-text">上下文分割线</span>
                <div class="divider-line"></div>
              </div>
              <ChatMessageItemHuman
                v-if="message.role === 'user'"
                :message="message"
                :style="
                  index === lastMessageIndex
                    ? {
                        minHeight: 0,
                        height: 'auto',
                        flex: '1 1 auto'
                      }
                    : undefined
                "
                @contextmenu="onMessageRightClick($event, message)"
              />
              <ChatMessageItemAi
                v-else-if="message.role === 'assistant'"
                :message="message"
                :style="{
                  minHeight: index === lastMessageIndex ? 0 : undefined,
                  height: 'auto',
                  flex: index === lastMessageIndex ? '1 1 auto' : 'none'
                }"
                @contextmenu="onMessageRightClick($event, message)"
              />
              <ChatMessageItemSystem
                v-else-if="message.role === 'system'"
                :message="message"
                :style="
                  index === lastMessageIndex
                    ? {
                        minHeight: 0,
                        height: 'auto',
                        flex: '1 1 auto'
                      }
                    : undefined
                "
                @contextmenu="onMessageRightClick($event, message)"
              />
            </div>
          </template>
        </div>
      </MessageScrollContainer>
    </div>

    <ChatMessageNav :container="messageScrollRef" />

    <Teleport to="body">
      <div
        v-if="isMobile && mobileCopyPreviewVisible"
        class="mobile-copy-preview-overlay"
        :style="{ zIndex: copyPreviewZIndex }"
        @click.self="closeMobileCopyPreview"
      >
        <div class="mobile-copy-preview-card" role="dialog" aria-modal="true">
          <div class="mobile-copy-preview-header">
            <div class="mobile-copy-preview-title">复制内容</div>
            <Button size="sm" variant="text" @click="closeMobileCopyPreview">关闭</Button>
          </div>
          <div v-if="mobileCopySelectedText" class="mobile-copy-selected-text">
            已选中: {{ mobileCopySelectedText }}
          </div>
          <div class="mobile-copy-preview-content">
            {{ mobileCopyPreviewText }}
          </div>
          <div class="mobile-copy-preview-tip">长按上方文本即可复制</div>
        </div>
      </div>
    </Teleport>
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

.messages-content.is-centered {
  max-width: 800px;
  margin: 0 auto;
}

.message-scroll-host {
  flex: 1;
  min-height: 0;
}

.messages-content {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.message-list-wrapper :deep(.auto-scroll-container) {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-height: 0;
}

.message-item-wrapper {
  content-visibility: auto;
  contain-intrinsic-size: auto 100px;

  display: flex;
  flex-direction: column;
  flex: none;
  position: relative;

  margin-bottom: 8px;
  transition: background-color 0.5s ease;
}

.message-item-wrapper.is-last-message {
  min-height: 0;
}

/* 新消息入场：克制但可感知地淡入并轻微上浮，仅播放一次 */
.message-item-wrapper.is-newly-entered {
  will-change: transform, opacity;
  animation: message-rise-in 0.32s var(--motion-ease-decelerated);
}

@keyframes message-rise-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
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

.mobile-copy-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px 12px max(12px, var(--safe-area-bottom, 0px)) 12px;
}

.mobile-copy-preview-card {
  width: 100%;
  max-width: 620px;
  max-height: calc(var(--vh, 100vh) - 24px);
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.mobile-copy-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-copy-preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.mobile-copy-selected-text {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border-radius: 8px;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
}

.mobile-copy-preview-content {
  flex: 1;
  min-height: 0;
  max-height: calc(var(--vh, 100vh) - 180px);
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  background: var(--bg-hover);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
}

.mobile-copy-preview-tip {
  font-size: 12px;
  color: var(--text-tertiary);
}

@media (max-width: 767px) {
  .message-list-wrapper {
    touch-action: pan-y;
  }

.message-list-wrapper :deep(.message-scroll-container) {
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }
}
</style>
