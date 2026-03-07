<script setup lang="tsx">
import { FileUIPart, TextUIPart } from 'ai'
import { useContinuousVoiceRecorder } from '@renderer/composables/useContinuousVoiceRecorder'
import { useShortcuts } from '@renderer/composables/useShortcuts'

import { usePlugins } from '@renderer/composables/usePlugins'
import { createRegistry } from '@renderer/services/chatService/registry'
import { z } from 'zod'

const message = ref('')
const chatStore = useChatsStores()
const { triggerHook } = usePlugins()
const selectedFiles = ref<Array<UploadFile>>([])

const {
  thinkingMode,
  speechEnabled,
  providerOptions: allProviderOptions,
  display,
  defaultModels
} = storeToRefs(useSettingsStore())
const agentStore = useAgentStore()
const { updateThinkingMode, updateSpeechEnabled, updateProviderOptions } = useSettingsStore()
const settingsStore = useSettingsStore()
const currentChatAgent = computed(() => {
  const agentId = chatStore.currentChat?.agentId
  return agentId ? agentStore.getAgentById(agentId) : null
})
const chatProviderId = computed({
  get: () => chatStore.currentChat?.providerId || '',
  set: (value: string) => {
    if (!value) return
    let chatId = chatStore.currentChat?.id
    if (!chatId) {
      chatId = chatStore.createChat()
    }
    const chat = chatStore.getChatById(chatId)
    const provider = settingsStore.getProviderById(value)
    const currentModelId = chat?.modelId
    const modelExists = !!provider?.models?.some((m) => m.id === currentModelId)
    const fallbackModelId =
      provider?.models?.find((m) => m.active && m.category === 'text')?.id ||
      provider?.models?.[0]?.id ||
      ''
    const modelId = modelExists ? currentModelId! : fallbackModelId
    if (!modelId) return
    chatStore.setChatModel(chatId, value, modelId)
  }
})
const chatModelId = computed({
  get: () => chatStore.currentChat?.modelId || '',
  set: (value: string) => {
    if (!value) return
    let chatId = chatStore.currentChat?.id
    if (!chatId) {
      chatId = chatStore.createChat()
    }
    let providerId = chatStore.currentChat?.providerId
    if (!providerId || !settingsStore.getProviderById(providerId)?.models?.some((m) => m.id === value)) {
      const provider = settingsStore.getAllProviders.find((p) => p.models?.some((m) => m.id === value))
      providerId = provider?.id
    }
    if (!providerId) return
    chatStore.setChatModel(chatId, providerId, value)
  }
})
const currentChatProvider = computed(() => {
  return chatProviderId.value ? settingsStore.getProviderById(chatProviderId.value) : null
})
const currentChatModel = computed(() => {
  if (!chatProviderId.value || !chatModelId.value) return null
  return settingsStore.getModelById(chatProviderId.value, chatModelId.value).model
})

const speechStore = useSpeechStore()
const modal = useModal()

// 提供商参数设置
const openProviderOptionsModal = () => {
  const schema = (() => {
    try {
      const registry = createRegistry({
        apiKey: currentChatProvider.value?.apiKey || '',
        baseURL: currentChatProvider.value?.baseUrl || '',
        name: chatProviderId.value
      })
      const provider = registry.getProvider(currentChatProvider.value?.providerType || '')
      return provider?.chatCallOptionsSchema
    } catch (e) {
      console.warn('Failed to get chat options schema:', e)
      return null
    }
  })()

  if (!schema) {
    modal.confirm({
      title: '参数设置',
      content: '当前提供商不支持参数配置',
      showCancel: false,
      confirmText: '确定'
    })
    return
  }

  const [FormComponent, formActions] = useForm<Record<string, any>>({
    schemas: schema as z.ZodObject<any>,
    initialData: allProviderOptions.value[chatProviderId.value] || {},
    size: 'sm',
    onSubmit: (data) => {
      if (chatProviderId.value) {
        updateProviderOptions(chatProviderId.value, data)
      }
      modal.remove()
    }
  })

  modal.confirm({
    title: '参数设置',
    width: '50%',
    content: FormComponent,
    confirmText: '应用',
    cancelText: '取消',
    onOk: () => {
      formActions.submit()
    }
  })
}

