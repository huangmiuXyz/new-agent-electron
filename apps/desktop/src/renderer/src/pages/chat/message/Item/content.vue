<script setup lang="ts">
import { FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import type { InputAudioItem } from '@renderer/composables/useInputAudioRecorder'
import AudioInputPreview from '../Input/AudioInputPreview.vue'
import '@incremark/theme/styles.css'
const props = defineProps<{
  message: BaseMessage
  markdown?: boolean
  parts?: BaseMessage['parts']
  streaming?: boolean
}>()
const { currentChat } = storeToRefs(useChatsStores())
const { currentSelectedModel, display } = storeToRefs(useSettingsStore())
const { updateMessage } = useChatsStores()

const messageEdit = inject('messageEdit') as {
  editingMessageId: Ref<string | null>
  triggerEdit: (messageId: string) => void
  cancelEdit: () => void
}

const { Check, Refresh, Close } = useIcon(['Check', 'Refresh', 'Close'])

const isEditing = computed(() => {
  return messageEdit.editingMessageId.value === props.message.id
})

const contentStyle = computed(() => ({
  fontSize: `${display.value.fontSize}px`
}))

const draftContent = ref<Array<FileUIPart | TextUIPart>>([])
const blobUrlMap = ref<Map<string, string>>(new Map())

watch(isEditing, (newVal) => {
  if (newVal) {
    draftContent.value = JSON.parse(JSON.stringify(props.message.parts))
    adjustAllTextareaHeight()
  }
})

onUnmounted(() => {
  blobUrlMap.value.forEach((blobUrl) => {
    URL.revokeObjectURL(blobUrl)
  })
  blobUrlMap.value.clear()
})

const handleInput = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = textarea.scrollHeight + 'px'
}

const adjustAllTextareaHeight = () => {
  nextTick(() => {
    const textareas = document.querySelectorAll('.edit-textarea')
    textareas.forEach((textarea) => {
      const el = textarea as HTMLTextAreaElement
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    })
  })
}
const cancelEditing = () => {
  messageEdit.cancelEdit()
}
const saveEditing = () => {
  if (!currentChat.value) return
  const filteredContent = draftContent.value.filter((part) => {
    if (part.type === 'text') {
      return part.text && part.text.trim() !== ''
    }
    return true
  })
  updateMessage(currentChat.value.id, props.message.id, filteredContent)
  messageEdit.cancelEdit()
}

const saveEditingAndRetry = () => {
  if (!currentChat.value) return
  const messageId = props.message.id
  saveEditing()

  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }

  const { regenerate } = useChat(currentChat.value.id)
  setTimeout(() => {
    regenerate(messageId)
  })
}

const retry = () => {
  if (!currentSelectedModel.value) {
    messageApi.error('请先选择模型')
    return
  }
  const { regenerate } = useChat(currentChat.value!.id!)
  regenerate(props.message.id!)
}

const getBlockKey = (block: BaseMessage['parts'][number], idx: number) => {
  const blockId = (block as { id?: string }).id
  return blockId ? `${block.type}:${blockId}` : `${block.type}:${idx}`
}

const isAudioFilePart = (block: BaseMessage['parts'][number]): block is FileUIPart => {
  return block.type === 'file' && Boolean(block.mediaType?.startsWith('audio/'))
}

const isNonAudioFilePart = (block: BaseMessage['parts'][number]): block is FileUIPart => {
  return block.type === 'file' && !isAudioFilePart(block)
}

const filePartToUploadFile = (block: FileUIPart) => ({
  ...block,
  blobUrl: anyUrlToBlobUrl(block.url)
})

const audioPartToPreviewItem = (block: FileUIPart, idx: number): InputAudioItem => ({
  id: `${block.filename || 'audio'}-${idx}`,
  filename: block.filename || `input-audio-${idx + 1}.wav`,
  mediaType: block.mediaType === 'audio/mpeg' ? 'audio/mpeg' : 'audio/wav',
  dataUrl: block.url,
  blobUrl: '',
  size: 0,
  duration: 0,
  createdAt: Date.now()
})

const displayParts = computed(() => props.parts ?? props.message.parts)

const lastTextBlockIndex = computed(() => {
  for (let index = displayParts.value.length - 1; index >= 0; index -= 1) {
    if (displayParts.value[index].type === 'text') return index
  }
  return -1
})

const lastReasoningBlockIndex = computed(() => {
  for (let index = displayParts.value.length - 1; index >= 0; index -= 1) {
    if (displayParts.value[index].type === 'reasoning') return index
  }
  return -1
})

