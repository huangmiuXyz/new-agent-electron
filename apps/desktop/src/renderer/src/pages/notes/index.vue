<script setup lang="ts">
const notesStore = useNotesStore()
const settingsStore = useSettingsStore()
const { currentFolder, currentNote } = storeToRefs(notesStore)

// 初始化数据
onMounted(() => {
    notesStore.initializeData()
})

const { setTitle } = useAppHeader()

// 设置页面标题
watch(() => currentNote.value, (note) => {
    if (note) {
        setTitle(note.title)
    } else if (currentFolder.value) {
        setTitle(currentFolder.value.name)
    } else {
        setTitle('笔记')
    }
}, { immediate: true })
</script>

<template>
    <div class="notes-layout">
        <!-- 侧边栏区域 -->
        <ResizeBox v-model:width="settingsStore.display.notesSidebarWidth"
            v-model:is-collapsed="settingsStore.display.sidebarCollapsed" :min-size="200" :max-size="500">
            <NotesSidebar />
        </ResizeBox>

        <!-- 笔记-右侧内容区 -->
        <div class="notes-content">
            <NotesEditor />
        </div>
    </div>
</template>

<style scoped>
.notes-layout {
    display: flex;
    overflow: hidden;
    height: 100%;
    width: 100%;
}

.notes-content {
    flex: 1;
    display: flex;
    min-width: 0;
    z-index: 2;
    background: var(--bg-card);
}
</style>
