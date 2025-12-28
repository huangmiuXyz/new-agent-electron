<script setup lang="ts">
const notesStore = useNotesStore()
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
        <!-- 笔记-左侧侧边栏 -->
        <div class="sidebar-wrapper" :class="{ collapsed: false }">
            <NotesSidebar />
        </div>

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
    background: #fff;
}

.sidebar-wrapper {
    width: 260px;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    flex-shrink: 0;
}

.sidebar-wrapper.isMobile {
    width: 100%;
    position: absolute;
    left: 0;
    z-index: 3;
    height: 100%;
}

.sidebar-wrapper.collapsed {
    width: 0;
}
</style>