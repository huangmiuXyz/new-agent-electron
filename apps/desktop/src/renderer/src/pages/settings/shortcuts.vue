<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { formatShortcut, type ShortcutConfig } from '@renderer/composables/useShortcuts'
import List from '@renderer/components/List.vue'

const settingsStore = useSettingsStore()
const { shortcuts } = storeToRefs(settingsStore)

const { RotateCounterclockwise } = useIcon(['RotateCounterclockwise'])

// 编辑状态
const editingId = ref<string | null>(null)
const recordingKeys = ref<string[]>([])
const recordingModifiers = ref({
  ctrl: false,
  meta: false,
  shift: false,
  alt: false
})

// 按作用域分组并转换格式
const listItems = computed(() => {
  const items: Array<ShortcutConfig & { group: string }> = []
  
  const scopeNames: Record<string, string> = {
    global: '全局快捷键',
    chat: '对话页面',
    notes: '笔记页面',
    image: '图像生成',
    settings: '设置页面'
  }
  
  shortcuts.value.forEach(shortcut => {
    items.push({
      ...shortcut,
      group: scopeNames[shortcut.scope] || shortcut.scope
    })
  })
  
  return items
})

// 显示当前快捷键
const displayKey = (shortcut: ShortcutConfig) => {
  const key = shortcut.currentKey || shortcut.defaultKey
  return formatShortcut(key)
}

// 录制中显示的键
const recordingDisplay = computed(() => {
  const parts: string[] = []
  if (recordingModifiers.value.ctrl) parts.push('Ctrl')
  if (recordingModifiers.value.meta) parts.push('Cmd')
  if (recordingModifiers.value.shift) parts.push('Shift')
  if (recordingModifiers.value.alt) parts.push('Alt')

  // 显示所有普通键
  recordingKeys.value.forEach(key => {
    parts.push(key.length === 1 ? key.toUpperCase() : key)
  })

  return parts.length > 0 ? parts.join('+') : '按下快捷键...'
})

// 是否有自定义
const hasCustomKey = (shortcut: ShortcutConfig) => {
  return shortcut.currentKey && shortcut.currentKey !== shortcut.defaultKey
}

// 开始录制快捷键
const startRecording = (shortcut: ShortcutConfig) => {
  if (!shortcut.editable) return
  editingId.value = shortcut.id
  recordingKeys.value = []
  recordingModifiers.value = { ctrl: false, meta: false, shift: false, alt: false }
}

// 取消录制
const cancelRecording = () => {
  editingId.value = null
  recordingKeys.value = []
  recordingModifiers.value = { ctrl: false, meta: false, shift: false, alt: false }
}

// 保存录制的快捷键
const saveRecording = () => {
  if (!editingId.value) return

  const parts: string[] = []
  if (recordingModifiers.value.ctrl) parts.push('Ctrl')
  if (recordingModifiers.value.meta) parts.push('Cmd')
  if (recordingModifiers.value.shift) parts.push('Shift')
  if (recordingModifiers.value.alt) parts.push('Alt')

  // 添加所有普通键
  recordingKeys.value.forEach(key => {
    if (key.length === 1) {
      parts.push(key.toUpperCase())
    } else {
      parts.push(key)
    }
  })

  if (parts.length > 0) {
    const newKey = parts.join('+')
    settingsStore.updateShortcut(editingId.value, { currentKey: newKey })
  }

  cancelRecording()
}

// 重置为默认
const resetToDefault = (shortcut: ShortcutConfig) => {
  settingsStore.resetShortcut(shortcut.id)
}

// 切换启用状态
const toggleEnabled = (e: Event, shortcut: ShortcutConfig) => {
  e.stopPropagation()
  settingsStore.updateShortcut(shortcut.id, { enabled: !shortcut.enabled })
}

