<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'

const { Plus, MoreHorizontal, ArrowLeft, Folder, File } = useIcon([
    'Plus',
    'MoreHorizontal',
    'ArrowLeft',
    'Folder',
    'File'
])

const notesStore = useNotesStore()
const { confirm } = useModal()

const { showContextMenu } = useContextMenu()

// 初始化数据
onMounted(() => {
    notesStore.initializeData()
    // 清除之前保存的 currentFolderId，让用户从文件夹列表开始
    notesStore.setCurrentFolder(null)
})


const handleFolderSelect = (folderId: string) => {
    notesStore.setCurrentFolder(folderId)
}

const handleNoteSelect = (noteId: string) => {
    notesStore.setCurrentNote(noteId)
}

// 返回到文件夹列表
const handleBackToFolders = () => {
    notesStore.setCurrentFolder(null)
}

// 合并文件夹和笔记到一个列表
const combinedList = computed(() => {
    const items: any[] = []

    // 如果有当前文件夹，只显示该文件夹下的笔记
    if (notesStore.currentFolderId) {
        notesStore.notesInCurrentFolder.forEach(note => {
            items.push({
                id: note.id,
                name: note.title,
                type: 'note',
                icon: File,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt
            })
        })
    } else {
        // 没有选中文件夹时，显示所有文件夹
        notesStore.folders.forEach(folder => {
            items.push({
                id: folder.id,
                name: folder.name,
                type: 'folder',
                icon: Folder,
                createdAt: folder.createdAt,
                updatedAt: folder.updatedAt
            })
        })
    }

    return items
})

// 处理列表项点击
const handleItemClick = (id: string) => {
    // 先检查是否是文件夹
    const folder = notesStore.folders.find(f => f.id === id)
    if (folder) {
        handleFolderSelect(folder.id)
        return
    }

    // 再检查是否是笔记
    const note = notesStore.notes.find(n => n.id === id)
    if (note) {
        handleNoteSelect(note.id)
        return
    }
}

// 显示右键菜单
const handleContextMenu = (event: MouseEvent, id: string) => {
    // 先检查是否是文件夹
    const folder = notesStore.folders.find(f => f.id === id)
    if (folder) {
        showFolderContextMenu(event, folder)
        return
    }

    // 再检查是否是笔记
    const note = notesStore.notes.find(n => n.id === id)
    if (note) {
        showNoteContextMenu(event, note)
        return
    }
}

// 获取当前激活的ID
const activeId = computed(() => {
    if (notesStore.currentNoteId) return notesStore.currentNoteId
    return notesStore.currentFolderId
})

const showFolderContextMenu = (event: MouseEvent, folder: any) => {
    const options = [
        {
            label: '重命名',
            onClick: () => renameFolder(folder)
        },
        {
            label: '删除',
            danger: true,
            onClick: () => deleteFolder(folder)
        }
    ]
    showContextMenu(event, options, { type: 'folder', data: folder })
}

const showNoteContextMenu = (event: MouseEvent, note: any) => {
    const options = [
        {
            label: '重命名',
            onClick: () => renameNote(note)
        },
        {
            label: '删除',
            danger: true,
            onClick: () => deleteNote(note)
        }
    ]
    showContextMenu(event, options, { type: 'note', data: note })
}

const showCreateMenu = (event: MouseEvent) => {
    const options = [
        {
            label: '新建文件夹',
            icon: Folder,
            onClick: () => createNewFolder()
        },
        {
            label: '新建笔记',
            icon: File,
            onClick: () => createNewNote(),
            disabled: !notesStore.currentFolderId
        }
    ]
    showContextMenu(event, options)
}

const createNewFolder = async () => {
    const [FormComponent, formActions] = useForm({
        fields: [
            {
                name: 'name',
                label: '文件夹名称',
                type: 'text',
                placeholder: '请输入文件夹名称',
                required: true
            }
        ],
        onSubmit: (data) => {
            if (data.name) {
                notesStore.createFolder(data.name)
                // 新建文件夹后返回文件夹列表视图
                notesStore.setCurrentFolder(null)
            }
        }
    })

    confirm({
        title: '新建文件夹',
        content: FormComponent,
        onOk: () => {
            formActions.submit()
        }
    })
}

