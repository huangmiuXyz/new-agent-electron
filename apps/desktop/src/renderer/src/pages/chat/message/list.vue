<script setup lang="ts">
import type { FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import type { MenuItem } from '@renderer/composables/useContextMenu'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import { copyElementImageToClipboard } from '@renderer/utils'
import { nextTick } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useMessageScroll } from '@renderer/composables/useMessageScroll'
import { acquireZIndex } from '@renderer/utils/z-index-manager'
import { generateFlatItems, estimateItemHeight, type VirtualChatItem } from './composables/flatItems'
import { useChat } from '@renderer/composables/useChat'

const { messageScrollRef } = useMessageScroll()
const scrollHostRef = ref<HTMLElement | null>(null)

const autoScrollEnabled = ref(true)
const isUserScrolledUp = ref(false)
let lastScrollTop = 0
let isProgrammaticScroll = false

const copyPreviewZIndex = acquireZIndex()
const { showContextMenu } = useContextMenu<BaseMessage>()
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage, updateMessage, loadMoreMessagesBefore } = useChatsStores()
const isLoadingMore = ref(false)
const mobileEditModal = useModal()
const { Delete, Refresh, Continue, Copy, Edit, Branch, Language, Image, Stop, VolumeMedium, Robot, ChevronDown } = useIcon([
  'Delete',
  'Refresh',
  'Copy',
  'Edit',
  'Branch',
  'Language',
  'Image',
  'Stop',
  'Continue',
  'VolumeMedium',
  'Robot',
  'ChevronDown'
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
const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const chatsStore = useChatsStores()


const visibleMessages = computed(() => {
  return currentChat.value?.messages || []
})

const expandedCollapsedIds = ref(new Set<string>())

const toggleCollapsed = (messageId: string) => {
  const next = new Set(expandedCollapsedIds.value)
  if (next.has(messageId)) {
    next.delete(messageId)
  } else {
    next.add(messageId)
  }
  expandedCollapsedIds.value = next
}

// —— Flat items（assistant 消息的 parts 全打平到虚拟列表层）——
const flatItems = computed<VirtualChatItem[]>(() => generateFlatItems(
  visibleMessages.value,
  contextCount.value,
  hasCompressedContext.value,
  editingMessageId.value,
  settingsStore.display.collapsePreviousContent,
  expandedCollapsedIds.value
))

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

const hasAudioChunks = (msg: BaseMessage | null | undefined): boolean => {
  return (msg?.metadata?.audio?.chunks?.length ?? 0) > 0
}



const getRetryText = (msg: BaseMessage | null | undefined): string => {
  if (!msg?.metadata?.retrying) return ''
  const errMsg = msg.metadata?.error?.message
  const attempt = msg.metadata.retryAttempt ?? 0
  const endsAt = msg.metadata.retryCountdownEndsAt
  const secs = endsAt ? Math.max(0, (endsAt - Date.now()) / 1000) : 0
  const attemptText = attempt > 0 ? `第 ${attempt} 次` : ''
  const prefix = errMsg ? `请求失败：${errMsg}` : '请求失败'
  if (secs > 0) {
    return `${prefix}，${attemptText}重试中，${Math.ceil(secs)} 秒后重试...`
  }
  return `${prefix}，正在${attemptText}重试...`
}

const handleErrorRetry = (messageId: string) => {
  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }
  if (!currentChat.value?.id) return
  const { regenerate } = useChat(currentChat.value.id)
  setTimeout(() => {
    regenerate(messageId)
  })
}

const getActivityText = (msg: BaseMessage | null | undefined): string => {
  if (!msg?.metadata?.loading) return ''
  const parts = msg.parts
  if (!parts?.length) return '正在准备中'
  const lastPart = parts[parts.length - 1]
  if (lastPart.type === 'reasoning') return '正在思考中'
  if (lastPart.type === 'dynamic-tool' || String(lastPart.type).startsWith('tool-')) {
    const toolName = String(lastPart.type).replace(/^tool-/, '') || '未知工具'
    const state = (lastPart as any)?.state
    if (state === 'approval-requested') return `等待确认工具 ${toolName}`
    if (state === 'output-error') return `工具 ${toolName} 调用失败`
    if (state === 'output-denied') return `工具 ${toolName} 已拒绝`
    if (state === 'output-available') return ''
    return `调用工具 ${toolName} 中`
  }
  if (lastPart.type === 'text') return '正在回复中'
  return '正在处理中'
}

const contextCount = computed(() => {
  const agentId = currentChat.value?.agentId
  return (agentId ? agentStore.getAgentById(agentId)?.contextCount : undefined) ?? 0
})

const hasCompressedContext = computed(() => {
  return visibleMessages.value.some(
    (msg) =>
      msg.role === 'system' &&
      (msg.metadata?.isCompressedContext ||
        msg.parts?.some((p) => p.type === 'text' && p.text?.includes('[上下文已压缩]')))
  )
})

const contentStyle = computed(() => ({
  fontSize: `${display.value.fontSize}px`
}))

// 虚拟滚动器
const virtualizer = useVirtualizer({
  get count() { return flatItems.value.length },
  getScrollElement: () => scrollHostRef.value,
  getItemKey: (index: number) => flatItems.value[index]?.uid ?? index,
  estimateSize: (index: number) => {
    const item = flatItems.value[index]
    return item ? estimateItemHeight(item) : 80
  },
  overscan: 8
})

const measureRef = (el: unknown) => {
  if (el instanceof HTMLElement) virtualizer.value.measureElement(el)
}

/**
 * Scroll to the last virtual item using the virtualizer's native scrollToIndex.
 * Unlike el.scrollTop = el.scrollHeight, this uses the virtualizer's internal
 * layout calculations which are always correct regardless of DOM update timing,
 * making it reliable during streaming where item sizes change frequently.
 */
const scrollToBottom = () => {
  isUserScrolledUp.value = false
  const lastIndex = flatItems.value.length - 1
  if (lastIndex < 0) return
  isProgrammaticScroll = true
  virtualizer.value.scrollToIndex(lastIndex, { align: 'end', behavior: 'auto' })
  // Reset the programmatic flag after the scroll event has been processed.
  // Use double rAF to ensure the virtualizer's DOM update has settled.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isProgrammaticScroll = false
    })
  })
}