// 图标
const FileUploadIcon = useIcon('UploadOutlined')
const Bulb = useIcon('Bulb')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')
const VolumeIcon = useIcon('VolumeMedium')
const VolumeMuteIcon = useIcon('VolumeMute')
const CloseIcon = useIcon('Close')
const PendingIcon = useIcon('FormatListBulleted')
const SettingsIcon = useIcon('Settings')
const PlaylistIcon = useIcon('Menu')
const StopIcon = useIcon('Stop')
const ChevronDown = useIcon('ChevronDown')

// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const inputContainerRef = useTemplateRef('inputContainerRef')
const textareaRef = useTemplateRef('textareaRef')

// 当前聊天的预发送消息列表
const pendingMessages = computed(() => {
  if (!chatStore.currentChat) return []
  return chatStore.getPendingMessages(chatStore.currentChat.id)
})

// 检查是否正在生成回复
const isGenerating = computed(() => {
  if (!chatStore.currentChat) return false
  return chatStore.isChatGenerating(chatStore.currentChat.id)
})

const isScopeGenerating = computed(() => {
  if (!chatStore.currentChat) return false
  return chatStore.isChatScopeGenerating(chatStore.currentChat.id)
})

// 处理文件选择
const handleFilesSelected = (files: Array<UploadFile>) => {
  selectedFiles.value.push(...files)
}

// 处理文件移除
const handleFileRemoved = (index: number) => {
  selectedFiles.value.splice(index, 1)
}

// 移除预发送消息
const removePendingMessage = (messageId: string) => {
  if (!chatStore.currentChat) return
  chatStore.removePendingMessage(chatStore.currentChat.id, messageId)
}

const stopAllGeneratingInCurrentChat = () => {
  const chatId = chatStore.currentChat?.id
  if (!chatId) return
  chatStore.stopGeneratingInChatScope(chatId)
}

// 获取预发送消息的文本预览
const getPendingMessagePreview = (parts: Array<FileUIPart | TextUIPart>): string => {
  const textParts = parts.filter((p): p is TextUIPart => p.type === 'text')
  const fileParts = parts.filter((p): p is FileUIPart => p.type === 'file')

  let preview = textParts.map(p => p.text).join(' ')
  if (fileParts.length > 0) {
    const fileText = fileParts.length === 1 ? '[文件]' : `[${fileParts.length}个文件]`
    preview = preview ? `${preview} ${fileText}` : fileText
  }

  // 截断显示
  if (preview.length > 50) {
    preview = preview.substring(0, 50) + '...'
  }
  return preview || '[空消息]'
}

// 语音录制
const isRecording = ref(false)
const isListening = ref(false)
const isProcessingVoice = ref(false)

const partialSpeechText = ref('')
const showMobileTools = ref(false)

