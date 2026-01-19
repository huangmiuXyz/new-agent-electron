<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { useAgentStore } from '@renderer/stores/agent'
import { useChatsStores } from '@renderer/stores/chats'
import { useKnowledgeStore } from '@renderer/stores/knowledge'
import { useNotesStore } from '@renderer/stores/notes'

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const chatsStore = useChatsStores()
const knowledgeStore = useKnowledgeStore()
const notesStore = useNotesStore()

const { Download, Upload, Trash } = useIcon(['Download', 'Upload', 'Trash'])
const modal = useModal()
const message = messageApi

const exportData = async () => {
  try {
      const sqliteData = await window.api.sqlite.getAllChunks()
      const backupData = {
        settings: settingsStore.$state,
        agent: agentStore.$state,
        chats: chatsStore.$state,
        knowledge: knowledgeStore.$state,
        notes: {
          folders: notesStore.folders,
          notes: notesStore.notes
        },
        localStorage: { ...localStorage },
        sqlite: sqliteData,
        version: '1.0.0',
        timestamp: Date.now()
      }

    const jsonStr = JSON.stringify(backupData, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `agent-qi-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    message.success('导出备份成功')
  } catch (error) {
    console.error('导出备份失败:', error)
    message.error('导出备份失败')
  }
}

const importData = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const confirmed = await modal.confirm({
    title: '导入备份',
    content: '导入备份将覆盖当前的所有数据（设置、智能体、聊天记录、知识库配置、笔记），确定要继续吗？',
    confirmProps: {
      danger: true
    }
  })

  if (!confirmed) {
    target.value = ''
    return
  }

  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)

        // Basic validation
        if (!data.settings || !data.agent) {
          throw new Error('无效的备份文件')
        }

        // Restore Settings
        if (data.settings) {
          settingsStore.$patch(data.settings)
        }

        // Restore Agents
        if (data.agent) {
          agentStore.$patch(data.agent)
        }

        // Restore Chats
        if (data.chats) {
          chatsStore.$patch(data.chats)
        }

        // Restore Knowledge
        if (data.knowledge) {
          knowledgeStore.$patch(data.knowledge)
        }

        // Restore Notes
        if (data.notes) {
          notesStore.folders = data.notes.folders || []
          notesStore.notes = data.notes.notes || []
          notesStore.saveToStorage()
        }

        // Restore localStorage
        if (data.localStorage) {
          Object.keys(data.localStorage).forEach((key) => {
            localStorage.setItem(key, data.localStorage[key])
          })
        }

        // Restore SQLite Chunks
        if (data.sqlite && Array.isArray(data.sqlite)) {
          await window.api.sqlite.upsertChunks(data.sqlite)
        }

        message.success('导入备份成功，请重启应用以确保所有更改生效')

        // Optionally reload the page
        // window.location.reload()
      } catch (err) {
        console.error('解析备份文件失败:', err)
        message.error('解析备份文件失败: ' + (err as Error).message)
      }
    }
    reader.readAsText(file)
  } catch (error) {
    console.error('读取文件失败:', error)
    message.error('读取文件失败')
  } finally {
    target.value = ''
  }
}

const resetData = async () => {
  const confirmed = await modal.confirm({
    title: '重置所有数据',
    content: '此操作将清除所有设置、智能体、聊天记录、知识库配置和笔记，且不可恢复。确定要重置吗？',
    confirmProps: {
      danger: true
    }
  })

  if (confirmed) {
    localStorage.clear()
    settingsStore.$reset()
    agentStore.$reset()
    chatsStore.$reset()
    knowledgeStore.$reset()
    notesStore.folders = []
    notesStore.notes = []
    notesStore.saveToStorage()

    message.success('数据已重置')
    window.location.reload()
  }
}

</script>

<template>
  <FormContainer header-title="备份与恢复">
    <template #content>
      <div class="backup-page">
        <div class="backup-section">
          <div class="section-info">
            <h3 class="section-title">导出数据</h3>
            <p class="section-desc">将您的所有数据（包括设置、智能体、聊天记录、知识库配置和笔记）导出为一个 JSON 文件，以便在其他设备上恢复或作为备份。</p>
          </div>
          <div class="section-action">
            <Button @click="exportData" variant="secondary">
              <template #icon>
                <Download />
              </template>
              导出备份文件
            </Button>
          </div>
        </div>

        <div class="backup-section">
          <div class="section-info">
            <h3 class="section-title">导入数据</h3>
            <p class="section-desc">从之前导出的 JSON 文件中恢复数据。注意：这将覆盖您当前的所有数据。</p>
          </div>
          <div class="section-action">
            <div class="upload-wrapper">
              <Button variant="secondary" class="upload-btn">
                <template #icon>
                  <Upload />
                </template>
                导入备份文件
                <input type="file" accept=".json" @change="importData" class="file-input" />
              </Button>
            </div>
          </div>
        </div>

        <div class="backup-section danger">
          <div class="section-info">
            <h3 class="section-title">重置所有数据</h3>
            <p class="section-desc">清除应用中的所有数据并恢复到初始状态。此操作不可撤销。</p>
          </div>
          <div class="section-action">
            <Button @click="resetData" variant="text" class="reset-btn">
              <template #icon>
                <Trash />
              </template>
              重置应用数据
            </Button>
          </div>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.backup-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 0;
}

.backup-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  background: var(--bg-sidebar);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  gap: 24px;
}

.backup-section.danger {
  border-color: rgba(220, 53, 69, 0.2);
}

.section-info {
  flex: 1;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.section-action {
  flex-shrink: 0;
}

.upload-wrapper {
  position: relative;
}

.file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.reset-btn {
  color: var(--color-danger);
}

.reset-btn:hover {
  background: rgba(220, 53, 69, 0.1);
}

@media (max-width: 640px) {
  .backup-section {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
}
</style>