// 录制键盘事件
const handleKeyDown = (e: KeyboardEvent) => {
  if (!editingId.value) return

  e.preventDefault()
  e.stopPropagation()

  recordingModifiers.value = {
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey
  }

  const modifierKeys = ['Control', 'Meta', 'Shift', 'Alt', 'OS']
  if (!modifierKeys.includes(e.key)) {
    // 添加新按键，避免重复
    if (!recordingKeys.value.includes(e.key)) {
      recordingKeys.value.push(e.key)
    }
  }

  // 只要有修饰键+普通键 或 多个普通键，就立即保存
  const hasModifiers = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
  const hasKeys = recordingKeys.value.length > 0

  if ((hasModifiers && hasKeys) || recordingKeys.value.length >= 2) {
    nextTick(() => saveRecording())
  }
}

// 处理按键抬起
const handleKeyUp = (e: KeyboardEvent) => {
  if (!editingId.value) return

  recordingModifiers.value = {
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey
  }
}

// 监听录制
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
})
</script>

<template>
  <FormContainer header-title="快捷键设置">
    <template #content>
      <div class="shortcuts-container">
        <div class="shortcuts-header">
          <p class="description">自定义应用的键盘快捷键，点击快捷键即可修改</p>
          <Button size="sm" variant="text" @click="settingsStore.resetAllShortcuts">
            <template #icon>
              <RotateCounterclockwise />
            </template>
            恢复默认
          </Button>
        </div>

        <div class="shortcuts-list-wrapper">
          <List
            :items="listItems"
            key-field="id"
            main-field="name"
            sub-field="description"
            :show-header="true"
            :render-header="(item) => item.group"
            :selectable="false"
            variant="card"
          >
            <template #actions="{ item }">
              <div class="shortcut-actions">
                <!-- 编辑中的显示 -->
                <template v-if="editingId === item.id">
                  <button class="shortcut-key recording">
                    <span class="recording-text">{{ recordingDisplay }}</span>
                  </button>
                  <Button size="sm" variant="text" @click="cancelRecording">取消</Button>
                </template>

                <!-- 正常显示 -->
                <template v-else>
                  <button
                    class="shortcut-key"
                    :class="{
                      'custom': hasCustomKey(item),
                      'default': !hasCustomKey(item),
                      'disabled': !item.enabled
                    }"
                    @click="startRecording(item)"
                  >
                    {{ displayKey(item) }}
                  </button>

                  <button
                    v-if="item.editable"
                    class="btn-toggle"
                    :class="{ 'is-enabled': item.enabled }"
                    @click="(e) => toggleEnabled(e, item)"
                    :title="item.enabled ? '禁用' : '启用'"
                  >
                    <span class="toggle-dot"></span>
                  </button>

                  <Button
                    v-if="hasCustomKey(item)"
                    size="sm"
                    variant="text"
                    @click="resetToDefault(item)"
                    title="恢复默认"
                  >
                    <RotateCounterclockwise />
                  </Button>
                </template>
              </div>
            </template>
          </List>
        </div>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.shortcuts-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.shortcuts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.description {
  font-size: 13px;
  color: var(--text-secondary);
}

.shortcuts-list-wrapper {
  flex: 1;
  overflow: hidden;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.shortcuts-list-wrapper :deep(.list-container) {
  height: 100%;
}

.shortcuts-list-wrapper :deep(.list-scroll-area) {
  height: 100%;
  overflow-y: auto;
  background: transparent;
  border: none;
}

.shortcut-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shortcut-key {
  padding: 6px 16px;
  font-size: 13px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
  min-width: 120px;
  height: 32px;
  box-sizing: border-box;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.shortcut-key:hover {
  border-color: var(--accent-color);
}

.shortcut-key.custom {
  border-color: var(--color-info);
  color: var(--color-info);
}

.shortcut-key.disabled {
  opacity: 0.5;
}

.shortcut-key.recording {
  border-color: var(--accent-color);
  cursor: default;
}

.recording-text {
  font-size: 13px;
  color: var(--accent-color);
  animation: pulse 1s ease-in-out infinite;
  white-space: nowrap;
  line-height: 1;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.btn-toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: none;
  background: var(--border-color);
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  padding: 0;
  flex-shrink: 0;
}

.btn-toggle.is-enabled {
  background: var(--color-success);
}

.toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.btn-toggle.is-enabled .toggle-dot {
  transform: translateX(16px);
}
</style>
