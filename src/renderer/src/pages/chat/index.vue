<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'
import Term from '@renderer/components/term.vue'

const settingsStore = useSettingsStore()

const terminalHeight = ref(300)
const isResizing = ref(false)

const startResizing = (event: MouseEvent) => {
  isResizing.value = true
  const startY = event.clientY
  const startHeight = terminalHeight.value

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return
    const deltaY = startY - e.clientY
    terminalHeight.value = Math.max(100, Math.min(window.innerHeight - 200, startHeight + deltaY))
    // 触发窗口 resize 事件以更新 xterm fit
    window.dispatchEvent(new Event('resize'))
  }

  const handleMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}
</script>

<template>
  <div class="chat-app" :class="{ 'is-resizing': isResizing }">
    <!-- 左侧边栏 -->
    <div class="sidebar-wrapper" :class="{ collapsed: settingsStore.display.sidebarCollapsed }">
      <ChatSidebar />
    </div>

    <!-- 主聊天区域 -->
    <main class="main-chat">
      <!-- 消息列表 -->
      <ChatMessageList />

      <!-- 终端区域 -->
      <div v-if="settingsStore.display.showTerminal" class="terminal-container"
        :style="{ height: terminalHeight + 'px' }">
        <div class="resizer" @mousedown="startResizing"></div>
        <div class="terminal-header">
          <span>终端</span>
          <div class="terminal-actions">
            <button @click="settingsStore.display.showTerminal = false" class="close-btn">×</button>
          </div>
        </div>
        <div class="terminal-body">
          <Term />
        </div>
      </div>

      <!-- 输入框 -->
      <ChatMessageInput />
    </main>
  </div>
</template>

<style scoped>
.chat-app {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100%;
  width: 100%;
  display: flex;
  color: var(--text-primary);
  overflow: hidden;
  font-size: 13px;
  /* 保持精细的字体大小 */
  -webkit-font-smoothing: antialiased;
}

.chat-app.is-resizing {
  cursor: row-resize;
  user-select: none;
}

/* === 主区域：干净、通透 === */
.main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
}

.sidebar-wrapper {
  width: auto;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  width: 180px;
}

.sidebar-wrapper.collapsed {
  width: 0;
}

.terminal-container {
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
}

.resizer {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.2s;
}

.resizer:hover,
.is-resizing .resizer {
  background: var(--primary-color, #007bff);
}

.terminal-header {
  height: 32px;
  background: #f5f5f5;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
  user-select: none;
  border-bottom: 1px solid #e5e5e5;
}

.terminal-actions {
  display: flex;
  align-items: center;
}

.close-btn {
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
}

.close-btn:hover {
  color: #333;
}

.terminal-body {
  flex: 1;
  overflow: hidden;
  padding: 4px;
  background: #fff;
}
</style>