const createNewNote = async () => {
    if (!notesStore.currentFolderId) return

    const [FormComponent, formActions] = useForm({
        fields: [
            {
                name: 'title',
                label: '笔记标题',
                type: 'text',
                placeholder: '请输入笔记标题',
                required: true
            }
        ],
        onSubmit: (data) => {
            if (data.title) {
                const newNote = notesStore.createNote(data.title, notesStore.currentFolderId!)
                notesStore.setCurrentNote(newNote.id)
            }
        }
    })

    confirm({
        title: '新建笔记',
        content: FormComponent,
        onOk: () => {
            formActions.submit()
        }
    })
}

const renameFolder = async (folder: any) => {
    const [FormComponent, formActions] = useForm({
        fields: [
            {
                name: 'name',
                label: '文件夹名称',
                type: 'text',
                placeholder: '请输入新的文件夹名称',
                required: true
            }
        ],
        initialData: { name: folder.name },
        onSubmit: (data) => {
            if (data.name) {
                notesStore.updateFolder(folder.id, data.name)
            }
        }
    })

    confirm({
        title: '重命名文件夹',
        content: FormComponent,
        onOk: () => {
            formActions.submit()
        }
    })
}

const deleteFolder = async (folder: any) => {
    const result = await confirm({
        title: '删除文件夹',
        content: `确定要删除文件夹"${folder.name}"吗？此操作将同时删除该文件夹下的所有笔记。`
    })
    if (result) {
        notesStore.deleteFolder(folder.id)
    }
}

const renameNote = async (note: any) => {
    const [FormComponent, formActions] = useForm({
        fields: [
            {
                name: 'title',
                label: '笔记标题',
                type: 'text',
                placeholder: '请输入新的笔记标题',
                required: true
            }
        ],
        initialData: { title: note.title },
        onSubmit: (data) => {
            if (data.title) {
                notesStore.updateNote(note.id, { title: data.title })
            }
        }
    })

    confirm({
        title: '重命名笔记',
        content: FormComponent,
        onOk: () => {
            formActions.submit()
        }
    })
}

const deleteNote = async (note: any) => {
    const result = await confirm({
        title: '删除笔记',
        content: `确定要删除笔记"${note.title}"吗？`
    })
    if (result) {
        notesStore.deleteNote(note.id)
    }
}


</script>

<template>
    <div class="notes-sidebar" :class="{ 'is-mobile': isMobile }">
        <div v-if="isMobile" class="mobile-header">
            <h1 class="mobile-title">笔记</h1>
        </div>
        <!-- 统一的文件夹和笔记列表 -->
        <ListContainer class="combined-list">
            <List :title="notesStore.currentFolder ? notesStore.currentFolder.name : '笔记'" :items="combinedList"
                :active-id="activeId" :key-field="'id'" :main-field="'name'" :logo-field="'icon'" :selectable="true"
                @select="handleItemClick" @contextmenu="handleContextMenu">
                <template #title-tool>
                    <Button v-if="notesStore.currentFolderId" variant="icon" size="sm" @click="handleBackToFolders"
                        title="返回文件夹列表">
                        <ArrowLeft />
                    </Button>
                    <Button variant="icon" size="sm" @click="showCreateMenu" title="新建">
                        <Plus />
                    </Button>
                </template>
            </List>
        </ListContainer>
    </div>
</template>

<style scoped>
.notes-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-subtle);
    overflow: hidden;
}

.notes-sidebar.is-mobile {
    background-color: #f7f7f8;
}

.mobile-header {
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: #f7f7f8;
    padding: calc(20px + env(safe-area-inset-top, 24px)) 20px 10px;
}

.mobile-title {
    font-size: 28px;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.5px;
}

.combined-list {
    flex: 1;
    overflow-y: auto;
}




/* PC端样式 */
.notes-sidebar:not(.is-mobile) :deep(.list-item) {
    background-color: transparent;
    gap: 10px;
    border-radius: 8px;
    margin: 2px 4px;
    transition: all 0.15s ease;
}

.notes-sidebar:not(.is-mobile) :deep(.list-item:hover) {
    background-color: rgba(0, 0, 0, 0.04);
}

.notes-sidebar:not(.is-mobile) :deep(.list-item.is-active) {
    background: rgba(0, 0, 0, 0.07);
    border-color: transparent;
}

.notes-sidebar:not(.is-mobile) :deep(.main-text) {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
}

.notes-sidebar:not(.is-mobile) :deep(.list-item.is-active .main-text) {
    color: var(--text-primary);
    font-weight: 600;
}

.notes-sidebar:not(.is-mobile) :deep(.media-icon) {
    font-size: 16px;
    color: var(--text-secondary);
}

.notes-sidebar:not(.is-mobile) :deep(.list-item.is-active .media-icon) {
    color: var(--text-primary);
}
</style>