interface MessageScrollContainerInstance {
  scrollToBottom: () => void
  isUserScrolledUp: () => boolean
}

const messageScrollRef = ref<MessageScrollContainerInstance>()

export const useMessageScroll = () => {
  /**
   * 滚动到指定消息并高亮
   * @param messageId 消息 ID
   * @param retryCount 重试次数，用于处理刚切换聊天时消息还未渲染的情况
   */
  const scrollToMessage = (messageId: string, retryCount = 0) => {
    nextTick(() => {
      const el = document.getElementById(`message-${messageId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // 增加高亮效果提示用户
        el.classList.add('highlight-jump')
        setTimeout(() => el.classList.remove('highlight-jump'), 2000)
      } else if (retryCount < 10) {
        // 如果没找到元素，尝试延迟重试（每 100ms 一次，最多 1s）
        setTimeout(() => scrollToMessage(messageId, retryCount + 1), 100)
      }
    })
  }

  /**
   * 滚动到底部
   * @param delay 延迟时间（毫秒），默认为 1ms
   */
  const scrollToBottom = () => {
    setTimeout(() => {
      messageScrollRef.value?.scrollToBottom()
    }, 3)
  }

  return {
    messageScrollRef,
    scrollToMessage,
    scrollToBottom
  }
}

