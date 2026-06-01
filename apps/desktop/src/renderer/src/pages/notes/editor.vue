<script setup lang="ts">
const { Document, Fullscreen, FullscreenExit } = useIcon([
    'Document',
    'Fullscreen',
    'FullscreenExit',
])

const { customTitle, setTitle } = useAppHeader()
const notesStore = useNotesStore()
const settingsStore = useSettingsStore()
const { currentNote } = storeToRefs(notesStore)

const isErgonomicWidth = computed(() => settingsStore.display.notesInputWidthMode === 'ergonomic')
const widthToggleTitle = computed(() => isErgonomicWidth.value ? '切换为全屏输入宽度' : '切换为适应人体工学宽度')

const toggleInputWidthMode = () => {
    settingsStore.display.notesInputWidthMode = isErgonomicWidth.value ? 'full' : 'ergonomic'
}

// 移动端设置标题
watch(currentNote, (note) => {
    if (isMobile.value) {
        setTitle(note?.title || '笔记')
    }
}, { immediate: true })

const noteContent = ref('')
const activeNoteId = ref<string | null>(null)

const plainTextContent = computed(() => {
    if (!noteContent.value) return ''

    const container = document.createElement('div')
    container.innerHTML = noteContent.value
    return container.textContent || ''
})

const contentCharCount = computed(() => plainTextContent.value.replace(/\s/g, '').length)

let saveTimeout: ReturnType<typeof setTimeout> | null = null

const clearPendingSave = () => {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
        saveTimeout = null
    }
}

const saveNoteContent = (noteId = activeNoteId.value, content = noteContent.value) => {
    if (!noteId) return

    notesStore.updateNote(noteId, {
        content
    })
}

const flushPendingSave = () => {
    if (!saveTimeout || !activeNoteId.value) return

    const noteId = activeNoteId.value
    const content = noteContent.value
    clearPendingSave()
    saveNoteContent(noteId, content)
}

// 监听当前笔记变化
watch(() => notesStore.currentNoteId, () => {
    flushPendingSave()

    const note = notesStore.currentNote
    if (note) {
        activeNoteId.value = note.id
        noteContent.value = note.content
    } else {
        activeNoteId.value = null
        noteContent.value = ''
    }
}, { immediate: true })

// 监听标题和内容变化，自动保存
const onContentChange = () => {
    const noteId = activeNoteId.value
    if (!noteId) return

    clearPendingSave()
    saveTimeout = setTimeout(() => {
        saveTimeout = null
        saveNoteContent(noteId, noteContent.value)
    }, 1000)
}

// 组件卸载时保存
onUnmounted(() => {
    flushPendingSave()
})
</script>

<template>
    <div class="note-editor" :class="{ 'is-mobile': isMobile }">
        <AppHeader v-if="isMobile" :custom-title="customTitle" current-view="notes" />

        <div class="editor-main-content">
            <!-- 无笔记选中时的空状态 -->
            <div v-if="!currentNote" class="empty-state">
                <div class="empty-icon">
                    <Document />
                </div>
                <h3>选择一个笔记开始编辑</h3>
                <p>从左侧选择一个笔记，或创建一个新笔记</p>
            </div>

            <!-- 笔记编辑区域 -->
            <div v-else class="editor-container" :class="{ 'is-ergonomic': isErgonomicWidth }">
                <!-- 笔记内容 -->
                <div class="note-content">
                    <RichTextEditor v-model="noteContent" placeholder="开始输入笔记内容..." class="content-editor"
                        :reference-title="currentNote.title" :reference-id="currentNote.id" @change="onContentChange">
                        <template #toolbar-actions>
                            <Button v-if="!isMobile" variant="icon" size="sm" :title="widthToggleTitle"
                                @click="toggleInputWidthMode">
                                <component :is="isErgonomicWidth ? Fullscreen : FullscreenExit" />
                            </Button>
                        </template>
                    </RichTextEditor>
                    <div class="note-word-count">{{ contentCharCount }} 字</div>
                </div>
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
    background: var(--bg-card);
    overflow: hidden;
}

.editor-main-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    max-width: none;
    margin: 0 auto;
    overflow: hidden;
    transition: max-width 0.2s ease, padding 0.2s ease;
}

.editor-container.is-ergonomic {
    max-width: 820px;
    padding: 0 24px;
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
    position: relative;
    flex: 1;
    overflow-y: auto;
}

.note-word-count {
    position: absolute;
    right: 12px;
    bottom: 8px;
    display: flex;
    align-items: center;
    min-height: 20px;
    padding: 0 7px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-tertiary);
    font-size: 12px;
    line-height: 1;
    background: color-mix(in srgb, var(--bg-card) 92%, transparent);
    pointer-events: none;
}

.content-editor {
    width: 100%;
    height: 100%;
    min-height: 400px;
}

.content-editor :deep(.rich-text-editor-content) {
    padding: 12px 12px max(168px, 28vh);
}

.content-editor :deep(.rich-text-editor-scroll) {
    scroll-padding: 16px 0 max(168px, 28vh);
}

.note-editor.is-mobile .title-input {
    font-size: 20px;
    flex: 1;
}

.note-editor.is-mobile .editor-container {
    max-width: none;
    padding: 0;
}

.back-button {
    flex-shrink: 0;
}
</style>
