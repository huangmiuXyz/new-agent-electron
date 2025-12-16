<script setup lang="ts">
import { FileUIPart, TextUIPart, ToolUIPart } from 'ai';
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
const props = defineProps<{
    message: BaseMessage
    markdown?: boolean
}>();
const { currentChat } = storeToRefs(useChatsStores());
const { updateMessage } = useChatsStores()

const messageEdit = inject('messageEdit') as {
    editingMessageId: Ref<string | null>
    triggerEdit: (messageId: string) => void
    cancelEdit: () => void
}

const { Check, Close } = useIcon(['Check', 'Close'])

const isEditing = computed(() => {
    return messageEdit.editingMessageId.value === props.message.id
})

const draftContent = ref<Array<FileUIPart | TextUIPart>>([])
const blobUrlMap = ref<Map<string, string>>(new Map())

watch(isEditing, (newVal) => {
    if (newVal) {
        draftContent.value = JSON.parse(JSON.stringify(props.message.parts))
        adjustAllTextareaHeight()
    }
})

onUnmounted(() => {
    blobUrlMap.value.forEach(blobUrl => {
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
    const filteredContent = draftContent.value.filter(part => {
        if (part.type === 'text') {
            return part.text && part.text.trim() !== ''
        }
        return true
    })
    updateMessage(currentChat.value.id, props.message.id, filteredContent)
    messageEdit.cancelEdit()
}

</script>

<template>
    <div>
        <div v-if="!isEditing" class="msg-bubble">
            <div class="blocks-container">
                <div v-for="(block, idx) in message.parts" :key="idx" class="view-block">
                    <span v-if="block.type === 'text'">
                        <MarkdownRender v-if="markdown" :content="block.text" />
                        <template v-else>
                            {{ block.text }}
                        </template>
                    </span>
                    <FileUpload v-if="block.type === 'file'"
                        :files="[{ ...block, blobUrl: anyUrlToBlobUrl(block.url) }]" />
                    <ChatMessageItemReasoning_content v-if="block.type === 'reasoning'"
                        :reasoning_content="block.text" />
                    <ChatMessageItemDynamicTool v-if="block.type === 'dynamic-tool'" :tool_part="block" />
                    <ChatMessageItemTool v-if="block.type.startsWith('tool')" :tool_part="(block as ToolUIPart)" />
                </div>
            </div>
        </div>
        <div v-else class="edit-wrapper">
            <div class="edit-container">
                <div v-for="(block, idx) in draftContent" :key="idx" class="edit-block-row">
                    <div v-if="block.type === 'text'" class="edit-text-wrapper">
                        <textarea v-model="block.text" class="edit-textarea" rows="1" @input="handleInput"
                            placeholder="Edit text content..."></textarea>
                    </div>
                </div>
            </div>
            <div class="edit-actions">
                <Button variant="text" size="sm" @click="cancelEditing">
                    <Close />
                </Button>
                <Button variant="text" size="sm" @click="saveEditing">
                    <Check />
                </Button>
            </div>
        </div>
    </div>
</template>

<style>
.msg-bubble {
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
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

.edit-textarea {
    width: 100%;
    padding: 8px;
    font-size: 14px;
    line-height: 1.5;
    color: #1f2937;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    outline: none;
    resize: none;
    font-family: inherit;
    background-color: #fff;
    transition: border-color 0.2s, box-shadow 0.2s;
    overflow-y: hidden;
    min-height: 40px;
}

.edit-textarea:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.edit-image-readonly {
    border: 1px dashed #d1d5db;
    padding: 8px;
    border-radius: 6px;
    background-color: #f9fafb;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
}

.readonly-badge {
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    background: #e5e7eb;
    padding: 2px 6px;
    border-radius: 4px;
}

.preview-image {
    max-height: 120px;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    opacity: 0.8;
}

.edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
}
</style>