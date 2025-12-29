<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'

const { Plus, ArrowLeft, Folder, File } = useIcon([
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
    if (notesStore.currentFolder) {
        // 如果当前文件夹有父文件夹，则返回到父文件夹
        if (notesStore.currentFolder.parentId) {
            notesStore.setCurrentFolder(notesStore.currentFolder.parentId)
        } else {
            // 否则返回到根目录
            notesStore.setCurrentFolder(null)
        }
    }
}

// 合并文件夹和笔记到一个列表
const combinedList = computed(() => {
    const items: any[] = []

    // 如果有当前文件夹，显示该文件夹下的子文件夹和笔记
    if (notesStore.currentFolderId) {
        // 先显示子文件夹
        notesStore.currentSubFolders.forEach(folder => {
            items.push({
                id: folder.id,
                name: folder.name,
                type: 'folder',
                icon: Folder,
                createdAt: folder.createdAt,
                updatedAt: folder.updatedAt
            })
        })

        // 再显示笔记
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
        // 没有选中文件夹时，显示所有根文件夹
        notesStore.rootFolders.forEach(folder => {
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

const showNoteContextMenu = (event: MouseEvent, note: any) => {
    const options = [
        {
            label: '发送到知识库',
            onClick: () => sendToKnowledgeBase('note', note)
        },
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
            onClick: () => createNewFolder(notesStore.currentFolderId)
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

// 显示文件夹右键菜单
const showFolderContextMenu = (event: MouseEvent, folder: any) => {
    const options = [
        {
            label: '发送到知识库',
            onClick: () => sendToKnowledgeBase('folder', folder)
        },
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

const createNewFolder = async (parentId: string | null = null) => {
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
                notesStore.createFolder(data.name, parentId)
                if (!parentId) {
                    notesStore.setCurrentFolder(null)
                }
            }
        }
    })

    await confirm({
        title: parentId ? '新建子文件夹' : '新建文件夹',
        content: FormComponent,
    })
        && formActions.submit()
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

    await confirm({
        title: '新建笔记',
        content: FormComponent,

    }) && formActions.submit()
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

    await confirm({
        title: '重命名文件夹',
        content: FormComponent,
    }) && formActions.submit()
}

const deleteFolder = async (folder: any) => {
    await confirm({
        title: '删除文件夹',
        content: `确定要删除文件夹"${folder.name}"吗？此操作将同时删除该文件夹及其所有子文件夹下的笔记。`
    }) &&
        notesStore.deleteFolder(folder.id)
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

    await confirm({
        title: '重命名笔记',
        content: FormComponent,
    }) &&
        formActions.submit()
}

const deleteNote = async (note: any) => {
    await confirm({
        title: '删除笔记',
        content: `确定要删除笔记"${note.title}"吗？`
    }) && notesStore.deleteNote(note.id)
}

// 发送到知识库
const sendToKnowledgeBase = async (type: 'note' | 'folder', item: any) => {
    const { knowledgeBases } = useKnowledgeStore()

    if (knowledgeBases.length === 0) {
        await confirm({
            title: '提示',
            content: '当前没有知识库。请先在设置中创建知识库。'
        })
        return
    }

    const knowledgeBaseOptions = knowledgeBases.map(kb => ({
        label: kb.name,
        value: kb.id
    }))

    const [FormComponent, formActions] = useForm({
        fields: [
            {
                name: 'knowledgeBaseId',
                label: '选择知识库',
                type: 'select',
                options: knowledgeBaseOptions,
                required: true
            }
        ],
        onSubmit: async (data) => {
            if (data.knowledgeBaseId) {
                const knowledgeBase = knowledgeBases.find(kb => kb.id === data.knowledgeBaseId)
                if (knowledgeBase) {
                    await notesStore.sendToKnowledgeBase(type, item, knowledgeBase)
                }
            }
        }
    })

    const title = type === 'note' ? `发送笔记"${item.title}"到知识库` : `发送文件夹"${item.name}"到知识库`
    formActions.setFieldValue('knowledgeBaseId', knowledgeBases[0].id)
    await confirm({
        title,
        content: FormComponent
    }) && formActions.submit()
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
                :active-id="activeId!" :key-field="'id'" :main-field="'name'" :logo-field="'icon'" :selectable="true"
                @select="handleItemClick" @contextmenu="handleContextMenu">
                <template #title-tool>
                    <Button v-if="notesStore.currentFolderId" variant="icon" size="sm" @click="handleBackToFolders"
                        title="返回上一级">
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
:deep(.list-item) {
    height: 32px;
}

.notes-sidebar {
    height: 100%;
}

.combined-list {
    height: 100%;
}
</style>