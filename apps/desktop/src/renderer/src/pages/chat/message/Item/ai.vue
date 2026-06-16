<script setup lang="ts">
import { computed } from 'vue'
import { getFlatTokenUsage } from '@renderer/services/chatService/tokenUsage'
import { getCollapsedMessageParts, getRenderableMessageParts } from './messageParts'
import { getRetryStopHandler } from '@renderer/composables/useChat'

const props = defineProps<{
  message: BaseMessage
}>()
const settingsStore = useSettingsStore()
const chatsStore = useChatsStores()
const agentStore = useAgentStore()
const speechStore = useSpeechStore()
const { Stop, VolumeMedium, Robot, ChevronDown } = useIcon([
  'Stop',
  'VolumeMedium',
  'Robot',
  'ChevronDown'
])
const isPreviousContentExpanded = ref(false)

const currentAgentAvatar = computed(() => {
  const currentAgentId = chatsStore.currentChat?.agentId
  if (!currentAgentId) return ''
  return agentStore.getAgentById(currentAgentId)?.avatar || ''
})

const hasAudioChunks = computed(() => {
  return (props.message.metadata?.audio?.chunks?.length ?? 0) > 0
})

const flatUsage = computed(() => getFlatTokenUsage(props.message.metadata?.usage))

const renderableParts = computed(() => {
  return getRenderableMessageParts(props.message.parts)
})

const displayedCollapsedParts = computed(() => {
  return getCollapsedMessageParts(props.message.parts)
})

const canCollapsePreviousContent = computed(() => {
  return (
    settingsStore.display.collapsePreviousContent &&
    displayedCollapsedParts.value.length > 0 &&
    renderableParts.value.length > displayedCollapsedParts.value.length
  )
})

const hiddenPartCount = computed(() => {
  return canCollapsePreviousContent.value
    ? renderableParts.value.length - displayedCollapsedParts.value.length
    : 0
})

const displayedParts = computed(() => {
  if (!canCollapsePreviousContent.value || isPreviousContentExpanded.value) {
    return props.message.parts
  }

  return displayedCollapsedParts.value
})

const collapsedContentText = computed(() =>
  isPreviousContentExpanded.value ? '收起前文' : `已折叠前文 ${hiddenPartCount.value} 项`
)

const getToolName = (part: BaseMessage['parts'][number]) => {
  const toolPart = part as { toolName?: string; title?: string; type?: string }
  if (toolPart.toolName) return toolPart.toolName
  if (toolPart.title) return toolPart.title
  return toolPart.type?.replace(/^tool-/, '') || '未知工具'
}

const getToolActivityText = (part: BaseMessage['parts'][number]) => {
  const state = (part as { state?: string }).state
  const toolName = getToolName(part)

  if (state === 'approval-requested') return `等待确认工具 ${toolName}`
  if (state === 'output-error') return `工具 ${toolName} 调用失败`
  if (state === 'output-denied') return `工具 ${toolName} 已拒绝`
  if (state === 'output-available')
    return props.message.metadata?.loading ? `工具 ${toolName} 已完成` : ''

  return `调用工具 ${toolName} 中`
}

const activityStatus = computed(() => {
  if (!props.message.metadata?.loading) return ''

  const currentPart = renderableParts.value[renderableParts.value.length - 1]
  if (!currentPart) return '正在准备中'

  if (currentPart.type === 'reasoning') return '正在思考中'
  if (currentPart.type === 'dynamic-tool' || currentPart.type.startsWith('tool-')) {
    return getToolActivityText(currentPart)
  }
  if (currentPart.type === 'text') return '正在回复中'

  return '正在处理中'
})

// 流式输出中：已开始输出文本（有文本 part 且仍在 loading），用于显示尾部闪烁光标
const isStreamingText = computed(() => {
  if (!props.message.metadata?.loading) return false
  const hasText = renderableParts.value.some((p) => p.type === 'text')
  return hasText
})

// —— 自动重试等待态：展示倒计时 ——
const isRetrying = computed(() => props.message.metadata?.retrying === true)
const retryAttempt = computed(() => props.message.metadata?.retryAttempt ?? 0)
const stopRetryHandler = computed(() => {
  const chatId = chatsStore.currentChat?.id
  if (!chatId) return undefined
  return getRetryStopHandler(chatId, props.message.id)
})

