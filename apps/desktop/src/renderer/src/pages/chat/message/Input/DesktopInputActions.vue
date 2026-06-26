<script setup lang="ts">
import ChatSwitcherPopover from './ChatSwitcherPopover.vue'
import ThinkingModeButton from './ThinkingModeButton.vue'

type ContextTokens = {
  hasContext: boolean
  totalDisplay: string
  contextMessageCountDisplay: string
  tooltip: string
}

const props = defineProps<{
  visibleInputButtons: string[]
  currentChatProvider: any
  currentChatContextTokens: ContextTokens
  currentChatToolFeaturesEnabled: boolean
  showInputAudioControls: boolean
  inputAudioActive: boolean
  voiceIsActive: boolean
  isRecording: boolean
  speechEnabled: boolean
  isScopeGenerating: boolean
  isGenerating: boolean
  pendingMessagesCount: number
  canChooseLocalWorkPath: boolean
  currentAgentWorkPath: string
  workPathButtonTitle: string
  workPathButtonLabel: string
  activeChatId?: string
  filteredChats: Chat[]
  chatSwitcherTargetChat: Chat | null
  isChatGenerating: (chat: Chat) => boolean
  getChatSecondaryText: (chat: Chat) => string
}>()

const chatProviderId = defineModel<string>('providerId', { required: true })
const chatModelId = defineModel<string>('modelId', { required: true })
const showChatSwitcher = defineModel<boolean>('showChatSwitcher', { required: true })
const chatSwitcherQuery = defineModel<string>('chatSwitcherQuery', { required: true })
const chatSwitcherMode = defineModel<'list' | 'create' | 'rename' | 'delete'>('chatSwitcherMode', {
  required: true
})
const chatSwitcherDraftTitle = defineModel<string>('chatSwitcherDraftTitle', { required: true })

const emit = defineEmits<{
  upload: []
  toggleInputAudio: []
  openProviderOptions: []
  toggleToolFeatures: []
  toggleVoice: []
  toggleSpeech: []
  stopGenerating: []
  send: []
  openWorkPathMenu: [event: MouseEvent]
  createChat: []
  renameChat: [chat: Chat]
  deleteChat: [chat: Chat]
  resetChatSwitcher: []
  submitCreateChat: []
  submitRenameChat: []
  submitDeleteChat: []
  selectChat: [chatId: string]
}>()

const FileUploadIcon = useIcon('Folder')
const InputAudioIcon = useIcon('FileMusic')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')
const VolumeIcon = useIcon('VolumeMedium')
const VolumeMuteIcon = useIcon('VolumeMute')
const SettingsIcon = useIcon('Settings')
const ToolFeaturesIcon = useIcon('Wrench20Regular')
const StopIcon = useIcon('Stop')
const InfoCircle = useIcon('InfoCircle')
const WorkPathFolderIcon = useIcon('Folder')
const WorkPathChevronIcon = useIcon('ChevronDown')
</script>

