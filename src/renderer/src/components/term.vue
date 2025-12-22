<script setup lang="ts">
import 'xterm/css/xterm.css'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTerminal } from '@renderer/composables/useTerminal'

const settingsStore = useSettingsStore()
const {
  tabs,
  activeTabId,
  terminalHeight,
  isResizing,
  createTab,
  removeTab,
  switchTab,
  setTerminalRef,
  startResizing,
  handleWindowResize
} = useTerminal()

onMounted(async () => {
  if (window.api && window.api.runPtyServer) {
    window.api.runPtyServer()
  }
  await new Promise((resolve) => setTimeout(resolve, 500))

  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  // Don't close sockets here as we want to keep them alive
})
</script>

<template>
  <div
    class="terminal-container"
    :style="{ height: terminalHeight + 'px' }"
    :class="{ 'is-resizing': isResizing }"
  >
    <div class="resizer" @mousedown="startResizing"></div>

    <div class="terminal-header">
      <div class="tabs-list">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-item"
          :class="{ active: activeTabId === tab.id }"
          @click="switchTab(tab.id)"
        >
          <span class="tab-title">{{ tab.title }}</span>
          <span class="tab-close" @click.stop="removeTab(tab.id)">×</span>
        </div>
        <button class="add-tab-btn" @click="createTab" title="新建终端">+</button>
      </div>

      <div class="terminal-actions">
        <button @click="settingsStore.display.showTerminal = false" class="close-panel-btn">
          ×
        </button>
      </div>
    </div>

    <div class="terminal-body">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :ref="(el) => setTerminalRef(el, tab.id)"
        class="xterm-container"
        v-show="activeTabId === tab.id"
      />

      <div v-if="tabs.length === 0" class="empty-state">
        <Button @click="createTab" variant="primary">打开新终端</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-container {
  border-top: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
  flex-shrink: 0;
  min-height: 100px;
}

.terminal-container.is-resizing {
  user-select: none;
}

.resizer {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 4px;
  cursor: row-resize;
  z-index: 10;
  background: transparent;
}
.resizer:hover {
  background: #007bff;
}

.terminal-header {
  height: 32px;
  background: #f3f3f3;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 12px;
  user-select: none;
}

.tabs-list {
  display: flex;
  align-items: flex-end;
  height: 100%;
  overflow-x: auto;
}

.tabs-list::-webkit-scrollbar {
  display: none;
}

.tab-item {
  height: 100%;
  min-width: 100px;
  max-width: 200px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  border-right: 1px solid #e0e0e0;
  cursor: pointer;
  background: #eaeaea;
  transition: background 0.2s;
}

.tab-item:hover {
  background: #e0e0e0;
}

.tab-item.active {
  background: #ffffff;
  color: #333;
  font-weight: 500;
  border-bottom: 2px solid #007bff;
}

.tab-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 6px;
}

.tab-close {
  font-size: 16px;
  width: 16px;
  height: 16px;
  line-height: 14px;
  text-align: center;
  border-radius: 50%;
  color: #999;
}

.add-tab-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  width: 36px;
  height: 100%;
  cursor: pointer;
  color: #666;
}

.close-panel-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #999;
}
.close-panel-btn:hover {
  color: #333;
}

.terminal-body {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: #fff;
  padding: 4px;
}

.xterm-container {
  height: 100%;
  width: 100%;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