// Auto-scroll when total size changes (items added/removed or estimates change)
watch(
  () => virtualizer.value.getTotalSize(),
  () => {
    nextTick(() => {
      if (!autoScrollEnabled.value || isUserScrolledUp.value) return
      scrollToBottom()
    })
  }
)

// Auto-scroll when virtual items are remeasured (actual DOM height differs from estimate).
// This is critical for streaming: as text parts grow, the virtualizer remeasures
// the actual rendered height and updates item sizes. Without this watch,
// scroll-to-bottom would "stutter" because the totalSize snapshot at render time
// may be stale by the time the browser paints.
watch(
  () => virtualizer.value.getVirtualItems().map(v => `${v.index}:${v.size}`).join('|'),
  () => {
    if (!autoScrollEnabled.value || isUserScrolledUp.value) return
    scrollToBottom()
  }
)

watch(() => currentChat.value?.id, () => {
  nextTick(() => {
    isUserScrolledUp.value = false
    lastScrollTop = 0
    scrollToBottom()
  })
})

const handleScrollEvent = (event: Event) => {
  // Skip programmatic scrolls triggered by our own scrollToBottom
  if (isProgrammaticScroll) {
    isProgrammaticScroll = false
    return
  }
  if (!event.isTrusted) return
  const el = event.target as HTMLElement
  if (!el) return

  // Use a more reliable detection: check if we're within a small threshold of the bottom
  // The virtualizer's scrollHeight can be imprecise during layout recalculations,
  // so increase the tolerance slightly and compare against the last item's position.
  // Primary check: scrollTop + clientHeight vs scrollHeight
  if (el.scrollTop < lastScrollTop) {
    isUserScrolledUp.value = true
  } else if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
    isUserScrolledUp.value = false
  }
  lastScrollTop = el.scrollTop

  if (!isLoadingMore.value && el.scrollTop <= 50) {
    const chat = currentChat.value
    if (!chat) return
    isLoadingMore.value = true
    const anchorItem = virtualizer.value.getVirtualItems()[0]
    const anchorUid = anchorItem ? flatItems.value[anchorItem.index]?.uid : undefined
    const anchorOffset = anchorItem ? el.scrollTop - anchorItem.start : 0
    loadMoreMessagesBefore(chat.id).finally(() => {
      nextTick(() => {
        const anchorIndex = anchorUid ? flatItems.value.findIndex((item) => item.uid === anchorUid) : -1
        if (anchorIndex >= 0) {
          const offset = virtualizer.value.getOffsetForIndex(anchorIndex, 'start')?.[0]
          if (typeof offset === 'number') {
            virtualizer.value.scrollToOffset(Math.max(0, offset + anchorOffset))
          }
        }
        isLoadingMore.value = false
      })
    })
  }
}

