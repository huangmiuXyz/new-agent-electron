<script setup lang="ts">
const { Folder, Refresh, File, FileText, FileImage, FileCode } = useIcon([
    'Folder',
    'Refresh',
    'File',
    'FileText',
    'FileImage',
    'FileCode'
])

const userDataPath = ref('')
const files = ref<any[]>([])
const loading = ref(false)
const activeCategory = ref('all')

const categories = [
    { id: 'all', name: '全部' },
    { id: 'image', name: '图片' },
    { id: 'document', name: '文档' },
    { id: 'data', name: '数据' },
    { id: 'other', name: '其他' }
]

const loadFiles = async () => {
    loading.value = true
    try {
        if (window.api && window.api.getPath) {
            const root = window.api.getPath('userData')
            userDataPath.value = root
            const uploadsDir = window.api.path.join(root, 'Data', 'Files')

            if (window.api.fs.existsSync(uploadsDir)) {
                const fileNames = window.api.fs.readdirSync(uploadsDir)
                const fileList = await Promise.all(fileNames.map(async (name) => {
                    const filePath = window.api.path.join(uploadsDir, name)
                    try {
                        const stats = window.api.fs.statSync(filePath)
                        // Use mime or simple extension check
                        let type = 'unknown'
                        if (window.api.mime) {
                            type = window.api.mime.lookup(name) || 'unknown'
                        } else {
                            const ext = name.split('.').pop()?.toLowerCase()
                            if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) type = 'image/' + ext
                            else if (['txt', 'md', 'pdf', 'doc', 'docx'].includes(ext || '')) type = 'application/' + ext
                        }

                        return {
                            name,
                            path: filePath,
                            size: stats.size,
                            created: stats.birthtimeMs || stats.ctimeMs, // Use timestamp
                            type
                        }
                    } catch (e) {
                        console.warn(`Could not stat file ${name}`, e)
                        return null
                    }
                }))
                files.value = fileList.filter(f => f !== null)
            } else {
                files.value = []
            }
        }
    } catch (e) {
        console.error('Failed to load files', e)
    } finally {
        loading.value = false
    }
}

const categorizedFiles = computed(() => {
    if (activeCategory.value === 'all') return files.value

    return files.value.filter(file => {
        const type = file.type || ''
        const name = file.name.toLowerCase()

        if (activeCategory.value === 'image') return type.startsWith('image')

        if (activeCategory.value === 'document') {
            return type.includes('pdf') || type.includes('word') || type.includes('text') ||
                name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.doc') || name.endsWith('.docx')
        }

        if (activeCategory.value === 'data') {
            return type.includes('json') || type.includes('xml') || type.includes('csv') ||
                name.endsWith('.json') || name.endsWith('.db') || name.endsWith('.sqlite')
        }

        // Other
        if (activeCategory.value === 'other') {
            // messy check but sufficient for now
            const isImage = type.startsWith('image')
            const isDoc = type.includes('pdf') || type.includes('word') || type.includes('text') || name.endsWith('.md') || name.endsWith('.txt')
            const isData = type.includes('json') || name.endsWith('.json')
            return !isImage && !isDoc && !isData
        }

        return true
    })
})

const openFolder = () => {
    if (userDataPath.value) {
        const target = window.api.path.join(userDataPath.value, 'Data', 'Files')
        if (window.api.fs.existsSync(target)) {
            window.api.openFile(target)
        } else {
            window.api.openFile(userDataPath.value)
        }
    }
}

const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString()
}

onMounted(() => {
    loadFiles()
})
</script>

<template>
    <SettingFormContainer header-title="文件管理">
        <template #content>
            <div class="user-data-page">
                <!-- Toolbar -->
                <div class="toolbar">
                    <div class="category-tabs">
                        <Tabs :items="categories" v-model="activeCategory" />
                    </div>

                    <div class="actions">
                        <Button @click="openFolder" size="sm" variant="secondary">
                            <template #icon>
                                <Folder />
                            </template>
                            打开文件夹
                        </Button>
                        <Button @click="loadFiles" size="sm" variant="text">
                            <template #icon>
                                <Refresh />
                            </template>
                        </Button>
                    </div>
                </div>

                <!-- File List -->
                <div class="file-table-wrapper">
                    <Table :loading="loading" :data="categorizedFiles" :columns="[
                        { key: 'name', label: '文件名称', width: '3fr' },
                        { key: 'type', label: '类型', width: '1.5fr' },
                        { key: 'size', label: '大小', width: '1fr' },
                        { key: 'created', label: '创建时间', width: '2fr' }
                    ]">
                        <template #name="{ row }">
                            <div class="file-name-cell">
                                <component
                                    :is="row.type.startsWith('image') ? FileImage : (row.type.includes('json') ? FileCode : (row.type.includes('text') ? FileText : File))"
                                    class="file-icon" />
                                <span class="name-text">{{ row.name }}</span>
                            </div>
                        </template>
                        <template #size="{ row }">
                            {{ formatFileSize(row.size) }}
                        </template>
                        <template #created="{ row }">
                            {{ formatTime(row.created) }}
                        </template>
                    </Table>
                    <div v-if="files.length === 0 && !loading" class="empty-state">
                        <div class="empty-text">暂无文件</div>
                    </div>
                </div>
            </div>
        </template>
    </SettingFormContainer>
</template>

<style scoped>
.user-data-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
}

.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
}


.actions {
    display: flex;
    gap: 8px;
}

.file-table-wrapper {
    flex: 1;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: #fff;
    display: flex;
    flex-direction: column;
}

.file-name-cell {
    display: flex;
    align-items: center;
    gap: 8px;
}

.file-icon {
    width: 16px;
    height: 16px;
    color: var(--text-secondary);
}

.name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.empty-state {
    padding: 40px;
    display: flex;
    justify-content: center;
    color: var(--text-secondary);
}
</style>