<template>
  <div class="input-actions">
    <div class="action-left">
      <template v-for="btnId in props.visibleInputButtons" :key="btnId">
        <Button v-if="btnId === 'upload'" variant="icon" size="sm" @click="emit('upload')">
          <FileUploadIcon />
        </Button>
        <Button
          v-else-if="btnId === 'inputAudio'"
          variant="icon"
          size="sm"
          :class="{ 'input-audio-active': props.showInputAudioControls || props.inputAudioActive }"
          aria-label="录入 input_audio"
          title="录入 input_audio"
          @click="emit('toggleInputAudio')"
        >
          <InputAudioIcon />
        </Button>
        <ThinkingModeButton
          v-else-if="btnId === 'thinking'"
          :provider-type="props.currentChatProvider?.providerType"
          :provider-id="props.currentChatProvider?.id || undefined"
          :model-id="chatModelId"
        />
        <Button v-else-if="btnId === 'settings'" variant="icon" size="sm" title="参数设置" @click="emit('openProviderOptions')">
          <SettingsIcon />
        </Button>
        <Button
          v-else-if="btnId === 'toolFeatures'"
          variant="icon"
          size="sm"
          :class="{ 'tool-features-active': props.currentChatToolFeaturesEnabled }"
          :title="props.currentChatToolFeaturesEnabled ? '本对话已启用技能、内置工具和 MCP' : '本对话已禁用自动技能、内置工具和 MCP，@技能引用仍可用'"
          @click="emit('toggleToolFeatures')"
        >
          <ToolFeaturesIcon />
        </Button>
        <div v-else-if="btnId === 'tokenUsage'" class="token-usage-popover">
          <Button variant="icon" size="sm" class="token-usage-btn" aria-label="当前上下文 Token 统计" :title="props.currentChatContextTokens.tooltip">
            <InfoCircle />
          </Button>
          <div class="token-usage-panel">
            <div class="token-usage-panel-title">当前上下文 Token</div>
            <template v-if="props.currentChatContextTokens.hasContext">
              <div class="token-usage-panel-row">
                <span>总计</span>
                <strong>{{ props.currentChatContextTokens.totalDisplay }}</strong>
              </div>
              <div class="token-usage-panel-row">
                <span>上下文消息</span>
                <span>{{ props.currentChatContextTokens.contextMessageCountDisplay }}</span>
              </div>
            </template>
            <div v-else class="token-usage-panel-empty">暂无可用统计</div>
          </div>
        </div>
        <Button
          v-else-if="btnId === 'voice'"
          variant="icon"
          size="sm"
          :class="{ 'voice-active': props.voiceIsActive }"
          :title="props.voiceIsActive ? (props.isRecording ? '正在录制' : '正在监听') : '语音输入'"
          @click="emit('toggleVoice')"
        >
          <MicIcon v-if="!props.voiceIsActive" />
          <MicOffIcon v-else />
        </Button>
        <Button
          v-else-if="btnId === 'speech'"
          variant="icon"
          size="sm"
          :class="{ 'speech-active': props.speechEnabled }"
          :title="props.speechEnabled ? '关闭语音播报' : '开启语音播报'"
          @click="emit('toggleSpeech')"
        >
          <VolumeIcon v-if="props.speechEnabled" />
          <VolumeMuteIcon v-else />
        </Button>
        <Button
          v-else-if="btnId === 'stop' && props.isScopeGenerating"
          variant="icon"
          size="sm"
          class="stop-all-btn"
          title="停止当前聊天内全部生成"
          @click="emit('stopGenerating')"
        >
          <StopIcon />
        </Button>
        <ChatAgentSelector v-else-if="btnId === 'agent'" type="icon" />
        <ModelSelector v-else-if="btnId === 'model'" v-model:model-id="chatModelId" v-model:provider-id="chatProviderId" type="icon" />
        <ChatSwitcherPopover
          v-else-if="btnId === 'chatSwitcher'"
          v-model:visible="showChatSwitcher"
          v-model:search-query="chatSwitcherQuery"
          v-model:mode="chatSwitcherMode"
          v-model:draft-title="chatSwitcherDraftTitle"
          :active-chat-id="props.activeChatId"
          :filtered-chats="props.filteredChats"
          :target-chat="props.chatSwitcherTargetChat"
          :is-chat-generating="props.isChatGenerating"
          :get-chat-secondary-text="props.getChatSecondaryText"
          @create="emit('createChat')"
          @rename="emit('renameChat', $event)"
          @delete="emit('deleteChat', $event)"
          @reset="emit('resetChatSwitcher')"
          @submit-create="emit('submitCreateChat')"
          @submit-rename="emit('submitRenameChat')"
          @submit-delete="emit('submitDeleteChat')"
          @select="emit('selectChat', $event)"
        />
        <button
          v-else-if="btnId === 'workpath' && props.canChooseLocalWorkPath"
          type="button"
          class="workpath-trigger no-drag"
          :class="{ 'workpath-active': props.currentAgentWorkPath }"
          :title="props.workPathButtonTitle"
          @click="emit('openWorkPathMenu', $event)"
          @contextmenu="emit('openWorkPathMenu', $event)"
        >
          <WorkPathFolderIcon class="workpath-trigger-icon" />
          <span class="workpath-trigger-label">{{ props.workPathButtonLabel }}</span>
          <WorkPathChevronIcon class="workpath-trigger-chevron" />
        </button>
      </template>
    </div>
    <div class="action-right">
      <button
        class="send-btn"
        :title="props.isGenerating && props.pendingMessagesCount > 0 ? '加入队列' : '发送'"
        @click="emit('send')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13V3m0 0L4 7m4-4l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
@import './input.css';

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
  gap: 6px;
}

.action-left,
.action-right {
  display: flex;
  align-items: center;
}

.action-left {
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.action-right {
  gap: 8px;
  flex-shrink: 0;
}

/* 图标按钮：圆角方形 */
:deep(.btn--icon.btn--sm) {
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  border-radius: 10px;
  border: none;
  font-size: 16px;
  padding: 0;
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

:deep(.btn--icon.btn--sm:hover) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

:deep(.btn--icon.btn--sm:active) {
  transform: scale(0.92);
  background: var(--bg-active);
}

/* 发送按钮：圆角方形 */
.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary);
  color: var(--accent-text);
  cursor: pointer;
  transition:
    background-color 0.14s ease,
    transform 0.1s ease,
    opacity 0.14s ease;
}

.send-btn:hover {
  opacity: 0.88;
}

.send-btn:active {
  transform: scale(0.92);
  opacity: 0.82;
}

.send-btn svg {
  width: 16px;
  height: 16px;
}
</style>