onMounted(() => {
  const el = scrollHostRef.value
  if (el) {
    el.addEventListener('scroll', handleScrollEvent)
  }
})

onUnmounted(() => {
  const el = scrollHostRef.value
  if (el) {
    el.removeEventListener('scroll', handleScrollEvent)
  }
})

const getScrollContainer = () => scrollHostRef.value

defineExpose({
  scrollToBottom,
  isUserScrolledUp: () => isUserScrolledUp.value,
  container: getScrollContainer
})

// 同步到外部 messageScrollRef
onMounted(() => {
  ;(messageScrollRef as any).value = {
    scrollToBottom,
    isUserScrolledUp: () => isUserScrolledUp.value,
    container: getScrollContainer
  }
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
      <div
        :class="{ 'is-centered': display.chatCenteredLayout }"
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%'
        }"
      >
        <div
          v-for="vItem in virtualizer.getVirtualItems()"
          :key="String(vItem.key)"
          :data-index="vItem.index"
          :ref="measureRef"
          :id="`message-${flatItems[vItem.index]?.messageId ?? ''}`"
          class="virtual-item"
          :class="[
            `vi-${flatItems[vItem.index]?.type ?? 'unknown'}`,
            {
              'vi-group-last': flatItems[vItem.index]?.isLastInGroup,
              'vi-is-new': flatItems[vItem.index]?.messageId ? isNewlyEntered(flatItems[vItem.index]!.messageId) : false
            }
          ]"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${vItem.start}px)`
          }"
        >
          <div class="virtual-item-content">
            <!-- context divider -->
            <div v-if="flatItems[vItem.index]?.type === 'context-divider'" class="context-divider">
              <div class="divider-line"></div>
              <span class="divider-text">上下文分割线</span>
              <div class="divider-line"></div>
            </div>

            <!-- user message (single item, unchanged) -->
            <ChatMessageItemHuman
              v-else-if="flatItems[vItem.index]?.type === 'user-message'"
              :message="flatItems[vItem.index]!.msg!"
              @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)"
            />

            <!-- system message (single item, unchanged) -->
            <ChatMessageItemSystem
              v-else-if="flatItems[vItem.index]?.type === 'system-message'"
              :message="flatItems[vItem.index]!.msg!"
              @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)"
            />

            <!-- AI header: avatar + model name + token -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-header'" class="header-inner" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <div class="vi-ai-avatar-area">
                <Image
                  v-if="chatsStore.currentChat?.agentId && agentStore.getAgentById(chatsStore.currentChat!.agentId!)?.avatar"
                  :src="agentStore.getAgentById(chatsStore.currentChat!.agentId!)!.avatar!"
                  class="vi-ai-avatar"
                  alt="avatar"
                />
                <div v-else class="vi-ai-avatar-fallback"><Robot /></div>
              </div>
              <div class="vi-ai-meta">
                <span class="vi-ai-name">{{ flatItems[vItem.index]!.msg?.metadata?.model }}</span>
                <div v-if="flatItems[vItem.index]!.msg?.metadata?.loading || flatItems[vItem.index]!.msg?.metadata?.usage" class="vi-ai-usage">
                  <span v-if="(flatItems[vItem.index]!.msg?.metadata?.usage as any)?.totalTokens != null">
                    Tokens: {{ (flatItems[vItem.index]!.msg?.metadata?.usage as any)?.totalTokens }}
                  </span>
                </div>
              </div>
            </div>

            <!-- RAG search -->
            <ChatMessageItemRagSearch
              v-else-if="flatItems[vItem.index]?.type === 'ai-rag-search'"
              :searching="!flatItems[vItem.index]!.msg?.metadata?.ragSearchDetails?.length && !!flatItems[vItem.index]!.msg?.metadata?.ragEnabled"
              :search-details="flatItems[vItem.index]!.msg?.metadata?.ragSearchDetails"
              @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)"
            />

            <!-- loading dots -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-loading'" class="vi-loading" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <div class="loading-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>

            <!-- retry status -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-retry'" class="retry-container" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <span class="retry-text">{{ getRetryText(flatItems[vItem.index]!.msg!) }}</span>
            </div>

            <!-- error -->
            <ChatMessageItemError
              v-else-if="flatItems[vItem.index]?.type === 'ai-error'"
              :error="flatItems[vItem.index]!.msg?.metadata?.error! as Error"
              @retry="handleErrorRetry(flatItems[vItem.index]!.msg?.id!)"
              @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)"
            />

            <!-- collapsed toggle -->
            <button v-else-if="flatItems[vItem.index]?.type === 'ai-collapsed-toggle'" class="previous-content-toggle" :class="{ 'is-expanded': expandedCollapsedIds.has(flatItems[vItem.index]!.messageId) }" type="button" @click="toggleCollapsed(flatItems[vItem.index]!.messageId)" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <ChevronDown />
              <span>{{ expandedCollapsedIds.has(flatItems[vItem.index]!.messageId) ? '收起前文' : `已折叠前文 ${flatItems[vItem.index]?.hiddenCount ?? 0} 项` }}</span>
            </button>

            <!-- text part -->
              <div v-else-if="flatItems[vItem.index]?.type === 'ai-part-text'" class="vi-part" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <div class="text-block" :style="contentStyle">
                <Markdown
                  v-if="flatItems[vItem.index]!.part?.type === 'text'"
                  :block="flatItems[vItem.index]!.part as TextUIPart"
                  :message="flatItems[vItem.index]!.msg!"
                  :streaming="false"
                  :disable-translation="true"
                />
              </div>
            </div>

            <!-- reasoning part -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-part-reasoning'" class="vi-part">
              <ChatMessageItemReasoning_content
                :reasoning_content="(flatItems[vItem.index]!.part as TextUIPart)?.text ?? ''"
                :streaming="false"
                :is-last-reasoning="flatItems[vItem.index]?.isLastReasoningPart ?? false"
              />
            </div>

            <!-- dynamic-tool part -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-part-dynamic-tool'" class="vi-part">
              <ChatMessageItemDynamicTool
                :message="flatItems[vItem.index]!.msg!"
                :tool_part="flatItems[vItem.index]!.part as any"
              />
            </div>

            <!-- tool part -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-part-tool'" class="vi-part" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <ChatMessageItemTool
                :message="flatItems[vItem.index]!.msg!"
                :tool_part="flatItems[vItem.index]!.part as ToolUIPart"
              />
            </div>

            <!-- file part -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-part-file'" class="vi-part" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <FileUpload :removable="false" :files="[flatItems[vItem.index]!.part as any]" />
            </div>

            <!-- waveform -->
            <LiveWaveform v-else-if="flatItems[vItem.index]?.type === 'ai-waveform'" :active="true" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)" />

            <!-- actions -->
            <div v-else-if="flatItems[vItem.index]?.type === 'ai-actions'" class="msg-actions" @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)">
              <Button v-if="hasAudioChunks(flatItems[vItem.index]!.msg!)" size="sm" variant="icon" type="button">
                <template #icon><VolumeMedium /></template>
              </Button>
              <Button v-if="(flatItems[vItem.index]!.msg?.metadata?.loading || flatItems[vItem.index]!.msg?.metadata?.retrying) && !flatItems[vItem.index]!.msg?.metadata?.error && flatItems[vItem.index]!.msg?.metadata?.stop" size="sm" variant="icon" type="button" @click="flatItems[vItem.index]!.msg?.metadata?.stop">
                <template #icon><Stop style="color: red" /></template>
              </Button>
              <div v-if="getActivityText(flatItems[vItem.index]!.msg!)" class="message-activity-status">
                {{ getActivityText(flatItems[vItem.index]!.msg!) }}
              </div>
            </div>

            <!-- translation -->
            <MessageTranslation
              v-else-if="flatItems[vItem.index]?.type === 'ai-translation'"
              :translations="flatItems[vItem.index]!.msg?.metadata?.translations"
              :translationLoading="flatItems[vItem.index]!.msg?.metadata?.translationLoading"
              :translationController="flatItems[vItem.index]!.msg?.metadata?.translationController"
              @stopTranslation="() => flatItems[vItem.index]!.msg?.metadata?.translationController?.()"
              @contextmenu="onMessageRightClick($event, flatItems[vItem.index]!.msg!)"
            />
          </div>
          </div>
        </div>
      </div>

    <ChatMessageNav :container="messageScrollRef" :virtualizer="virtualizer" :total-count="flatItems.length" />

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

