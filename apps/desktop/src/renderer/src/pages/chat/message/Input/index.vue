<script setup lang="tsx">
import { FileUIPart, TextUIPart } from 'ai'
import AudioInputControls from './AudioInputControls.vue'
import AudioInputPreview from './AudioInputPreview.vue'
import AtPanel from './AtPanel.vue'
import DesktopInputActions from './DesktopInputActions.vue'
import MobileToolButton from './MobileToolButton.vue'
import PendingMessages from './PendingMessages.vue'
import { defineComponent, type PropType } from 'vue'
import { useShortcuts } from '@renderer/composables/useShortcuts'
import { useAgentWorkPath } from './useAgentWorkPath'
import { useChatInputAudio } from './useChatInputAudio'
import { useChatModelSelection } from './useChatModelSelection'
import { useChatSwitcher } from './useChatSwitcher'
import { useInputContextTokens } from './useInputContextTokens'
import {
  confirmMentionTokens,
  separateConfirmedMentionsForSend,
  unwrapConfirmedMentions,
  useMentionEditor
} from './useMentionEditor'
import { useMobileToolLayout, type MobileDragToolId } from './useMobileToolLayout'
import { useProviderOptionsModal } from './useProviderOptionsModal'
import { useVoiceInputControls } from './useVoiceInputControls'

const props = defineProps<{
  preview?: boolean
}>()

const chatStore = useChatsStores()
const message = computed({
  get: () => chatStore.getChatDraft(),
  set: (value: string) => {
    chatStore.setChatDraft(value)
  }
})
const selectedFiles = ref<Array<UploadFile>>([])

const { display } = storeToRefs(useSettingsStore())
const agentStore = useAgentStore()
const settingsStore = useSettingsStore()

// 桌面端输入框按钮布局（按配置过滤可见按钮，保留顺序）
const visibleInputButtons = computed(() => {
  const layout = display.value.inputButtonLayout || []
  return layout.filter((item) => item.visible).map((item) => item.id)
})

// 桌面端输入框底栏按钮（排除已移至顶栏的 agent/model/workpath）
const desktopInputButtons = computed(() => {
  return visibleInputButtons.value.filter((id) => !['agent', 'model', 'workpath'].includes(id))
})

const {
  currentChatAgent,
  chatProviderId,
  chatModelId,
  currentChatProvider,
  currentChatModel
} = useChatModelSelection()
const currentChatToolFeaturesEnabled = computed(
  () => chatStore.currentChat?.toolFeaturesEnabled !== false
)
const {
  currentAgentWorkPath,
  canChooseLocalWorkPath,
  workPathButtonTitle,
  workPathButtonLabel,
  openWorkPathContextMenu
} = useAgentWorkPath({ currentChatAgent })
const currentChatContextTokens = useInputContextTokens({
  chat: computed(() => chatStore.currentChat),
  agent: currentChatAgent,
  modelId: computed(() => currentChatModel.value?.id || chatModelId.value)
})

const { openProviderOptionsModal } = useProviderOptionsModal({
  chatProviderId,
  currentChatProvider
})

const toggleCurrentChatToolFeatures = () => {
  let chatId = chatStore.currentChat?.id
  if (!chatId) {
    chatId = chatStore.createChat()
  }

  chatStore.setChatToolFeaturesEnabled(chatId, !currentChatToolFeaturesEnabled.value)
}

// 图标
const FileUploadIcon = useIcon('Folder')
const SettingsIcon = useIcon('Settings')
const ChevronDown = useIcon('ChevronDown')
const WorkPathFolderIcon = useIcon('Folder')
const WorkPathChevronIcon = useIcon('ChevronDown')
// 引入子组件
const fileUploadRef = useTemplateRef('fileUploadRef')
const inputContainerRef = useTemplateRef('inputContainerRef')
const textareaRef = useTemplateRef<HTMLElement>('textareaRef')
const atPanelRef = useTemplateRef<InstanceType<typeof AtPanel>>('atPanelRef')

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

const {
  showChatSwitcher,
  chatSwitcherQuery,
  chatSwitcherMode,
  chatSwitcherDraftTitle,
  filteredChats,
  chatSwitcherTargetChat,
  isChatGenerating,
  getChatSecondaryText,
  resetChatSwitcherState,
  selectChatFromSwitcher,
  openCreateChatInline,
  openRenameChatInline,
  openDeleteChatInline,
  submitCreateChatInline,
  submitRenameChatInline,
  submitDeleteChatInline
} = useChatSwitcher()

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

