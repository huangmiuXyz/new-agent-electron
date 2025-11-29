<script setup lang="ts">
import type { BaseMessage, ContentBlock } from "@langchain/core/messages";

const props = defineProps<{
    message: BaseMessage
}>();


const chatStore = useChatsStores();

// 注入编辑功能
const messageEdit = inject('messageEdit') as {
    editingMessageId: Ref<string | null>
    triggerEdit: (messageId: string) => void
    cancelEdit: () => void
}

// 计算当前消息是否处于编辑状态
const isEditing = computed(() => messageEdit.editingMessageId.value === props.message.id)

const draftContent = ref<string | ContentBlock[]>([])

// 监听编辑状态变化
watch(() => isEditing.value, (newVal) => {
    if (newVal) {
        // 进入编辑模式时，初始化草稿内容
        try {
            draftContent.value = JSON.parse(JSON.stringify(props.message.content))
        } catch (e) {
            console.error('Failed to clone content', e)
            draftContent.value = props.message.content as string
        }

        nextTick(() => {
            const textarea = document.querySelector('.edit-textarea') as HTMLTextAreaElement
            if (textarea) {
                textarea.focus()
            }
            adjustAllTextareas()
        })
    } else {
        // 退出编辑模式时，清空草稿内容
        draftContent.value = ''
    }
})

const cancelEditing = () => {
    messageEdit.cancelEdit()
}

const saveEditing = () => {
    const originalJson = JSON.stringify(props.message.content)
    const draftJson = JSON.stringify(draftContent.value)

    if (originalJson !== draftJson) {
        if (chatStore.activeChatId && props.message.id) {
            chatStore.updateMessage(
                chatStore.activeChatId,
                props.message.id,
                draftContent.value
            );
            chatStore.$persist()
        } else {
            console.error("无法更新消息: 缺少 ChatID 或 MessageID");
        }
    }
    messageEdit.cancelEdit()
}

const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement
    adjustHeight(target)
}

const adjustHeight = (el: HTMLTextAreaElement) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
}

const adjustAllTextareas = () => {
    const els = document.querySelectorAll('.edit-textarea')
    els.forEach(el => adjustHeight(el as HTMLTextAreaElement))
}


const { Check, Close } = useIcon(['Check', 'Close'])
</script>

<template>
    <div>
        <div v-if="!isEditing" class="msg-bubble">
            <div v-if="typeof message.content === 'string'" class="text-content">
                {{ message.content }}
            </div>

            <div v-else-if="Array.isArray(message.content)" class="blocks-container">
                <div v-for="(block, idx) in (message.content as ContentBlock[])" :key="idx" class="view-block">
                    <span v-if="block.type === 'text'">{{ block.text }}</span>
                    <img v-else-if="block.type === 'image_url'" :src="(block as ContentBlock.Multimodal.Image).url"
                        class="msg-image" alt="Generated content" />
                </div>
            </div>
        </div>

        <div v-else class="edit-wrapper">
            <div class="edit-container">
                <template v-if="typeof draftContent === 'string'">
                    <textarea v-model="draftContent" class="edit-textarea" rows="2" @input="handleInput"
                        placeholder="Type your message..."></textarea>
                </template>

                <template v-else-if="Array.isArray(draftContent)">
                    <div v-for="(block, idx) in (draftContent as ContentBlock[])" :key="idx" class="edit-block-row">

                        <div v-if="block.type === 'text'" class="edit-text-wrapper">
                            <textarea v-model="(block as ContentBlock.Text).text" class="edit-textarea" rows="1"
                                @input="handleInput" placeholder="Edit text content..."></textarea>
                        </div>

                        <div v-else-if="block.type === 'image'" class="edit-image-readonly">
                            <div class="readonly-badge">Image (Read-only)</div>
                            <img :src="(block as ContentBlock.Multimodal.Image).url" class="preview-image"
                                alt="preview" />
                        </div>

                        <div v-else class="edit-unknown">
                            [Unknown Block: {{ block.type }}]
                        </div>

                    </div>
                </template>
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

<style scoped>
.msg-bubble {
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
}

.msg-image {
    max-width: 100%;
    max-height: 400px;
    border-radius: 8px;
    margin: 8px 0;
    border: 1px solid #e5e7eb;
    display: block;
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