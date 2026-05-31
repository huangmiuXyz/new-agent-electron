<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'
import { copyElementImageToClipboard } from '@renderer/utils'
import { formatTime } from '@renderer/utils/time'

const { Plus, ArrowLeft, Folder, File, ChevronRight, Image } = useIcon([
    'Plus',
    'MoreHorizontal',
    'ArrowLeft',
    'Folder',
    'File',
    'ChevronRight',
    'Image'
])

const notesStore = useNotesStore()
const { confirm } = useModal()
const router = useRouter()

const { showContextMenu } = useContextMenu()

type NoteListItem = {
    id: string
    name: string
    type: 'folder' | 'note'
    icon: NonNullable<typeof File>
    content: string
    createdAt: number
    updatedAt: number
}

const toTimestamp = (value: Date | string | number) => {
    if (typeof value === 'number') return value
    return new Date(value).getTime()
}

// 初始化数据
onMounted(() => {
    notesStore.initializeData()
    // 只有在非移动端时才清除 currentFolderId，或者如果当前没有选中文件夹
    if (!isMobile.value && !notesStore.currentFolderId) {
        notesStore.setCurrentFolder(null)
    }
})


const handleFolderSelect = (folderId: string) => {
    notesStore.setCurrentFolder(folderId)
}

const handleNoteSelect = (noteId: string) => {
    notesStore.setCurrentNote(noteId)
    if (isMobile.value) {
        router.push('/mobile/notes/editor')
    }
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
const combinedList = computed<NoteListItem[]>(() => {
    return notesStore.orderedItemsInCurrentScope.map((item) => {
        if ('content' in item) {
            return {
                id: item.id,
                name: item.title,
                type: 'note',
                icon: File!,
                content: item.content,
                createdAt: toTimestamp(item.createdAt),
                updatedAt: toTimestamp(item.updatedAt)
            }
        }

        return {
            id: item.id,
            name: item.name,
            type: 'folder',
            icon: Folder!,
            content: '',
            createdAt: toTimestamp(item.createdAt),
            updatedAt: toTimestamp(item.updatedAt)
        }
    })
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

// 获取笔记预览内容
const getNotePreview = (content: string) => {
    if (!content) return '无内容'
    // 移除 markdown 标签等，简单取前 50 个字符
    return content.replace(/[#*`]/g, '').slice(0, 50).trim() || '无内容'
}

// 获取文件夹下的项目数量
const getFolderItemCount = (folderId: string) => {
    const notesCount = notesStore.notes.filter(n => n.folderId === folderId).length
    const subFoldersCount = notesStore.folders.filter(f => f.parentId === folderId).length
    return notesCount + subFoldersCount
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

const handleItemSort = ({ fromId, toId, after }: { fromId: string; toId: string; after: boolean }) => {
    notesStore.moveItem(fromId, toId, after)
}

const showNoteContextMenu = (event: MouseEvent, note: any) => {
    const options = [
        {
            label: '发送到知识库',
            onClick: () => sendToKnowledgeBase('note', note)
        },
        {
            label: '复制为图片',
            icon: Image,
            onClick: () => copyNoteAsImage(note)
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

const getFolderPathText = (folderId: string | null) => {
    if (!folderId) return '根目录'
    return notesStore.folderPath(folderId).map(folder => folder.name).join(' / ') || '根目录'
}

const waitForImages = async (element: HTMLElement) => {
    const images = Array.from(element.querySelectorAll('img'))
    await Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve()
        return new Promise<void>((resolve) => {
            image.onload = () => resolve()
            image.onerror = () => resolve()
        })
    }))
}

const createNoteImageElement = (note: any) => {
    const shell = document.createElement('article')
    shell.className = 'note-image-card'

    const title = document.createElement('h1')
    title.className = 'note-image-title'
    title.textContent = note.title || '未命名笔记'

    const meta = document.createElement('div')
    meta.className = 'note-image-meta'
    meta.textContent = `${getFolderPathText(note.folderId)} · ${formatTime(note.updatedAt || note.createdAt)}`

    const divider = document.createElement('div')
    divider.className = 'note-image-divider'

    const content = document.createElement('div')
    content.className = 'note-image-content'
    content.innerHTML = note.content || '<p>无内容</p>'

    shell.append(title, meta, divider, content)
    return shell
}

const copyNoteAsImage = async (note: any) => {
    const element = createNoteImageElement(note)
    document.body.appendChild(element)
    const closeLoading = messageApi.loading('正在复制笔记图片...')

    try {
        await document.fonts?.ready
        await waitForImages(element)

        const copied = await copyElementImageToClipboard(element, {
            backgroundColor: '#ffffff',
            width: element.scrollWidth
        })

        closeLoading()

        if (copied) {
            messageApi.success('已复制笔记图片')
            return
        }

        messageApi.error('复制笔记图片失败')
    } catch (error) {
        closeLoading()
        console.error('复制笔记图片失败:', error)
        messageApi.error('复制笔记图片失败')
    } finally {
        element.remove()
    }
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
        <!-- 统一的文件夹和笔记列表 -->
        <ListContainer class="combined-list">
            <List :title="notesStore.currentFolder ? notesStore.currentFolder.name : '笔记'" :items="combinedList"
                :active-id="activeId!" :key-field="'id'" :main-field="'name'" :logo-field="'icon'" :selectable="true"
                :item-height="isMobile ? 72 : 35" :sortable="true" :long-press-ms="650" @select="handleItemClick"
                @contextmenu="handleContextMenu" @sort="handleItemSort">
                <template #title-tool>
                    <Button v-if="notesStore.currentFolderId" variant="icon" size="sm" @click="handleBackToFolders"
                        title="返回上一级">
                        <ArrowLeft />
                    </Button>
                    <Button variant="icon" size="sm" @click="showCreateMenu" title="新建">
                        <Plus />
                    </Button>
                </template>

                <template #main="{ item }">
                    <!-- Mobile Premium Layout -->
                    <div v-if="isMobile" class="note-row" :class="{ 'is-folder': item.type === 'folder' }">
                        <div class="icon-container" :class="item.type">
                            <component :is="item.icon" />
                        </div>
                        <div class="content-container">
                            <div class="top-row">
                                <span class="note-name">{{ item.name }}</span>
                                <span class="note-time">{{ formatTime(item.updatedAt || item.createdAt) }}</span>
                            </div>
                            <div class="bottom-row">
                                <p v-if="item.type === 'note'" class="note-preview-text">
                                    {{ getNotePreview(item.content) }}
                                </p>
                                <p v-else class="note-preview-text">
                                    {{ getFolderItemCount(item.id) }} 个项目
                                </p>
                            </div>
                        </div>
                        <div v-if="item.type === 'folder'" class="chevron-container">
                            <ChevronRight />
                        </div>
                    </div>
                    <!-- PC Original Minimalist Layout -->
                    <div v-else class="note-title-container">
                        <span class="note-title">{{ item.name }}</span>
                    </div>
                </template>
            </List>
        </ListContainer>
    </div>
</template>

<style scoped>
.notes-sidebar {
    height: 100%;
    width: 100%;
    background: var(--bg-sidebar-surface);
}

.notes-sidebar:not(.is-mobile) :deep(.list-container),
.notes-sidebar:not(.is-mobile) :deep(.list-scroll-area) {
    background: transparent;
}

.notes-sidebar:not(.is-mobile) :deep(.list-item) {
    height: 35px !important;
    min-height: 35px !important;
    margin-bottom: 2px !important;
    padding: 8px !important;
    border-radius: var(--radius-sm);
    transition: background-color 0.2s;
    background-color: transparent;
}

.notes-sidebar:not(.is-mobile) :deep(.list-item:hover) {
    background-color: var(--bg-hover);
}

.notes-sidebar:not(.is-mobile) :deep(.list-item.is-active) {
    background-color: var(--bg-active) !important;
}

.combined-list {
    height: 100%;
    width: 100% !important;
}

/* Mobile Styles */
.notes-sidebar.is-mobile {
    background-color: var(--bg-card);
    width: 100% !important;
    display: flex;
    flex-direction: column;
}

.notes-sidebar.is-mobile :deep(.list-container) {
    padding: 0;
}

.notes-sidebar.is-mobile :deep(.list-header) {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
}

.notes-sidebar.is-mobile :deep(.list-item) {
    padding: 0 !important;
    background: transparent !important;
    margin: 0 !important;
    height: auto !important;
    border-radius: 0 !important;
    width: 100% !important;
    display: block !important;
}

.notes-sidebar.is-mobile :deep(.item-content) {
    width: 100% !important;
    max-width: none !important;
    flex: none !important;
}

.notes-sidebar.is-mobile :deep(.item-actions),
.notes-sidebar.is-mobile :deep(.item-media) {
    display: none !important;
}

.note-row {
    display: flex;
    width: 100%;
    padding: 12px 16px;
    gap: 12px;
    position: relative;
    background: var(--bg-sidebar-surface);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    align-items: center;
}

.note-row::after {
    content: '';
    position: absolute;
    bottom: 0;
    right: 0;
    left: 56px;
    height: 0.5px;
    background-color: var(--border-color);
    transition: opacity 0.2s;
    opacity: 0.5;
}

.note-row:active {
    background-color: var(--bg-active);
}

.icon-container {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}

.icon-container.folder {
    background-color: rgba(var(--color-warning-rgb, 255, 193, 7), 0.15);
    color: var(--color-warning, #ffc107);
}

.icon-container.note {
    background-color: rgba(var(--color-primary-rgb, 33, 150, 243), 0.15);
    color: var(--color-primary, #2196f3);
}

.content-container {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
}

.top-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
}

.note-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.note-time {
    font-size: 12px;
    color: var(--text-tertiary);
}

.note-preview-text {
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.chevron-container {
    color: var(--text-tertiary);
    font-size: 16px;
    display: flex;
    align-items: center;
}

/* PC Styles */
.note-title-container {
    display: flex;
    align-items: center;
    height: 100%;
    width: 100%;
}

.note-title {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

:global(.note-image-card) {
    position: fixed;
    left: -10000px;
    top: 0;
    width: 720px;
    padding: 44px 52px;
    background: #ffffff;
    color: #1f2937;
    border: 1px solid #e5e7eb;
    box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.75;
    box-sizing: border-box;
}

:global(.note-image-title) {
    margin: 0;
    color: #111827;
    font-size: 30px;
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: 0;
    overflow-wrap: anywhere;
}

:global(.note-image-meta) {
    margin-top: 10px;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.5;
}

:global(.note-image-divider) {
    height: 1px;
    margin: 26px 0 28px;
    background: #e5e7eb;
}

:global(.note-image-content) {
    color: #1f2937;
    font-size: 16px;
    overflow-wrap: anywhere;
}

:global(.note-image-content > :first-child) {
    margin-top: 0;
}

:global(.note-image-content > :last-child) {
    margin-bottom: 0;
}

:global(.note-image-content p) {
    margin: 0 0 16px;
    line-height: 1.85;
}

:global(.note-image-content h1),
:global(.note-image-content h2),
:global(.note-image-content h3) {
    margin: 28px 0 14px;
    color: #111827;
    line-height: 1.45;
    letter-spacing: 0;
}

:global(.note-image-content h1) {
    font-size: 26px;
}

:global(.note-image-content h2) {
    font-size: 23px;
}

:global(.note-image-content h3) {
    font-size: 20px;
}

:global(.note-image-content ul),
:global(.note-image-content ol) {
    margin: 0 0 16px;
    padding-left: 24px;
}

:global(.note-image-content li) {
    margin: 6px 0;
}

:global(.note-image-content blockquote) {
    margin: 18px 0;
    padding: 2px 0 2px 16px;
    color: #4b5563;
    border-left: 4px solid #cbd5e1;
}

:global(.note-image-content pre) {
    margin: 18px 0;
    padding: 16px;
    overflow: hidden;
    color: #e5e7eb;
    background: #111827;
    border-radius: 8px;
    white-space: pre-wrap;
}

:global(.note-image-content code) {
    padding: 2px 5px;
    color: #be123c;
    background: #fff1f2;
    border-radius: 4px;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 0.92em;
}

:global(.note-image-content pre code) {
    padding: 0;
    color: inherit;
    background: transparent;
}

:global(.note-image-content img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
}

:global(.note-image-content table) {
    width: 100%;
    margin: 18px 0;
    border-collapse: collapse;
}

:global(.note-image-content th),
:global(.note-image-content td) {
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    text-align: left;
}

:global(.note-image-content th) {
    background: #f3f4f6;
    font-weight: 700;
}
</style>