const { start: startVoice, stop: stopVoice, state: voiceState, isActive: voiceIsActive } = useContinuousVoiceRecorder({
  volumeThreshold: 0.02,
  silenceDuration: 800,
  onData: (data: Float32Array) => {
    if (!(window as any)._audioSampleRate) {
      (window as any)._audioSampleRate = new (window.AudioContext || (window as any).webkitAudioContext)().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    triggerHook('speech.stream.data', { data, sampleRate })
  },
  onStart: async () => {
    if (!(window as any)._audioSampleRate) {
      (window as any)._audioSampleRate = new (window.AudioContext || (window as any).webkitAudioContext)().sampleRate
    }
    const sampleRate = (window as any)._audioSampleRate
    await triggerHook('speech.stream.start', {
      sampleRate,
      providerId: defaultModels.value.speechProviderId || chatProviderId.value,
      onResult: (text: string) => {
        if (text) {
          message.value += (message.value ? ' ' : '') + text
          partialSpeechText.value = ''
          _sendMessage()
        }
      },
      onPartial: (text: string) => {
        partialSpeechText.value = text
      }
    })
  },
  onStop: async () => {
    try {
      await triggerHook('speech.stream.stop')
    } catch (error) {
      console.error('语音识别停止失败:', error)
    } finally {
      partialSpeechText.value = ''
    }
  }
})

// 监听语音状态变化
watch(voiceState, (newState) => {
  isListening.value = newState === 'listening'
  isRecording.value = newState === 'recording'
})

// 切换语音录制
const toggleVoiceRecording = async () => {
  if (voiceIsActive.value) {
    stopVoice()
  } else {
    if (!defaultModels.value.speechModelId) {
      messageApi.error('请先在设置中选择默认语音转文字模型')
      return
    }
    await startVoice()
  }
}

const toggleSpeech = () => {
  const newState = !speechEnabled.value

  if (newState) {
    if (!defaultModels.value.ttsModelId) {
      messageApi.error('请先在设置中选择默认文字转语音模型')
      return
    }

    const voice = currentChatAgent.value?.speechVoice
    if (!voice) {
      messageApi.error('请先在智能体设置或默认设置中选择语音音色')
      return
    }
  }

  updateSpeechEnabled(newState)
  if (!newState) {
    speechStore.stop()
    speechStore.clearQueue()
  }
}

const adjustTextareaHeight = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

const isComposing = ref(false)

const desktopPlaceholder = computed(() => {
  if (isProcessingVoice.value) return '正在处理语音...'
  if (currentChatModel.value?.name && currentChatProvider.value?.name) {
    return `${currentChatAgent.value?.name || '未绑定智能体'} · ${currentChatProvider.value.name} · ${currentChatModel.value.name}`
  }
  return '请选择模型'
})

const mobilePlaceholder = computed(() => {
  if (isProcessingVoice.value) return '正在处理语音...'
  if (currentChatModel.value?.name) return `${currentChatAgent.value?.name || '对话'} · ${currentChatModel.value.name}`
  return '发消息或按住说话...'
})

const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

const handleEnterKey = () => {
  if (isComposing.value) {
    return
  }
  _sendMessage()
}

const _sendMessage = async () => {
  if (!currentChatModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const input = message.value.trim()
  const hasContent = input || selectedFiles.value.length > 0

  if (!hasContent) return

  // 构建消息parts
  const parts: Array<FileUIPart | TextUIPart> = []

  if (input) {
    parts.push({ type: 'text', text: input })
  }

  for (const file of selectedFiles.value) {
    const { path, name, url, ...aiPart } = file

    const res = await fetch(path ?? url!)
    const buffer = new Uint8Array(await res.arrayBuffer())

    // 通过文件扩展名判断是否为文本文件
    if (isTextFile(name!)) {
      const text = new TextDecoder('utf-8').decode(buffer)
      parts.push({ type: 'text', text })
    }

    parts.push({
      ...aiPart,
      url: path ?? url
    } as FileUIPart)
  }

  // 清空输入
  message.value = ''
  selectedFiles.value = []
  nextTick(() => {
    adjustTextareaHeight({ target: textareaRef.value } as any)
  })

  // 确保有聊天会话
  if (chatStore.chats.length === 0) {
    chatStore.createChat()
  }

  const chatId = chatStore.currentChat!.id!
  const { sendMessages } = useChat(chatId)

  // 检查是否正在生成回复
  if (chatStore.isChatGenerating(chatId)) {
    // 添加到预发送队列
    chatStore.addPendingMessage(chatId, parts)
  } else {
    // 直接发送
    sendMessages(parts)
  }
}

// 注册聚焦输入框快捷键
const { register, unregister } = useShortcuts()
onMounted(() => {
  register({
    id: 'global.focusInput',
    handler: () => {
      textareaRef.value?.focus()
    }
  })
})
onUnmounted(() => {
  unregister('global.focusInput')
})
</script>

<template>
  <footer class="footer" :class="{ 'is-centered': display.chatCenteredLayout, 'is-mobile': isMobile }">
    <!-- 预发送消息列表 -->
    <div v-if="pendingMessages.length > 0" class="pending-messages-container">
      <div class="pending-messages-header">
        <PendingIcon class="pending-icon" />
        <span class="pending-title">预发送队列 ({{ pendingMessages.length }})</span>
        <span v-if="isGenerating" class="pending-status">等待AI回复中...</span>
      </div>
      <div class="pending-messages-list">
        <div v-for="item in pendingMessages" :key="item.id" class="pending-message-item">
          <span class="pending-message-text">{{ getPendingMessagePreview(item.parts) }}</span>
          <Button variant="icon" size="sm" class="remove-btn" @click="removePendingMessage(item.id)">
            <CloseIcon />
          </Button>
        </div>
      </div>
    </div>

    <div class="input-container" ref="inputContainerRef"
      :class="{ 'drag-over': fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone }">
      <FileUpload ref="fileUploadRef" :files="selectedFiles" :dropZoneRef="inputContainerRef!" :inputRef="textareaRef!"
        @files-selected="handleFilesSelected" @remove="handleFileRemoved" />

      <div v-if="!isMobile">
        <div class="input-wrapper">
          <textarea ref="textareaRef" class="input-field" rows="1"
            :placeholder="desktopPlaceholder"
            v-model="message" @input="adjustTextareaHeight" @keydown.enter.exact.prevent="handleEnterKey"
            @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
            :disabled="isProcessingVoice"></textarea>
          <div v-if="partialSpeechText" class="partial-text">{{ partialSpeechText }}</div>
        </div>

        <div class="input-actions">
          <div class="action-left">
            <Button variant="icon" size="sm" @click="fileUploadRef?.triggerUpload!">
              <FileUploadIcon />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
              @click="updateThinkingMode(!thinkingMode)" title="思考模式">
              <Bulb />
            </Button>

            <Button variant="icon" size="sm" title="参数设置" @click="openProviderOptionsModal">
              <SettingsIcon />
            </Button>

            <Button variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }" @click="toggleVoiceRecording"
              :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'">
              <MicIcon v-if="!voiceIsActive" />
              <MicOffIcon v-else />
            </Button>

            <Button variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }" @click="toggleSpeech"
              :title="speechEnabled ? '关闭语音播报' : '开启语音播报'">
              <VolumeIcon v-if="speechEnabled" />
              <VolumeMuteIcon v-else />
            </Button>

            <Button variant="icon" size="sm" :class="{ 'speech-active': !display.speechSidebarCollapsed }"
              @click="() => { display.speechSidebarCollapsed = !display.speechSidebarCollapsed }"
              :title="display.speechSidebarCollapsed ? '打开播放列表' : '关闭播放列表'">
              <PlaylistIcon />
            </Button>

            <Button
              v-if="isScopeGenerating"
              variant="icon"
              size="sm"
              class="stop-all-btn"
              title="停止当前聊天内全部生成"
              @click="stopAllGeneratingInCurrentChat"
            >
              <StopIcon />
            </Button>

            <ChatAgentSelector type="icon" />
            <ModelSelector type="icon" v-model:model-id="chatModelId" v-model:provider-id="chatProviderId" />
          </div>
          <div class="action-right">
            <Button variant="primary" size="md" @click="_sendMessage">
              {{ isGenerating && pendingMessages.length > 0 ? '加入队列' : '发送' }}
            </Button>
          </div>
        </div>
      </div>

      <div v-else>
        <div class="mobile-input-bar">
          <Button variant="icon" size="sm" @click="fileUploadRef?.triggerUpload!">
            <FileUploadIcon />
          </Button>
          <div class="mobile-input-wrapper">
            <textarea ref="textareaRef" class="input-field mobile-input-field" rows="1"
              :placeholder="mobilePlaceholder"
              v-model="message" @input="adjustTextareaHeight" @keydown.enter.exact.prevent="handleEnterKey"
              @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
              :disabled="isProcessingVoice"></textarea>
            <div v-if="partialSpeechText" class="partial-text mobile-partial-text">{{ partialSpeechText }}</div>
          </div>
          <Button variant="icon" size="sm" :class="{ 'voice-active': voiceIsActive }" @click="toggleVoiceRecording"
            :title="voiceIsActive ? (isRecording ? '正在录制' : '正在监听') : '语音输入'">
            <MicIcon v-if="!voiceIsActive" />
            <MicOffIcon v-else />
          </Button>
          <Button variant="icon" size="sm" @click="showMobileTools = !showMobileTools"
            :title="showMobileTools ? '收起工具' : '展开工具'">
            <ChevronDown :class="{ 'mobile-toggle-open': showMobileTools }" />
          </Button>
          <Button variant="primary" size="sm" class="mobile-send-btn" @click="_sendMessage">
            {{ isGenerating && pendingMessages.length > 0 ? '队列' : '发送' }}
          </Button>
        </div>

        <div v-if="showMobileTools" class="mobile-tools-panel">
          <Button variant="icon" size="sm" :class="{ 'thinking-active': thinkingMode }"
            @click="updateThinkingMode(!thinkingMode)" title="思考模式">
            <Bulb />
          </Button>
          <Button variant="icon" size="sm" title="参数设置" @click="openProviderOptionsModal">
            <SettingsIcon />
          </Button>
          <Button variant="icon" size="sm" :class="{ 'speech-active': speechEnabled }" @click="toggleSpeech"
            :title="speechEnabled ? '关闭语音播报' : '开启语音播报'">
            <VolumeIcon v-if="speechEnabled" />
            <VolumeMuteIcon v-else />
          </Button>
          <Button variant="icon" size="sm" :class="{ 'speech-active': !display.speechSidebarCollapsed }"
            @click="() => { display.speechSidebarCollapsed = !display.speechSidebarCollapsed }"
            :title="display.speechSidebarCollapsed ? '打开播放列表' : '关闭播放列表'">
            <PlaylistIcon />
          </Button>
          <ChatAgentSelector type="icon" />
          <ModelSelector type="icon" v-model:model-id="chatModelId" v-model:provider-id="chatProviderId" />
          <Button
            v-if="isScopeGenerating"
            variant="icon"
            size="sm"
            class="stop-all-btn"
            title="停止当前聊天内全部生成"
            @click="stopAllGeneratingInCurrentChat"
          >
            <StopIcon />
          </Button>
        </div>

      </div>

      <!-- 拖拽提示 -->
      <div v-if="fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone" class="drag-overlay">
        <div class="drag-message">
          <FileUploadIcon />
          <span>释放以上传文件</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding: 10px;
  background: transparent;
  width: 100%;
  transition: max-width 0.3s ease, margin 0.3s ease;
}