const guidePendingMessage = async (messageId: string) => {
  const chatId = chatStore.currentChat?.id
  if (!chatId) return

  if (chatStore.isChatGenerating(chatId)) {
    chatStore.prioritizePendingMessage(chatId, messageId)
    chatStore.markChatGuided(chatId)
    return
  }

  const pendingMessage = chatStore.getPendingMessages(chatId).find((item) => item.id === messageId)
  if (!pendingMessage) return

  chatStore.removePendingMessage(chatId, messageId)
  const { sendMessages } = useChat(chatId)
  sendMessages(pendingMessage.parts.map((part) => ({ ...part })))
}

const stopAllGeneratingInCurrentChat = () => {
  const chatId = chatStore.currentChat?.id
  if (!chatId) return
  chatStore.stopGeneratingInChatScope(chatId)
}

const showMobileTools = ref(false)
const mobileTopBarRef = useTemplateRef('mobileTopBarRef')
const mobileTopLeftZoneRef = useTemplateRef('mobileTopLeftZoneRef')
const mobileTopRightZoneRef = useTemplateRef('mobileTopRightZoneRef')
const mobileBottomZoneRef = useTemplateRef('mobileBottomZoneRef')

const isMobileToolVisible = (_toolId: MobileDragToolId) => true
const {
  mobileTopLeftTools,
  mobileTopRightTools,
  mobileBottomTools,
  draggingToolId,
  mobileDragPointer,
  mobileHoverDropZone,
  isMobileToolDragging,
  mobileDraggingToolLabel,
  mobileToolClass,
  onMobileToolPointerDown,
  onMobileToolPointerCancel,
  handleMobileToolWrapperClickCapture,
  suppressMobileToolClick,
  clearLongPressTimer,
  unbindMobilePointerListeners
} = useMobileToolLayout({
  isMobile,
  showMobileTools,
  topBarRef: mobileTopBarRef,
  topLeftZoneRef: mobileTopLeftZoneRef,
  topRightZoneRef: mobileTopRightZoneRef,
  bottomZoneRef: mobileBottomZoneRef
})

const ensureSendableChat = () => {
  let chatId = chatStore.currentChat?.id
  if (!chatId) {
    chatId = chatStore.createChat()
  }

  chatStore.ensureChatAgent(chatId)

  const currentChat = chatStore.getChatById(chatId)
  const providerId = currentChat?.providerId
  const modelId = currentChat?.modelId
  const selectedModel =
    providerId && modelId ? settingsStore.getModelById(providerId, modelId).model : null

  if (!selectedModel) {
    messageApi.error('请先选择模型')
    return null
  }

  if (!chatStore.currentChat?.id && chatId) {
    chatStore.setActiveChat(chatId)
  }

  return chatId
}

const sendMessageParts = (chatId: string, parts: Array<FileUIPart | TextUIPart>) => {
  const { sendMessages } = useChat(chatId)

  if (chatStore.isChatGenerating(chatId)) {
    chatStore.addPendingMessage(chatId, parts)
  } else {
    sendMessages(parts)
  }
}

const {
  selectedAudioInputs,
  showInputAudioControls,
  inputAudioIsActive,
  inputAudioLevel,
  isManualInputAudioRecording,
  isContinuousInputAudioActive,
  buildAudioFileParts,
  removeAudioInput,
  clearAudioInputs,
  toggleInputAudioPanel,
  toggleManualInputAudio,
  toggleContinuousInputAudio,
  disposeInputAudio
} = useChatInputAudio({
  ensureSendableChat,
  sendMessageParts
})

const runMobileToolAction = async (toolId: MobileDragToolId) => {
  if (toolId === 'upload') return fileUploadRef.value?.triggerUpload?.()
  if (toolId === 'inputAudio') return toggleInputAudioPanel()
  if (toolId === 'voice') return toggleVoiceRecording()
  if (toolId === 'settings') return openProviderOptionsModal()
  if (toolId === 'speech') return toggleSpeech()
  if (toolId === 'playlist') return toggleAssistantPanel('playlist')
  if (toolId === 'stop') return stopAllGeneratingInCurrentChat()
}

