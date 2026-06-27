<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { useAgentStore } from '@renderer/stores/agent'
import { useChatsStores } from '@renderer/stores/chats'
import { useKnowledgeStore } from '@renderer/stores/knowledge'
import { useNotesStore } from '@renderer/stores/notes'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { chatRepository } from '@renderer/services/chatRepository'

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const chatsStore = useChatsStores()
const knowledgeStore = useKnowledgeStore()
const notesStore = useNotesStore()

const { Download, Upload, Trash } = useIcon(['Download', 'Upload', 'Trash'])
const modal = useModal()
const message = messageApi

const isNativePlatform = Capacitor.isNativePlatform()

const buildBackupData = async () => {
  const sqliteData = await window.api.sqlite.getAllChunks()
  return {
    settings: settingsStore.$state,
    agent: agentStore.$state,
    chatsSnapshot: await chatRepository.exportSnapshot({
      summaries: chatsStore.chatSummaries,
      activeChatId: chatsStore.activeChatId,
      chatDrafts: chatsStore.chatDrafts
    }),
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
}

const exportDataWeb = async (jsonStr: string) => {
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `agent-qi-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const exportDataNative = async (jsonStr: string) => {
  const fileName = `agent-qi-backup-${new Date().toISOString().split('T')[0]}.json`
  const result = await Filesystem.writeFile({
    path: fileName,
    data: jsonStr,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true
  })
  await Share.share({
    title: fileName,
    url: result.uri,
    dialogTitle: '导出备份文件'
  })
  await Filesystem.deleteFile({
    path: fileName,
    directory: Directory.Cache
  })
}

const exportData = async () => {
  try {
    const backupData = await buildBackupData()
    const jsonStr = JSON.stringify(backupData, null, 2)

    if (isNativePlatform) {
      await exportDataNative(jsonStr)
    } else {
      await exportDataWeb(jsonStr)
    }

    message.success('导出备份成功')
  } catch (error) {
    console.error('导出备份失败:', error)
    message.error('导出备份失败')
  }
}

const restoreFromData = async (data: any) => {
  if (!data.settings || !data.agent) {
    throw new Error('无效的备份文件')
  }

  if (data.settings) {
    settingsStore.$patch(data.settings)
  }

  if (data.agent) {
    agentStore.$patch(data.agent)
  }

  if (data.chatsSnapshot) {
    if (data.chatsSnapshot.summaries) {
      chatsStore.chatSummaries = data.chatsSnapshot.summaries
    }
    if (data.chatsSnapshot.activeChatId !== undefined) {
      chatsStore.activeChatId = data.chatsSnapshot.activeChatId
    }
    if (data.chatsSnapshot.chatDrafts) {
      chatsStore.chatDrafts = data.chatsSnapshot.chatDrafts
    }
    await chatRepository.importSnapshot(data.chatsSnapshot)
    await chatsStore.initializeChatsStore()
  }

  if (data.knowledge) {
    knowledgeStore.$patch(data.knowledge)
  }

  if (data.notes) {
    notesStore.folders = data.notes.folders || []
    notesStore.notes = data.notes.notes || []
    notesStore.saveToStorage()
  }

  if (data.localStorage) {
    Object.keys(data.localStorage).forEach((key) => {
      localStorage.setItem(key, data.localStorage[key])
    })
  }

  if (data.sqlite && Array.isArray(data.sqlite)) {
    await window.api.sqlite.upsertChunks(data.sqlite)
  }

  const { restorePlugins } = usePlugins()
  await restorePlugins()
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
        await restoreFromData(data)
        message.success('导入备份成功')
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

const importDataNative = async () => {
  const confirmed = await modal.confirm({
    title: '导入备份',
    content: '导入备份将覆盖当前的所有数据（设置、智能体、聊天记录、知识库配置、笔记），确定要继续吗？',
    confirmProps: {
      danger: true
    }
  })

  if (!confirmed) return

  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)
        await restoreFromData(data)
        message.success('导入备份成功')
      } catch (err) {
        console.error('解析备份文件失败:', err)
        message.error('解析备份文件失败: ' + (err as Error).message)
      }
    }
    input.click()
  } catch (error) {
    console.error('读取文件失败:', error)
    message.error('读取文件失败')
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
    chatsStore.chatSummaries = []
    chatsStore.activeChatId = null
    chatsStore.chatDrafts = {}
    await chatRepository.clearAllChatMessages()
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
      <div class="settings-page-wrapper">
      <div class="backup-page">
        <Card padding="20px">
          <div class="setting-item">
            <div class="item-info">
              <div class="item-title">导出数据</div>
              <div class="item-desc">将您的所有数据（包括设置、智能体、聊天记录、知识库配置和笔记）导出为一个 JSON 文件，以便在其他设备上恢复或作为备份。</div>
            </div>
            <Button @click="exportData" variant="secondary">
              <template #icon>
                <Download />
              </template>
              导出备份文件
            </Button>
          </div>
        </Card>

        <Card padding="20px">
          <div class="setting-item">
            <div class="item-info">
              <div class="item-title">导入数据</div>
              <div class="item-desc">从之前导出的 JSON 文件中恢复数据。注意：这将覆盖您当前的所有数据。</div>
            </div>
            <div class="upload-wrapper">
              <Button v-if="isNativePlatform" variant="secondary" @click="importDataNative">
                <template #icon>
                  <Upload />
                </template>
                导入备份文件
              </Button>
              <Button v-else variant="secondary">
                <template #icon>
                  <Upload />
                </template>
                导入备份文件
                <input type="file" accept=".json" @change="importData" class="file-input" />
              </Button>
            </div>
          </div>
        </Card>

        <Card padding="20px" :border="true" background="transparent">
          <div class="setting-item">
            <div class="item-info">
              <div class="item-title danger">重置所有数据</div>
              <div class="item-desc">清除应用中的所有数据并恢复到初始状态。此操作不可撤销。</div>
            </div>
            <Button @click="resetData" variant="text" danger>
              <template #icon>
                <Trash />
              </template>
              重置应用数据
            </Button>
          </div>
        </Card>
      </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.backup-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.item-title.danger {
  color: var(--color-danger);
}

.item-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
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

@media (max-width: 640px) {
  .setting-item {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
}
</style>