.footer.is-centered {
  max-width: 800px;
  margin: 0 auto;
}

/* 预发送消息列表样式 */
.pending-messages-container {
  margin-bottom: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.pending-messages-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.pending-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}

.pending-title {
  font-weight: 500;
}

.pending-status {
  margin-left: auto;
  color: var(--text-tertiary);
  font-style: italic;
}

.pending-messages-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pending-message-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: 12px;
  transition: background-color 0.2s;
}

.pending-message-item:hover {
  background: var(--bg-active);
}

.pending-message-text {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.remove-btn {
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-btn:hover {
  opacity: 1;
  color: var(--color-danger);
}

.input-container {
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  transition:
    border 0.2s,
    box-shadow 0.2s;
  position: relative;
}

.input-container:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.input-container.drag-over {
  border-color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.05);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.drag-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-primary);
  font-weight: 500;
}

.drag-message svg {
  width: 32px;
  height: 32px;
}

.input-wrapper {
  position: relative;
  width: 100%;
}

.partial-text {
  position: absolute;
  left: 8px;
  top: 8px;
  color: var(--text-tertiary);
  pointer-events: none;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  opacity: 0.7;
}

.input-field {
  border: none;
  outline: none;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  font-family: var(--font-stack);
  resize: none;
  min-height: 24px;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.4;
  background: transparent;
  color: var(--text-primary);
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  margin-top: 4px;
  border-top: 1px solid var(--border-color-light);
}