const handleMobileToolClick = async (toolId: MobileDragToolId, event: MouseEvent) => {
  if (suppressMobileToolClick.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  await runMobileToolAction(toolId)
}

const {
  speechEnabled,
  isRecording,
  isProcessingVoice,
  partialSpeechText,
  voiceIsActive,
  toggleVoiceRecording,
  toggleSpeech
} = useVoiceInputControls({
  message,
  chatProviderId,
  currentChatAgent,
  onRecognizedText: () => {
    void _sendMessage()
  }
})

const toggleAssistantPanel = (tab?: 'canvas' | 'playlist') => {
  const targetTab = tab ?? display.value.assistantSidebarTab
  const isSameTab = display.value.assistantSidebarTab === targetTab

  if (tab) {
    display.value.assistantSidebarTab = targetTab
  }

  if (display.value.speechSidebarCollapsed) {
    display.value.speechSidebarCollapsed = false
    return
  }

  if (isSameTab) {
    display.value.speechSidebarCollapsed = true
  }
}

const mobileToolButtonProps = computed(() => ({
  providerType: currentChatProvider.value?.providerType,
  providerId: currentChatProvider.value?.id || undefined,
  modelId: chatModelId.value,
  providerModelId: chatProviderId.value,
  inputAudioActive: showInputAudioControls.value || inputAudioIsActive.value,
  voiceActive: voiceIsActive.value,
  isRecording: isRecording.value,
  speechEnabled: speechEnabled.value,
  playlistActive:
    !display.value.speechSidebarCollapsed && display.value.assistantSidebarTab === 'playlist',
  isScopeGenerating: isScopeGenerating.value
}))

const MobileToolButtonItem = defineComponent({
  props: {
    toolId: {
      type: String as PropType<MobileDragToolId>,
      required: true
    }
  },
  setup(itemProps) {
    return () => {
      if (!isMobileToolVisible(itemProps.toolId)) return null

      return (
        <div
          class={['mobile-drag-tool', mobileToolClass(itemProps.toolId)]}
          onPointerdown={(event) => onMobileToolPointerDown(itemProps.toolId, event)}
          onPointercancel={onMobileToolPointerCancel}
          onClickCapture={handleMobileToolWrapperClickCapture}
        >
          <MobileToolButton
            toolId={itemProps.toolId}
            {...mobileToolButtonProps.value}
            onAction={handleMobileToolClick}
            onUpdate:modelId={(value: string) => {
              chatModelId.value = value
            }}
            onUpdate:providerModelId={(value: string) => {
              chatProviderId.value = value
            }}
          >
            {{
              'settings-icon': () => <component is={SettingsIcon} />
            }}
          </MobileToolButton>
        </div>
      )
    }
  }
})

const desktopPlaceholder = computed(() => {
  if (isProcessingVoice.value) return '正在处理语音...'
  return '输入后按 Enter 发送'
})

const mobilePlaceholder = computed(() => {
  if (isProcessingVoice.value) return '正在处理语音...'
  if (currentChatModel.value?.name)
    return `${currentChatAgent.value?.name || '对话'} · ${currentChatModel.value.name}`
  return '发消息或按住说话...'
})

const {
  editorIsEmpty,
  adjustEditorHeight,
  renderEditorContent,
  syncEditorMessage,
  focusEditorAtEnd,
  getEditorCaretOffset,
  updateMentionChipSelectionState,
  applyMention,
  previewMention,
  handleEditorInput,
  handleEditorKeydown,
  handleEditorKeyup,
  handleEditorPaste,
  handleEditorCopy,
  handleEditorCut,
  handleEditorClick,
  lockEditorCursorWhileMentionPanelOpen,
  handleCompositionStart,
  handleCompositionEnd
} = useMentionEditor({
  message,
  textareaRef,
  atPanelRef,
  onSend: () => {
    void _sendMessage()
  },
  isProcessingVoice
})

// 正则匹配 @agent:xxx 或 @智能体:xxx
const AGENT_MENTION_REGEX = /@(?:agent|智能体):([^\s]+)/gi

const _sendMessage = async () => {
  syncEditorMessage()
  const input = unwrapConfirmedMentions(separateConfirmedMentionsForSend(confirmMentionTokens(message.value))).trim()
  const hasContent = input || selectedFiles.value.length > 0 || selectedAudioInputs.value.length > 0

  if (!hasContent) return

  let chatId = chatStore.currentChat?.id
  if (!chatId) {
    chatId = chatStore.createChat()
  }

  chatStore.ensureChatAgent(chatId)

  // 处理 @agent:xxx 智能体切换
  let processedInput = input
  const agentMentionMatches = input.match(AGENT_MENTION_REGEX)
  if (agentMentionMatches && agentMentionMatches.length > 0) {
    // 获取最后一个匹配的智能体提及（用户可能输入了多个）
    const lastMention = agentMentionMatches[agentMentionMatches.length - 1]
    const agentNameMatch = lastMention.match(/@(?:agent|智能体):([^\s]+)/i)
    if (agentNameMatch) {
      const agentName = agentNameMatch[1]
      // 查找匹配的智能体
      const targetAgent = agentStore.allAgents.find(
        (agent) => agent.name.toLowerCase() === agentName.toLowerCase()
      )
      if (targetAgent) {
        // 切换到目标智能体
        chatStore.setChatAgent(chatId, targetAgent.id)
        // 从消息中移除 @agent:xxx 字符串
        processedInput = input.replace(AGENT_MENTION_REGEX, '').trim()
      }
    }
  }

  const sendableChatId = ensureSendableChat()
  if (!sendableChatId) {
    return
  }
  chatId = sendableChatId

  // 构建消息parts
  const parts: Array<FileUIPart | TextUIPart> = []

  if (processedInput) {
    parts.push({ type: 'text', text: processedInput })
  }

  for (const file of selectedFiles.value) {
    const { path, url, ...aiPart } = file

    parts.push({
      ...aiPart,
      url: path ?? url
    } as FileUIPart)
  }

  parts.push(...buildAudioFileParts())

  // 清空输入
  message.value = ''
  atPanelRef.value?.scheduleClose()
  selectedFiles.value = []
  clearAudioInputs()
  nextTick(() => {
    renderEditorContent()
    adjustEditorHeight(textareaRef.value)
  })

  sendMessageParts(chatId, parts)
}

// 注册聚焦输入框快捷键
const { register, unregister } = useShortcuts()
onMounted(() => {
  // 预览模式下不注册全局快捷键与 document 监听，避免污染真实聊天页
  if (!props.preview) {
    register({
      id: 'global.focusInput',
      handler: () => {
        focusEditorAtEnd()
      }
    })
    register({
      id: 'chat.toggleManualInputAudio',
      handler: () => {
        void toggleManualInputAudio()
      }
    })
    register({
      id: 'chat.toggleContinuousInputAudio',
      handler: () => {
        void toggleContinuousInputAudio()
      }
    })
    register({
      id: 'chat.stop',
      when: () => !!chatStore.currentChat?.id && chatStore.isChatGenerating(chatStore.currentChat.id),
      handler: () => {
        stopAllGeneratingInCurrentChat()
      }
    })
    document.addEventListener('selectionchange', updateMentionChipSelectionState)
  }
  nextTick(() => {
    renderEditorContent()
    adjustEditorHeight(textareaRef.value)
  })
})
onUnmounted(() => {
  if (!props.preview) {
    unregister('global.focusInput')
    unregister('chat.toggleManualInputAudio')
    unregister('chat.toggleContinuousInputAudio')
    unregister('chat.stop')
    document.removeEventListener('selectionchange', updateMentionChipSelectionState)
  }
  unbindMobilePointerListeners()
  clearLongPressTimer()
  disposeInputAudio()
})
</script>

<template>
  <footer class="footer" :class="{ 'is-centered': display.chatCenteredLayout, 'is-mobile': isMobile }">
    <PendingMessages
      :pending-messages="pendingMessages"
      :is-generating="isGenerating"
      @guide="guidePendingMessage"
      @remove="removePendingMessage"
    />

    <div v-if="!isMobile" class="input-header">
      <ChatAgentSelector v-if="visibleInputButtons.includes('agent')" type="select" />
      <ModelSelector v-if="visibleInputButtons.includes('model')" v-model:model-id="chatModelId" v-model:provider-id="chatProviderId" type="select" />
      <button
        v-if="canChooseLocalWorkPath && visibleInputButtons.includes('workpath')"
        type="button"
        class="workpath-trigger no-drag"
        :class="{ 'workpath-active': currentAgentWorkPath }"
        :title="workPathButtonTitle"
        @click="openWorkPathContextMenu($event)"
        @contextmenu="openWorkPathContextMenu($event)"
      >
        <WorkPathFolderIcon class="workpath-trigger-icon" />
        <span class="workpath-trigger-label">{{ workPathButtonLabel }}</span>
        <WorkPathChevronIcon class="workpath-trigger-chevron" />
      </button>
    </div>

    <div class="input-container" ref="inputContainerRef"
      :class="{ 'drag-over': fileUploadRef?.isDragOver || fileUploadRef?.isOverDropZone }">
      <FileUpload ref="fileUploadRef" :files="selectedFiles" :dropZoneRef="inputContainerRef!" :inputRef="textareaRef!"
        @files-selected="handleFilesSelected" @remove="handleFileRemoved" />
      <AudioInputPreview :audios="selectedAudioInputs" @remove="removeAudioInput" />
      <AudioInputControls
        :visible="showInputAudioControls"
        :active="inputAudioIsActive"
        :level="inputAudioLevel"
        :manual-recording="isManualInputAudioRecording"
        :continuous-active="isContinuousInputAudioActive"
        @toggle-manual="toggleManualInputAudio"
        @toggle-continuous="toggleContinuousInputAudio"
      />

      <div v-if="!isMobile">
        <div class="input-wrapper">
          <AtPanel ref="atPanelRef" @apply="applyMention" @preview="previewMention" />
          <div v-if="editorIsEmpty" class="editor-placeholder">{{ desktopPlaceholder }}</div>
          <div ref="textareaRef" class="input-field editor-field" :class="{ 'is-empty': editorIsEmpty }" role="textbox"
            aria-multiline="true" :data-placeholder="desktopPlaceholder"
            @input="handleEditorInput" @keydown="handleEditorKeydown" @keyup="handleEditorKeyup"
            @copy="handleEditorCopy" @cut="handleEditorCut" @paste="handleEditorPaste"
            @pointerdown="lockEditorCursorWhileMentionPanelOpen"
            @mousedown="lockEditorCursorWhileMentionPanelOpen"
            @touchstart="lockEditorCursorWhileMentionPanelOpen"
            @click="handleEditorClick"
            @focus="atPanelRef?.syncMentionState(message, getEditorCaretOffset())" @blur="atPanelRef?.scheduleClose()"
            @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
            :contenteditable="isProcessingVoice ? 'false' : 'true'"></div>
          <div v-if="partialSpeechText" class="partial-text">{{ partialSpeechText }}</div>
        </div>

        <DesktopInputActions
          v-model:provider-id="chatProviderId"
          v-model:model-id="chatModelId"
          v-model:show-chat-switcher="showChatSwitcher"
          v-model:chat-switcher-query="chatSwitcherQuery"
          v-model:chat-switcher-mode="chatSwitcherMode"
          v-model:chat-switcher-draft-title="chatSwitcherDraftTitle"
          :visible-input-buttons="desktopInputButtons"
          :current-chat-provider="currentChatProvider"
          :current-chat-context-tokens="currentChatContextTokens"
          :current-chat-tool-features-enabled="currentChatToolFeaturesEnabled"
          :show-input-audio-controls="showInputAudioControls"
          :input-audio-active="inputAudioIsActive"
          :voice-is-active="voiceIsActive"
          :is-recording="isRecording"
          :speech-enabled="speechEnabled"
          :is-scope-generating="isScopeGenerating"
          :is-generating="isGenerating"
          :pending-messages-count="pendingMessages.length"
          :can-choose-local-work-path="canChooseLocalWorkPath"
          :current-agent-work-path="currentAgentWorkPath"
          :work-path-button-title="workPathButtonTitle"
          :work-path-button-label="workPathButtonLabel"
          :active-chat-id="chatStore.activeChatId || undefined"
          :filtered-chats="filteredChats"
          :chat-switcher-target-chat="chatSwitcherTargetChat"
          :is-chat-generating="isChatGenerating"
          :get-chat-secondary-text="getChatSecondaryText"
          @upload="fileUploadRef?.triggerUpload?.()"
          @toggle-input-audio="toggleInputAudioPanel"
          @open-provider-options="openProviderOptionsModal"
          @toggle-tool-features="toggleCurrentChatToolFeatures"
          @toggle-voice="toggleVoiceRecording"
          @toggle-speech="toggleSpeech"
          @stop-generating="stopAllGeneratingInCurrentChat"
          @send="_sendMessage"
          @open-work-path-menu="openWorkPathContextMenu"
          @create-chat="openCreateChatInline"
          @rename-chat="openRenameChatInline"
          @delete-chat="openDeleteChatInline"
          @reset-chat-switcher="resetChatSwitcherState"
          @submit-create-chat="submitCreateChatInline"
          @submit-rename-chat="submitRenameChatInline"
          @submit-delete-chat="submitDeleteChatInline"
          @select-chat="selectChatFromSwitcher"
        />
      </div>

      <div v-else>
        <div class="mobile-input-bar" ref="mobileTopBarRef" :class="{ 'mobile-drop-active': isMobileToolDragging }">
          <div class="mobile-top-drop-zone mobile-top-left-zone" ref="mobileTopLeftZoneRef"
            :class="{ 'mobile-drop-hover': mobileHoverDropZone === 'top-left' }">
            <template v-for="toolId in mobileTopLeftTools" :key="`top-left-${toolId}`">
              <MobileToolButtonItem :tool-id="toolId" />
            </template>
          </div>
          <div class="mobile-input-wrapper">
            <AtPanel ref="atPanelRef" mobile @apply="applyMention" @preview="previewMention" />
            <div v-if="editorIsEmpty" class="editor-placeholder mobile-editor-placeholder">
              {{ mobilePlaceholder }}
            </div>
            <div ref="textareaRef" class="input-field editor-field mobile-input-field" :class="{ 'is-empty': editorIsEmpty }"
              role="textbox" aria-multiline="true" :data-placeholder="mobilePlaceholder"
              @input="handleEditorInput" @keydown="handleEditorKeydown" @keyup="handleEditorKeyup"
              @copy="handleEditorCopy" @cut="handleEditorCut" @paste="handleEditorPaste"
              @pointerdown="lockEditorCursorWhileMentionPanelOpen"
              @mousedown="lockEditorCursorWhileMentionPanelOpen"
              @touchstart="lockEditorCursorWhileMentionPanelOpen"
              @click="handleEditorClick"
              @focus="atPanelRef?.syncMentionState(message, getEditorCaretOffset())" @blur="atPanelRef?.scheduleClose()"
              @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd"
              :contenteditable="isProcessingVoice ? 'false' : 'true'"></div>
            <div v-if="partialSpeechText" class="partial-text mobile-partial-text">
              {{ partialSpeechText }}
            </div>
          </div>
          <div class="mobile-top-drop-zone mobile-top-right-zone" v-if="
            mobileTopRightTools.length > 0 ||
            (isMobileToolDragging && mobileHoverDropZone === 'top-right')
          " ref="mobileTopRightZoneRef" :class="{ 'mobile-drop-hover': mobileHoverDropZone === 'top-right' }">
            <template v-for="toolId in mobileTopRightTools" :key="`top-right-${toolId}`">
              <MobileToolButtonItem :tool-id="toolId" />
            </template>
          </div>
          <Button variant="icon" size="sm" @click="showMobileTools = !showMobileTools"
            :title="showMobileTools ? '收起工具' : '展开工具'">
            <ChevronDown :class="{ 'mobile-toggle-open': showMobileTools }" />
          </Button>
          <button
            class="mobile-send-btn"
            :title="isGenerating && pendingMessages.length > 0 ? '队列' : '发送'"
            @click="_sendMessage"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13V3m0 0L4 7m4-4l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>

        <div v-if="showMobileTools" class="mobile-tools-panel" ref="mobileBottomZoneRef" :class="{
          'mobile-drop-active': isMobileToolDragging,
          'mobile-drop-hover': mobileHoverDropZone === 'bottom'
        }">
          <template v-for="toolId in mobileBottomTools" :key="`bottom-${toolId}`">
            <MobileToolButtonItem :tool-id="toolId" />
          </template>
        </div>
      </div>

      <div v-if="isMobileToolDragging && draggingToolId" class="mobile-drag-ghost" :style="{
        left: `${mobileDragPointer.x}px`,
        top: `${mobileDragPointer.y}px`
      }">
        <span>{{ mobileDraggingToolLabel }}</span>
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
@import './input.css';
</style>

<style>
.dark-mode .input-container:focus-within {
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.03) !important;
}

.dark-mode .mobile-input-bar:focus-within {
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.03) !important;
}

.dark-mode .send-btn,
.dark-mode .mobile-send-btn {
  color: #fff !important;
}

.input-header .model-btn .clear-btn {
  display: none !important;
}
</style>
