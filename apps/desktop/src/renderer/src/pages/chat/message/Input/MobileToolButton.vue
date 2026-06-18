<script setup lang="ts">
import ThinkingModeButton from './ThinkingModeButton.vue'
import type { MobileDragToolId } from './useMobileToolLayout'

const props = defineProps<{
  toolId: MobileDragToolId
  providerType?: string
  providerId?: string
  modelId: string
  providerModelId: string
  inputAudioActive: boolean
  voiceActive: boolean
  isRecording: boolean
  speechEnabled: boolean
  playlistActive: boolean
  isScopeGenerating: boolean
}>()

const emit = defineEmits<{
  action: [toolId: MobileDragToolId, event: MouseEvent]
  'update:modelId': [value: string]
  'update:providerModelId': [value: string]
}>()

const FileUploadIcon = useIcon('Folder')
const InputAudioIcon = useIcon('FileMusic')
const MicIcon = useIcon('Mic')
const MicOffIcon = useIcon('MicOff')
const VolumeIcon = useIcon('VolumeMedium')
const VolumeMuteIcon = useIcon('VolumeMute')
const PlaylistIcon = useIcon('Menu')
const StopIcon = useIcon('Stop')
</script>

<template>
  <Button v-if="props.toolId === 'upload'" variant="icon" size="sm" @click="emit('action', 'upload', $event)">
    <FileUploadIcon />
  </Button>
  <Button
    v-else-if="props.toolId === 'inputAudio'"
    variant="icon"
    size="sm"
    :class="{ 'input-audio-active': props.inputAudioActive }"
    aria-label="录入 input_audio"
    title="录入 input_audio"
    @click="emit('action', 'inputAudio', $event)"
  >
    <InputAudioIcon />
  </Button>
  <Button
    v-else-if="props.toolId === 'voice'"
    variant="icon"
    size="sm"
    :class="{ 'voice-active': props.voiceActive }"
    :title="props.voiceActive ? (props.isRecording ? '正在录制' : '正在监听') : '语音输入'"
    @click="emit('action', 'voice', $event)"
  >
    <MicIcon v-if="!props.voiceActive" />
    <MicOffIcon v-else />
  </Button>
  <ThinkingModeButton
    v-else-if="props.toolId === 'thinking'"
    :provider-type="props.providerType"
    :provider-id="props.providerId"
    :model-id="props.modelId"
  />
  <Button v-else-if="props.toolId === 'settings'" variant="icon" size="sm" title="参数设置" @click="emit('action', 'settings', $event)">
    <slot name="settings-icon" />
  </Button>
  <Button
    v-else-if="props.toolId === 'speech'"
    variant="icon"
    size="sm"
    :class="{ 'speech-active': props.speechEnabled }"
    :title="props.speechEnabled ? '关闭语音播报' : '开启语音播报'"
    @click="emit('action', 'speech', $event)"
  >
    <VolumeIcon v-if="props.speechEnabled" />
    <VolumeMuteIcon v-else />
  </Button>
  <Button
    v-else-if="props.toolId === 'playlist'"
    variant="icon"
    size="sm"
    :class="{ 'speech-active': props.playlistActive }"
    :title="props.playlistActive ? '关闭播放列表' : '打开播放列表'"
    @click="emit('action', 'playlist', $event)"
  >
    <PlaylistIcon />
  </Button>
  <ChatAgentSelector v-else-if="props.toolId === 'agent'" type="icon" />
  <ModelSelector
    v-else-if="props.toolId === 'model'"
    type="icon"
    :model-id="props.modelId"
    :provider-id="props.providerModelId"
    @update:model-id="emit('update:modelId', $event)"
    @update:provider-id="emit('update:providerModelId', $event)"
  />
  <Button
    v-else-if="props.toolId === 'stop'"
    variant="icon"
    size="sm"
    class="stop-all-btn"
    :class="{ 'is-idle': !props.isScopeGenerating }"
    title="停止当前聊天内全部生成"
    @click="emit('action', 'stop', $event)"
  >
    <StopIcon />
  </Button>
</template>