// 每 200ms 更新一次「现在」，用于计算倒计时文案
const now = ref(Date.now())
let countdownTimer: ReturnType<typeof setInterval> | null = null
watch(
  isRetrying,
  (retrying) => {
    if (retrying && !countdownTimer) {
      countdownTimer = setInterval(() => {
        now.value = Date.now()
      }, 200)
    } else if (!retrying && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  },
  { immediate: true }
)
onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

const retryCountdownSeconds = computed(() => {
  const endsAt = props.message.metadata?.retryCountdownEndsAt
  if (!endsAt) return 0
  return Math.max(0, (endsAt - now.value) / 1000)
})

const retryStatusText = computed(() => {
  const attempt = retryAttempt.value
  const secs = retryCountdownSeconds.value
  const attemptText = attempt > 0 ? `第 ${attempt} 次` : ''
  if (secs > 0) {
    return `请求失败，${attemptText}重试中，${Math.ceil(secs)} 秒后重试...`
  }
  return `请求失败，正在${attemptText}重试...`
})

const togglePreviousContent = () => {
  isPreviousContentExpanded.value = !isPreviousContentExpanded.value
}

watch(
  () => props.message.id,
  () => {
    isPreviousContentExpanded.value = false
  }
)

const isCurrentPlaying = computed(() => {
  return (
    speechStore.isPlaying &&
    speechStore.queue.some((chunk) => chunk.messageId === props.message.id && !chunk.played)
  )
})

const playMessageAudio = () => {
  if (isCurrentPlaying.value) {
    speechStore.stop()
    return
  }

  const currentChatMessages = chatsStore.currentChat?.messages || []
  const queueChunks = currentChatMessages.flatMap((message) => {
    const audioChunks = message.metadata?.audio?.chunks?.filter((chunk) => chunk.data) || []

    return audioChunks.map((chunk, chunkIndex) => ({
      id: `${message.id}-audio-${chunkIndex}`,
      messageId: message.id,
      text: chunk.text,
      audioData: chunk.data,
      duration: chunk.duration,
      error: chunk.error,
      played: false,
      loading: false
    }))
  })

  if (queueChunks.length === 0) {
    return
  }

  const targetChunk = queueChunks.find((chunk) => chunk.messageId === props.message.id)
  speechStore.replaceQueue(queueChunks, targetChunk?.id)
  settingsStore.display.assistantSidebarTab = 'playlist'

  if (settingsStore.display.speechSidebarCollapsed) {
    settingsStore.display.speechSidebarCollapsed = false
  }
}
</script>

<template>
  <div class="msg-row them has-avatar">
    <div class="msg-content">
      <div class="msg-meta">
        <div class="msg-avatar-area">
          <Image
            v-if="currentAgentAvatar"
            :src="currentAgentAvatar"
            class="msg-avatar"
            alt="avatar"
          />
          <div v-else class="msg-avatar-fallback">
            <Robot />
          </div>
        </div>

        <div class="msg-meta-content">
          <span class="msg-name">{{ message.metadata?.model }}</span>

          <div
            v-if="flatUsage.totalTokens || flatUsage.inputTokens || flatUsage.outputTokens"
            class="msg-usage"
          >
            <span v-if="flatUsage.inputTokens || flatUsage.outputTokens"
              >Tokens: {{ flatUsage.totalTokens }}</span
            >
            <span v-if="flatUsage.inputTokens">↑{{ flatUsage.inputTokens }}</span>
            <span v-if="flatUsage.outputTokens">↓{{ flatUsage.outputTokens }}</span>
          </div>
        </div>
      </div>
      <ChatMessageItemRagSearch
        :searching="!message.metadata?.ragSearchDetails?.length && !!message.metadata?.ragEnabled"
        :search-details="message.metadata?.ragSearchDetails"
      />
      <div
        v-if="
          !message.metadata?.error &&
          message.metadata?.loading &&
          message.parts.findIndex((e) => e.type === 'step-start') === -1
        "
        class="loading-container"
        :class="{ 'is-mobile': isMobile }"
      >
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
      <div v-if="isRetrying" class="retry-container">
        <span class="retry-text">{{ retryStatusText }}</span>
        <Button
          v-if="stopRetryHandler"
          size="sm"
          variant="icon"
          type="button"
          class="retry-stop-btn"
          title="停止自动重试"
          @click="stopRetryHandler()"
        >
          <template #icon>
            <Stop style="color: red" />
          </template>
        </Button>
      </div>
      <button
        v-if="canCollapsePreviousContent"
        class="previous-content-toggle"
        :class="{ 'is-expanded': isPreviousContentExpanded }"
        type="button"
        @click="togglePreviousContent"
      >
        <ChevronDown />
        <span>{{ collapsedContentText }}</span>
      </button>
      <ChatMessageItemContent
        markdown
        :message="message"
        :parts="displayedParts"
        :streaming="isStreamingText"
      />

      <div
        v-if="
          activityStatus ||
          hasAudioChunks ||
          (message.metadata?.loading && !message.metadata?.error && message.metadata.stop)
        "
        class="msg-actions"
      >
        <Button
          v-if="hasAudioChunks"
          size="sm"
          @click="playMessageAudio"
          variant="icon"
          type="button"
          :class="{ 'is-active': isCurrentPlaying }"
        >
          <template #icon>
            <VolumeMedium
              :style="{ color: isCurrentPlaying ? 'var(--accent-color)' : 'inherit' }"
            />
          </template>
        </Button>
        <Button
          v-if="message.metadata?.loading && !message.metadata?.error && message.metadata.stop"
          size="sm"
          @click="message.metadata?.stop"
          variant="icon"
          type="button"
        >
          <template #icon>
            <Stop style="color: red" />
          </template>
        </Button>
        <div v-if="activityStatus" class="message-activity-status">
          {{ activityStatus }}
        </div>
      </div>

      <MessageTranslation
        v-if="message.metadata?.translations || message.metadata?.translationLoading"
        :translations="message.metadata.translations"
        :translationLoading="message.metadata.translationLoading"
        :translationController="message.metadata.translationController"
        @stopTranslation="() => message.metadata?.translationController?.()"
      />
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  padding: 8px 20px;
  display: flex;
  gap: 16px;
  position: relative;
  transition: background-color 0.2s;
  border-bottom: 1px solid transparent;
}