const estimatePartHeight = (block: BaseMessage['parts'][number]) => {
  if (block.type === 'text') {
    const len = (block as TextUIPart).text?.length ?? 0
    return Math.max(60, Math.min(len * 0.7, 1200))
  }
  if (block.type === 'reasoning') return 200
  if (block.type === 'dynamic-tool' || block.type.startsWith('tool')) return 56
  if (block.type === 'file') return 140
  return 80
}
</script>

<template>
  <div>
    <div v-if="!isEditing" class="msg-bubble">
      <div class="blocks-container">
        <div
          v-for="(block, idx) in displayParts"
          :key="getBlockKey(block, idx)"
          class="view-block"
          :class="{ 'view-block--tight': block.type === 'reasoning' || block.type === 'text' }"
          :style="{ '--intrinsic-h': estimatePartHeight(block) + 'px' }"
        >
          <div
            v-if="block.type === 'text'"
            class="text-block"
            :class="{ 'is-streaming-last': streaming && idx === lastTextBlockIndex }"
            :style="contentStyle"
          >
            <Markdown
              v-if="markdown && block.text"
              :block="block"
              :message="message"
              :streaming="streaming && idx === lastTextBlockIndex"
            />
            <template v-else>
              <div class="text-content">
                {{ block.text }}
              </div>
            </template>
          </div>
          <FileUpload
            :removable="false"
            v-if="isNonAudioFilePart(block)"
            :files="[filePartToUploadFile(block)]"
          />
          <AudioInputPreview
            v-if="isAudioFilePart(block)"
            :audios="[audioPartToPreviewItem(block, idx)]"
            :removable="false"
            variant="message"
          />
          <ChatMessageItemReasoning_content
            v-if="block.type === 'reasoning'"
            :reasoning_content="block.text"
            :streaming="message?.metadata?.loading && idx === lastReasoningBlockIndex"
          />
          <ChatMessageItemDynamicTool
            :message="message"
            v-if="block.type === 'dynamic-tool'"
            :tool_part="block"
          />
          <ChatMessageItemTool
            v-if="block.type.startsWith('tool')"
            :tool_part="block as ToolUIPart"
            :message="message"
          />
        </div>
        <ChatMessageItemError
          @retry="retry"
          v-if="message.metadata?.error"
          :error="message.metadata.error"
        />
      </div>
    </div>
    <div v-else class="edit-wrapper">
      <div class="edit-container">
        <div v-for="(block, idx) in draftContent" :key="idx" class="edit-block-row">
          <div v-if="block.type === 'text'" class="edit-text-wrapper">
            <textarea
              v-model="block.text"
              class="edit-textarea"
              rows="1"
              @input="handleInput"
              placeholder="Edit text content..."
            ></textarea>
          </div>
        </div>
      </div>
      <div class="edit-actions">
        <Button variant="text" size="sm" @click="cancelEditing">
          <Close />
        </Button>
        <Button variant="text" size="sm" title="保存" @click="saveEditing">
          <Check />
        </Button>
        <Button variant="text" size="sm" title="保存并重试" @click="saveEditingAndRetry">
          <Refresh />
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-bubble {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  min-width: 0;
}

.blocks-container {
  max-width: 100%;
  min-width: 0;
}

.view-block {
  max-width: 100%;
  min-width: 0;
  padding-block: 5px;
  content-visibility: auto;
  contain-intrinsic-size: auto var(--intrinsic-h, 80px);
}

.view-block--tight {
  padding-block: 0;
}

.text-block {
  max-width: 100%;
  min-width: 0;
}

.edit-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.edit-container {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.edit-block-row {
  display: flex;
  flex-direction: column;
}

.text-content {
  color: var(--text-primary);
}

.edit-textarea {
  width: 100%;
  padding: 8px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  resize: none;
  font-family: inherit;
  background-color: var(--bg-input);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  overflow-y: hidden;
  min-height: 40px;
}

.edit-textarea:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.1);
}

.edit-image-readonly {
  border: 1px dashed var(--border-color);
  padding: 8px;
  border-radius: 6px;
  background-color: var(--bg-hover);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.readonly-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  background: var(--border-color-light);
  padding: 2px 6px;
  border-radius: 4px;
}

.preview-image {
  max-height: 120px;
  border-radius: 4px;
  border: 1px solid var(--border-color-light);
  opacity: 0.8;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
