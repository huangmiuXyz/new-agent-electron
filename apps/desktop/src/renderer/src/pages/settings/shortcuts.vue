<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import { formatShortcut, useShortcuts } from '@renderer/composables/useShortcuts'

const settingsStore = useSettingsStore()
const { shortcuts } = storeToRefs(settingsStore)
const { updateConfig } = useShortcuts()

const { RotateCounterclockwise } = useIcon(['RotateCounterclockwise'])

const searchQuery = ref('')
const query = computed(() => searchQuery.value.toLowerCase().trim())

const scopeNames: Record<string, string> = {
  global: '全局快捷键',
  chat: '对话页面',
  notes: '笔记页面',
  image: '图像生成',
  settings: '设置页面'
}

const scopeOrder = ['global', 'chat', 'notes', 'image', 'settings']

const matchesQuery = (shortcut: ShortcutConfig) => {
  if (!query.value) return true
  return (
    shortcut.name.toLowerCase().includes(query.value) ||
    shortcut.description?.toLowerCase().includes(query.value)
  )
}

const groupedShortcuts = computed(() => {
  const groups: { label: string; items: ShortcutConfig[] }[] = []
  for (const scope of scopeOrder) {
    const items = shortcuts.value.filter(s => s.scope === scope && matchesQuery(s))
    if (items.length) {
      groups.push({ label: scopeNames[scope] || scope, items })
    }
  }
  return groups
})

const filteredCount = computed(() =>
  groupedShortcuts.value.reduce((sum, g) => sum + g.items.length, 0)
)

// 重置所有快捷键
const handleResetAll = () => {
  settingsStore.resetAllShortcuts()
  shortcuts.value.forEach(s => {
    updateConfig(s.id, { currentKey: undefined, enabled: s.enabled })
  })
}

// 编辑状态
const editingId = ref<string | null>(null)
const recordingKeys = ref<string[]>([])
const recordingModifiers = ref({
  ctrl: false,
  meta: false,
  shift: false,
  alt: false
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
  recordingKeys.value.forEach(key => {
    parts.push(key.length === 1 ? key.toUpperCase() : key)
  })
  if (parts.length > 0) {
    const newKey = parts.join('+')
    settingsStore.updateShortcut(editingId.value, { currentKey: newKey })
    updateConfig(editingId.value, { currentKey: newKey })
  }
  cancelRecording()
}

// 重置为默认
const resetToDefault = (shortcut: ShortcutConfig) => {
  settingsStore.resetShortcut(shortcut.id)
  updateConfig(shortcut.id, { currentKey: undefined, enabled: shortcut.enabled })
}

// 切换启用状态
const toggleEnabled = (e: Event, shortcut: ShortcutConfig) => {
  e.stopPropagation()
  const newEnabled = !shortcut.enabled
  settingsStore.updateShortcut(shortcut.id, { enabled: newEnabled })
  updateConfig(shortcut.id, { enabled: newEnabled })
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
    if (!recordingKeys.value.includes(e.key)) {
      recordingKeys.value.push(e.key)
    }
  }
  const hasModifiers = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
  const hasKeys = recordingKeys.value.length > 0
  if ((hasModifiers && hasKeys) || recordingKeys.value.length >= 2) {
    nextTick(() => saveRecording())
  }
}

const handleKeyUp = (e: KeyboardEvent) => {
  if (!editingId.value) return
  recordingModifiers.value = {
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey
  }
}

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
      <div class="settings-page-wrapper">
      <SettingsList
        :count="filteredCount"
        count-label="个快捷键"
        :search-term="searchQuery"
        :show-search="shortcuts.length > 0"
        search-placeholder="搜索快捷键"
        @update:search-term="searchQuery = $event"
      >
        <template #actions>
          <Button size="sm" variant="text" @click="handleResetAll">
            <template #icon><RotateCounterclockwise /></template>
            恢复默认
          </Button>
        </template>

        <SettingsGroup
          v-for="group in groupedShortcuts"
          :key="group.label"
          :label="group.label"
        >
          <SettingsRow
            v-for="shortcut in group.items"
            :key="shortcut.id"
            :name="shortcut.name"
            :desc="shortcut.description"
            :muted="!shortcut.enabled"
            clickable
            fade-actions
            @click="startRecording(shortcut)"
          >
            <template #actions>
              <template v-if="editingId === shortcut.id">
                <button class="shortcut-key recording" @click.stop>
                  <span class="recording-text">{{ recordingDisplay }}</span>
                </button>
                <Button size="sm" variant="text" @click.stop="cancelRecording">取消</Button>
              </template>
              <template v-else>
                <button
                  class="shortcut-key"
                  :class="{
                    custom: hasCustomKey(shortcut),
                    disabled: !shortcut.enabled
                  }"
                  @click.stop="startRecording(shortcut)"
                >
                  {{ displayKey(shortcut) }}
                </button>
                <button
                  v-if="shortcut.editable !== false"
                  class="btn-toggle"
                  :class="{ 'is-enabled': shortcut.enabled }"
                  @click.stop="(e) => toggleEnabled(e, shortcut)"
                >
                  <span class="toggle-dot"></span>
                </button>
                <Button
                  v-if="hasCustomKey(shortcut)"
                  size="sm"
                  variant="text"
                  @click.stop="resetToDefault(shortcut)"
                  title="恢复默认"
                >
                  <RotateCounterclockwise />
                </Button>
              </template>
            </template>
          </SettingsRow>
        </SettingsGroup>

        <template #empty>
          <div class="empty-icon"><Keyboard /></div>
          <div class="empty-title">{{ query ? '没有匹配的快捷键' : '暂无可用的快捷键' }}</div>
          <div class="empty-hint">{{ query ? '试试其他关键词' : '所有快捷键功能已加载' }}</div>
        </template>
      </SettingsList>
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
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
  margin-left: 12px;
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