.message-scroll-host {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: none;
  overflow-anchor: none;
  scroll-snap-type: none;
}

.is-centered {
  max-width: 800px;
  margin: 0 auto;
}

/* —— Virtual item base —— */
.virtual-item {
  transition: background-color 0.5s ease;
}

/* Group spacing */
.vi-group-last {
  padding-bottom: 8px;
}

/* Highlight for scrollToMessage */
.virtual-item.highlight-jump {
  background-color: rgba(var(--accent-rgb), 0.15);
  border-radius: 8px;
}

/* Entry animation */
.virtual-item.vi-is-new .virtual-item-content {
  will-change: opacity, transform;
  animation: message-rise-in 0.32s var(--motion-ease-decelerated);
}

@keyframes message-rise-in {
  from { opacity: 0; transform: translateY(18px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* —— Context divider —— */
.context-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  padding: 0 20px;
}
.divider-line { flex: 1; height: 1px; background: var(--border-color); opacity: 0.5; }
.divider-text { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; font-weight: 500; }

/* —— AI header —— */
.vi-ai-header {
  /* dynamic class on virtual-item – no layout, only for identification */
}
.header-inner {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 40px;
}
.vi-ai-avatar-area { display: flex; align-items: center; padding-top: 2px; }
.vi-ai-avatar { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; background-color: var(--border-color-medium); }
.vi-ai-avatar-fallback { width: 32px; height: 32px; border-radius: 6px; background: var(--bg-hover); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; }
.vi-ai-meta { display: flex; flex-direction: column; gap: 1px; }
.vi-ai-name { font-weight: 600; font-size: 13px; color: var(--text-primary); }
.vi-ai-usage { font-size: 10px; color: var(--text-tertiary); line-height: 1; }

/* —— Loading dots —— */
.vi-loading { padding: 8px 0px; }
.loading-dots { display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background-color: var(--accent-color); animation: pulse 1.4s ease-in-out infinite; }
.dot:nth-child(1) { animation-delay: 0s; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes pulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* —— Retry —— */
.retry-container {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin: 4px 0px;
  background-color: var(--bg-error, rgba(254, 242, 242, 0.9));
  border: 1px solid var(--border-error, rgba(252, 165, 165, 0.6)); border-radius: 6px;
  font-size: 12px; color: var(--color-danger);
}
.retry-text { flex: 1; line-height: 1.4; }
.dark-mode .retry-container {
  background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.15);
  border-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
}

/* —— Collapsed toggle —— */
.previous-content-toggle {
  align-self: stretch; display: flex; align-items: center; gap: 4px; width: calc(100% - 40px);
  margin: 1px 0px 4px; padding: 2px 6px; border: none; border-radius: 4px;
  background: transparent; color: var(--text-tertiary); font-size: 11px; line-height: 1.4; cursor: pointer;
}
.previous-content-toggle:hover { background: var(--bg-hover); color: var(--text-secondary); }
.previous-content-toggle svg { width: 11px; height: 11px; transform: rotate(-90deg); transition: transform 0.2s ease; }

/* —— Parts —— */
.vi-part {
  padding: 4px 0px;
}
.text-block {
  font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  max-width: 100%; min-width: 0;
}

/* —— Actions —— */
.msg-actions {
  align-self: stretch; display: flex; align-items: center; gap: 8px; padding: 4px 0px; min-height: 36px;
}
.message-activity-status { margin-left: auto; color: var(--text-tertiary); font-size: 11px; line-height: 1.4; white-space: nowrap; }

/* —— Mobile copy preview —— */
.mobile-copy-preview-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex;
  align-items: flex-end; justify-content: center;
  padding: 12px 12px max(12px, var(--safe-area-bottom, 0px)) 12px;
}
.mobile-copy-preview-card {
  width: 100%; max-width: 620px; max-height: calc(var(--vh, 100vh) - 24px);
  background: var(--bg-card); border-radius: 16px; border: 1px solid var(--border-color);
  padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow: hidden;
}
.mobile-copy-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mobile-copy-preview-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.mobile-copy-selected-text {
  font-size: 12px; color: var(--text-secondary); background: var(--bg-hover); border-radius: 8px;
  padding: 8px; white-space: pre-wrap; word-break: break-word;
}

@media (max-width: 767px) {
  .message-list-wrapper { touch-action: pan-y; }
}
</style>
