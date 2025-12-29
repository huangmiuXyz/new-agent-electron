<script setup lang="ts">
import { useModal } from '@renderer/composables/useModal'

type FileCategory = 'image' | 'document' | 'data' | 'other'

interface FileItem {
  name: string
  path: string
  size: number
  created: number
  type: string
}

const { Folder, Refresh, Trash } = useIcon([
  'Folder',
  'Refresh',
  'File',
  'FileText',
  'FileImage',
  'FileCode',
  'Trash'
])
const files = ref<FileItem[]>([])
const loading = ref(false)
const activeCategory = ref<'all' | FileCategory>('all')
const deletingFile = ref<string | null>(null)
const modal = useModal()

const categories = [
  { id: 'all', name: '全部' },
  { id: 'image', name: '图片' },
  { id: 'document', name: '文档' },
  { id: 'data', name: '数据' },
  { id: 'other', name: '其他' }
]
const FILE_CATEGORY_RULES: Record<
  FileCategory,
  {
    mimeStartsWith?: string[]
    mimeIncludes?: string[]
    extensions?: string[]
  }
> = {
  image: {
    mimeStartsWith: ['image/'],
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
  },
  document: {
    mimeIncludes: ['pdf', 'word', 'text'],
    extensions: ['txt', 'md', 'pdf', 'doc', 'docx']
  },
  data: {
    mimeIncludes: ['json', 'xml', 'csv'],
    extensions: ['json', 'xml', 'csv', 'db', 'sqlite']
  },
  other: {}
}

function getFileCategory(file: FileItem): FileCategory {
  const name = file.name.toLowerCase()
  const mime = file.type || ''
  const ext = name.split('.').pop() || ''

  for (const [category, rule] of Object.entries(FILE_CATEGORY_RULES)) {
    if (rule.mimeStartsWith?.some((m) => mime.startsWith(m))) {
      return category as FileCategory
    }
    if (rule.mimeIncludes?.some((m) => mime.includes(m))) {
      return category as FileCategory
    }
    if (rule.extensions?.includes(ext)) {
      return category as FileCategory
    }
  }
  return 'other'
}

const loadFiles = async () => {
  loading.value = true
  try {
    const dir = uploadDir

    if (!window.api.fs.existsSync(dir)) {
      files.value = []
      return
    }

    const names = window.api.fs.readdirSync(dir)

    files.value = names.map((name) => {
      const filePath = window.api.path.join(dir, name)
      const stat = window.api.fs.statSync(filePath)

      const type = window.api.mime
        ? window.api.mime.lookup(name) || 'application/octet-stream'
        : 'application/octet-stream'

      return {
        name,
        path: filePath,
        size: stat.size,
        created: stat.birthtimeMs || stat.ctimeMs,
        type
      }
    })
  } catch (e) {
    console.error('load files failed', e)
    files.value = []
  } finally {
    loading.value = false
  }
}
const categorizedFiles = computed(() => {
  if (activeCategory.value === 'all') return files.value
  return files.value.filter((f) => getFileCategory(f) === activeCategory.value)
})

const openFolder = (path?: string) => {
  window.api.shell.openPath(path || uploadDir)
}

const formatTime = (ts: number) => new Date(ts).toLocaleString()

const deleteFile = async (file: FileItem) => {
  const confirmed = await modal.confirm({
    title: '删除文件',
    content: `确定要删除文件${file.name}吗？`,
    confirmProps: {
      danger: true
    }
  })

  if (confirmed) {
    deletingFile.value = file.name
    try {
      if (window.api.fs.existsSync(file.path)) {
        window.api.fs.unlinkSync(file.path)
        // 从文件列表中移除
        files.value = files.value.filter((f) => f.path !== file.path)
      }
    } catch (error) {
      console.error('删除文件失败:', error)
    } finally {
      deletingFile.value = null
    }
  }
}

onMounted(loadFiles)
</script>

<template>
  <FormContainer header-title="文件管理">
    <template #content>
      <div class="user-data-page">
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="category-tabs">
            <Tabs :items="categories" v-model="activeCategory" />
          </div>

          <div class="actions">
            <Button @click="openFolder()" size="sm" variant="secondary">
              <template #icon>
                <Folder />
              </template>
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
            { key: 'name', label: '文件名称', width: 'auto' },
            { key: 'type', label: '类型', width: 60 },
            { key: 'size', label: '大小', width: 80 },
            { key: 'created', label: '创建时间', width: 200 },
            { key: 'actions', label: '操作', width: 'auto' }
          ]">
            <template #name="{ row }">
              <div class="file-name-cell">
                <Button @click="openFolder(row.path)" variant="text" size="sm" class="name-text">
                  <template #icon>
                    <component :is="useIcon(
                      getFileIcon({
                        name: row.name,
                        mediaType: row.type
                      })
                    )
                      " class="file-icon" />
                  </template>
                  {{ row.name }}
                </Button>
              </div>
            </template>
            <template #size="{ row }">
              {{ formatFileSize(row.size) }}
            </template>
            <template #created="{ row }">
              {{ formatTime(row.created) }}
            </template>
            <template #actions="{ row }">
              <Button @click="deleteFile(row)" size="sm" variant="text" :loading="deletingFile === row.name"
                class="delete-btn">
                <template #icon>
                  <Trash />
                </template>
              </Button>
            </template>
          </Table>
          <div v-if="files.length === 0 && !loading" class="empty-state">
            <div class="empty-text">暂无文件</div>
          </div>
        </div>
      </div>
    </template>
  </FormContainer>
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
  gap: 12px;
}

.category-tabs {
  display: flex;
  min-width: 0;
  overflow: hidden;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.file-table-wrapper {
  flex: 1;
  overflow: hidden;
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

.delete-btn {
  color: var(--color-danger);
}

.delete-btn:hover {
  background-color: rgba(220, 53, 69, 0.1);
}

.warning-text {
  color: var(--color-danger);
  font-size: 12px;
  margin-top: 8px;
}
</style>
