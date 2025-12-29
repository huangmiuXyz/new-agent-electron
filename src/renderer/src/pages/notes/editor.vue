<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'
import RichTextEditor from '@renderer/components/RichTextEditor.vue'

const { Document, ArrowBackIosNewSharp } = useIcon([
    'Document',
    'ArrowBackIosNewSharp'
])

const notesStore = useNotesStore()
const { currentNote, currentFolder } = storeToRefs(notesStore)
const router = useRouter()

const noteTitle = ref('')
const noteContent = ref('')

// 监听当前笔记变化
watch(() => notesStore.currentNote, (note) => {
    if (note) {
        noteTitle.value = note.title
        noteContent.value = note.content
    } else {
        noteTitle.value = ''
        noteContent.value = ''
    }
}, { immediate: true })

// 监听标题和内容变化，自动保存
let saveTimeout: NodeJS.Timeout | null = null

const saveNote = () => {
    if (!notesStore.currentNote) return

    notesStore.updateNote(notesStore.currentNote.id, {
        title: noteTitle.value,
        content: noteContent.value
    })
}

const onTitleChange = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(saveNote, 500)
}

const onContentChange = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(saveNote, 1000)
}

const goBack = () => {
    saveNote()
    if (isMobile.value) {
        router.push('/mobile/notes/list')
    }
}

// 组件卸载时保存
onUnmounted(() => {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    saveNote()
})
</script>

<template>
    <div class="note-editor" :class="{ 'is-mobile': isMobile }">
        <!-- 无笔记选中时的空状态 -->
        <div v-if="!currentNote" class="empty-state">
            <div class="empty-icon">
                <Document />
            </div>
            <h3>选择一个笔记开始编辑</h3>
            <p>从左侧选择一个笔记，或创建一个新笔记</p>
        </div>

        <!-- 笔记编辑区域 -->
        <div v-else class="editor-container">
            <!-- 笔记标题 -->
            <div class="note-header">
                <Button v-if="isMobile" variant="icon" size="md" @click="goBack" class="back-button">
                    <ArrowBackIosNewSharp />
                </Button>
                <Input v-model="noteTitle" placeholder="输入笔记标题..." class="title-input"
                    @update:modelValue="onTitleChange" />
                <div class="note-meta">
                    <span v-if="currentFolder">{{ currentFolder.name }}</span>
                    <span class="separator">•</span>
                    <span>{{ new Date(currentNote.updatedAt).toLocaleString() }}</span>
                </div>
            </div>

            <!-- 笔记内容 -->
            <div class="note-content">
                <RichTextEditor v-model="noteContent" placeholder="开始输入笔记内容..." class="content-editor"
                    @change="onContentChange" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.note-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #fff;
    overflow: hidden;
}

.note-editor.is-mobile {
    height: 100%;
    width: 100%;
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 20px;
    color: var(--text-tertiary);
}

.empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

.empty-state h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--text-secondary);
}

.empty-state p {
    font-size: 14px;
    max-width: 300px;
}

.editor-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.note-header {
    padding: 20px 24px 12px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.title-input {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    border: none;
    outline: none;
    padding: 0;
    background: transparent;
}

.note-meta {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: var(--text-tertiary);
    gap: 8px;
}

.separator {
    opacity: 0.5;
}

.note-content {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
}

.content-editor {
    width: 100%;
    height: 100%;
    min-height: 400px;
}

/* 移动端样式 */
.note-editor.is-mobile .note-header {
    padding: 16px 20px 12px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
}

.note-editor.is-mobile .title-input {
    font-size: 20px;
    flex: 1;
}

.back-button {
    flex-shrink: 0;
}


.note-editor.is-mobile .note-content {
    padding: 16px 20px;
}

.note-editor.is-mobile .content-textarea {
    font-size: 16px;
}
</style>