.action-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stop-all-btn {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.stop-all-btn:hover {
  background: color-mix(in srgb, var(--color-danger) 18%, transparent);
}

.thinking-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.options-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

.voice-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
  animation: pulse 1.5s infinite;
}

.speech-active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb, 0, 123, 255), 0.1);
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}

.mobile-input-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-input);
  border: 1px solid var(--border-color-light);
  border-radius: 16px;
  padding: 7px;
}

.mobile-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  min-width: 0;
}

.mobile-input-field {
  min-height: 38px;
  font-size: 14px;
  padding: 8px 8px;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
}

.mobile-partial-text {
  top: 7px;
}

.mobile-tools-panel {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(6, minmax(40px, 1fr));
  justify-items: center;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--border-color-light);
  background: var(--bg-input);
}

.mobile-send-btn {
  flex-shrink: 0;
  border-radius: 12px;
  min-width: 58px;
  height: 40px;
}

.mobile-toggle-open {
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}

.footer.is-mobile .input-container {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
}

.footer.is-mobile {
  padding-bottom: calc(8px + max(env(safe-area-inset-bottom), var(--safe-area-bottom, 0px)));
}

@media (max-width: 767px) {
  .footer {
    padding: 8px;
  }

  .input-container {
    border-radius: 22px;
    padding: 10px;
    background: var(--bg-card);
    border: none;
    box-shadow: none;
  }

  .mobile-tools-panel :deep(button),
  .mobile-input-bar :deep(button:not(.mobile-send-btn)) {
    width: 40px;
    height: 40px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}

:global(.dark-mode) .mobile-input-bar {
  background: color-mix(in srgb, var(--bg-card) 82%, #141519);
  border-color: var(--border-subtle);
}

:global(.dark-mode) .mobile-tools-panel {
  background: color-mix(in srgb, var(--bg-card) 82%, #141519);
  border-color: var(--border-subtle);
}

:global(.dark-mode) .footer.is-mobile .input-container {
  background: transparent;
  border: none;
  box-shadow: none;
}
</style>
