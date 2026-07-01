<script setup lang="ts">
import List from '@renderer/components/List.vue'
import Switch from '@renderer/components/Switch.vue'
import ChatInput from '@renderer/pages/chat/message/Input/index.vue'

const settingsStore = useSettingsStore()
const { display } = storeToRefs(settingsStore)

type InputButtonId =
  | 'upload'
  | 'inputAudio'
  | 'thinking'
  | 'settings'
  | 'toolFeatures'
  | 'tokenUsage'
  | 'voice'
  | 'speech'
  | 'stop'
  | 'agent'
  | 'model'
  | 'chatSwitcher'
  | 'workpath'
  | 'mcpResources'

interface InputButtonItem {
  id: InputButtonId
  visible: boolean
}

const buttonLabelMap: Record<InputButtonId, string> = {
  upload: '上传文件',
  inputAudio: '录入音频',
  thinking: '思考模式',
  settings: '参数设置',
  toolFeatures: '工具开关',
  tokenUsage: 'Token 统计',
  voice: '语音输入',
  speech: '语音播报',
  stop: '停止生成',
  agent: '智能体选择',
  model: '模型选择',
  chatSwitcher: '聊天列表',
  workpath: '工作路径',
  mcpResources: 'MCP 资源'
}

// 适配 List 组件的列表项：把 store 的 layout 映射成带 name/hint 的视图数据
interface ButtonListItem {
  id: InputButtonId
  name: string
  hint: string
  visible: boolean
}

const listItems = computed<ButtonListItem[]>(() => {
  const layout = (display.value.inputButtonLayout || []) as InputButtonItem[]
  // 顶栏按钮（agent/model/workpath）固定在最上方
  const topIds = ['agent', 'model', 'workpath']
  const sorted = [...layout]
  const topItems: InputButtonItem[] = []
  for (const id of topIds) {
    const idx = sorted.findIndex((i) => i.id === id)
    if (idx !== -1) {
      topItems.push(...sorted.splice(idx, 1))
    }
  }
  sorted.unshift(...topItems)
  return sorted.map((item) => ({
    id: item.id,
    name: buttonLabelMap[item.id] || item.id,
    hint: '',
    visible: item.visible
  }))
})

// List emit sort 后，根据 fromId/toId/after 重排并写回 store
const handleSort = ({ fromId, toId, after }: { fromId: string; toId: string; after: boolean }) => {
  const layout = (display.value.inputButtonLayout || []) as InputButtonItem[]
  const fromIndex = layout.findIndex((i) => i.id === fromId)
  if (fromIndex === -1) return
  const next = [...layout]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return
  const toIndex = next.findIndex((i) => i.id === toId)
  if (toIndex === -1) return
  next.splice(after ? toIndex + 1 : toIndex, 0, moved)
  // 顶栏按钮（agent/model/workpath）始终固定在最上方
  const topIds = ['agent', 'model', 'workpath']
  const topItems: InputButtonItem[] = []
  for (const id of topIds) {
    const idx = next.findIndex((i) => i.id === id)
    if (idx !== -1) {
      topItems.push(...next.splice(idx, 1))
    }
  }
  next.unshift(...topItems)
  settingsStore.updateInputButtonLayout(next)
}

const toggleVisible = (item: ButtonListItem, value: boolean) => {
  const layout = (display.value.inputButtonLayout || []) as InputButtonItem[]
  const next = layout.map((i) =>
    i.id === item.id ? { ...i, visible: value } : i
  )
  settingsStore.updateInputButtonLayout(next)
}

const resetToDefault = () => {
  settingsStore.resetInputButtonLayout()
}
</script>

<template>
  <div class="input-button-config">
    <div class="config-header">
      <div class="config-header-title">
        <span>输入框按钮管理</span>
      </div>
      <button class="reset-btn" type="button" @click="resetToDefault">恢复默认</button>
    </div>

    <div class="config-body">
      <!-- 左：按钮排序（可滚动，拖拽手柄模式） -->
      <div class="config-panel config-panel-left">
        <div class="button-list">
          <List
            :items="listItems"
            key-field="id"
            main-field="name"
            sub-field=""
            :selectable="false"
            :sortable="true"
            sort-mode="handle"
            :is-disabled="(item: ButtonListItem) => !item.visible"
            :can-sort-item="(item: ButtonListItem) => item.visible && !['agent', 'model', 'workpath'].includes(item.id)"
            @sort="handleSort"
          >
            <template #actions="{ item }">
              <Switch
                :model-value="item.visible"
                size="sm"
                @update:model-value="(v: boolean | undefined) => toggleVisible(item, !!v)"
              />
            </template>
          </List>
        </div>
      </div>

      <!-- 右：实时预览 -->
      <div class="config-panel config-panel-right">
        <div class="preview-box">
          <!-- 复用聊天输入框组件，屏蔽所有交互 -->
          <div
            class="input-preview-wrapper"
            @click.capture.stop.prevent
            @pointerdown.capture.stop.prevent
            @mousedown.capture.stop.prevent
          >
            <ChatInput preview />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-button-config {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-header-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.config-header-title > span:first-child {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.config-header-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

.reset-btn {
  font-size: 12px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.reset-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.config-body {
  display: flex;
  gap: 12px;
  align-items: stretch;
  flex-direction: column;
}

.config-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.config-panel-left {
  flex: 1;
  min-width: 0;
  /* 限制左侧高度，让 List 内部滚动 */
  height: 320px;
}

.config-panel-right {
  flex: 1;
  min-width: 0;
}

.config-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.button-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.button-list :deep(.list-scroll-area) {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

/* 显示 hint 子文本（List 默认隐藏 sub-text） */
.button-list :deep(.sub-text) {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
}

.preview-box {
  background: var(--bg-secondary-soft);
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.input-preview-wrapper {
  pointer-events: none;
}
</style>