.msg-row:hover {
  /* background-color: var(--bg-tertiary-hover); */
}

.msg-avatar-area {
  padding-top: 2px;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--border-color-medium);
  object-fit: cover;
}

.msg-avatar-fallback {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.msg-meta {
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.msg-meta-content {
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  min-height: 32px;
  align-items: flex-start;
}

.msg-usage {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 1px;
  line-height: 1;
}

.msg-usage span {
  display: flex;
  align-items: center;
}

.msg-meta {
  flex-direction: row;
  gap: 8px;
}

.msg-actions {
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.previous-content-toggle {
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  margin: 1px 0 4px;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.previous-content-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.previous-content-toggle svg {
  width: 11px;
  height: 11px;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}

.previous-content-toggle.is-expanded svg {
  transform: rotate(0deg);
}

.message-activity-status {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.msg-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.msg-time {
  font-size: 11px;
  color: var(--text-sub);
}

/* Loading indicator styles */
.loading-container {
  padding: 8px 0;
}

.loading-container.is-mobile {
  padding-top: 14px;
}

/* 自动重试提示 */
.retry-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 4px 0;
  background-color: var(--bg-error, rgba(254, 242, 242, 0.9));
  border: 1px solid var(--border-error, rgba(252, 165, 165, 0.6));
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-danger);
}

.retry-text {
  flex: 1;
  line-height: 1.4;
}

.retry-stop-btn {
  flex-shrink: 0;
}

.dark-mode .retry-container {
  background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.15);
  border-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
}

.loading-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--accent-color);
  animation: pulse 1.4s ease-in-out infinite;
}

.dot:nth-child(1) {
  animation-delay: 0s;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

/* 思考态脉冲：保留原有节奏，本地定义（带 scale 位移，与全局 fade 不同） */
@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.speech-control-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.speech-queue-popup {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  max-height: 400px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: motion-rise-in var(--motion-duration-normal) var(--motion-ease-decelerated);
}

.queue-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.queue-list {
  overflow-y: auto;
  padding: 4px 0;
}

.queue-item {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--border-color-light);
  transition: background-color 0.2s;
}

.queue-item:last-child {
  border-bottom: none;
}

.queue-item.is-played {
  opacity: 0.5;
}

.queue-item.is-playing {
  background: rgba(var(--accent-rgb), 0.1);
  border-left: 3px solid var(--accent-color);
}

.queue-item.is-loading {
  font-style: italic;
}

.queue-item-text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.queue-item-status {
  font-size: 11px;
  color: var(--accent-color);
  font-weight: 500;
}
</style>
