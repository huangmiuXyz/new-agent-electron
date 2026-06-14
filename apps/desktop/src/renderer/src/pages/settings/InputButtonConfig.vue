<script setup lang="ts">
import draggable from 'vuedraggable'
import ChatInput from '@renderer/pages/chat/message/Input/index.vue'
import Switch from '@renderer/components/Switch.vue'

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
  workpath: '工作路径'
}

const buttonHintMap: Partial<Record<InputButtonId, string>> = {
  stop: '仅在生成中显示',
  workpath: '智能体支持本地工作路径时显示'
}

// 以本地可拖拽列表驱动，变更即写回 store
const localLayout = ref<InputButtonItem[]>(
  (display.value.inputButtonLayout || []).map((item: InputButtonItem) => ({ ...item }))
)

watch(
  () => display.value.inputButtonLayout,
  (next) => {
    if (!next) return
    // 仅在 store 端发生外部变更（如重置）时同步，避免拖拽过程中的循环更新
    const nextIds = next.map((i: InputButtonItem) => `${i.id}:${i.visible}`).join('|')
    const localIds = localLayout.value.map((i) => `${i.id}:${i.visible}`).join('|')
    if (nextIds !== localIds) {
      localLayout.value = next.map((item: InputButtonItem) => ({ ...item }))
    }
  }
)

const commit = () => {
  settingsStore.updateInputButtonLayout(
    localLayout.value.map((item) => ({ id: item.id, visible: item.visible }))
  )
}

watch(localLayout, commit, { deep: true })

const onDragEnd = () => commit()

const resetToDefault = () => {
  settingsStore.resetInputButtonLayout()
}
</script>

<template>
  <div class="input-button-config">
    <div class="config-header">
      <div class="config-header-title">
        <span>输入框按钮管理</span>
        <span class="config-header-hint">左侧拖动排序、切换显隐，右侧实时预览</span>
      </div>
      <button class="reset-btn" type="button" @click="resetToDefault">恢复默认</button>
    </div>

    <div class="config-body">
      <!-- 左：按钮排序（可滚动） -->
      <div class="config-panel config-panel-left">
        <div class="config-panel-title">按钮顺序</div>
        <div class="button-list">
          <draggable
            v-model="localLayout"
            item-key="id"
            handle=".drag-handle"
            animation="180"
            ghost-class="drag-ghost"
            @end="onDragEnd"
          >
            <template #item="{ element }">
              <div class="button-row" :class="{ disabled: !element.visible }">
                <div class="drag-handle" title="拖动排序">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="9" cy="6" r="1.4" />
                    <circle cx="15" cy="6" r="1.4" />
                    <circle cx="9" cy="12" r="1.4" />
                    <circle cx="15" cy="12" r="1.4" />
                    <circle cx="9" cy="18" r="1.4" />
                    <circle cx="15" cy="18" r="1.4" />
                  </svg>
                </div>
                <span class="button-name">{{ buttonLabelMap[element.id as InputButtonId] || element.id }}</span>
                <span v-if="buttonHintMap[element.id as InputButtonId]" class="button-hint">
                  {{ buttonHintMap[element.id as InputButtonId] }}
                </span>
                <Switch v-model="element.visible" size="sm" />
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <!-- 右：实时预览 -->
      <div class="config-panel config-panel-right">
        <div class="config-panel-title">预览</div>
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
}

.config-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.config-panel-left {
  flex: 1;
  min-width: 0;
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
  height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.button-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
  margin-bottom: 6px;
  transition: background 0.15s, opacity 0.15s;
}

.button-row:hover {
  background: var(--bg-secondary);
}

.button-row.disabled {
  opacity: 0.55;
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: var(--text-tertiary);
  flex-shrink: 0;
  touch-action: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-ghost {
  opacity: 0.4;
  background: var(--bg-secondary);
}

.button-name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.button-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.preview-box {
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
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
