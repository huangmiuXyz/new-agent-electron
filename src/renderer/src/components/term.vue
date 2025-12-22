<script setup lang="ts">
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useSettingsStore } from '@renderer/stores/settings'

interface TerminalTab {
  id: string
  title: string
  instance: Terminal | null
  addon: FitAddon | null
  socket: WebSocket | null
}

const settingsStore = useSettingsStore()

const tabs = ref<TerminalTab[]>([])
const activeTabId = ref<string>('')
const terminalHeight = ref(300)
const isResizing = ref(false)

const terminalRefs = new Map<string, HTMLElement>()

const generateId = () => Math.random().toString(36).substring(2, 9)

const setTerminalRef = (el: any, id: string) => {
  if (el) {
    terminalRefs.set(id, el)
  } else {
    terminalRefs.delete(id)
  }
}

const createTab = async () => {
  const id = generateId()
  const title = `终端 ${tabs.value.length + 1}`

  tabs.value.push({
    id,
    title,
    instance: null,
    addon: null,
    socket: null
  })

  activeTabId.value = id

  await nextTick()

  initTerminal(id)
}

const initTerminal = (id: string) => {
  const tabIndex = tabs.value.findIndex((t) => t.id === id)
  if (tabIndex === -1) return

  const container = terminalRefs.get(id)
  if (!container) return

  const ws = new WebSocket('ws://localhost:3333')

  const term = new Terminal({
    fontSize: 14,
    cursorBlink: true,
    convertEol: true,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#ffffff',
      foreground: '#333333',
      cursor: '#333333',
      selectionBackground: '#add6ff'
    }
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  term.open(container)
  tabs.value[tabIndex].instance = term
  tabs.value[tabIndex].addon = fitAddon
  tabs.value[tabIndex].socket = ws

  ws.onopen = () => {
    fitAddon.fit()
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
  }

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      term.write(event.data)
    } else {
      event.data.text().then((t: string) => term.write(t))
    }
  }

  ws.onclose = () => {
    term.write('\r\n\x1b[31m连接已断开\x1b[0m')
  }

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })

  term.onTitleChange((newTitle) => {
    if (newTitle && newTitle.trim() !== '') {
      tabs.value[tabIndex].title = newTitle
    }
  })

  setTimeout(() => {
    fitAddon.fit()
  }, 50)
}

const removeTab = (id: string, event?: Event) => {
  event?.stopPropagation()
  const index = tabs.value.findIndex((t) => t.id === id)
  if (index === -1) return

  const tab = tabs.value[index]

  tab.socket?.close()
  tab.instance?.dispose()

  tabs.value.splice(index, 1)

  if (activeTabId.value === id && tabs.value.length > 0) {
    activeTabId.value = tabs.value[Math.max(0, index - 1)].id
  }
}

const switchTab = (id: string) => {
  activeTabId.value = id
  nextTick(() => {
    const tab = tabs.value.find((t) => t.id === id)
    if (tab && tab.addon && tab.instance) {
      tab.addon.fit()
      tab.instance.focus()
    }
  })
}

const startResizing = (event: MouseEvent) => {
  isResizing.value = true
  const startY = event.clientY
  const startHeight = terminalHeight.value

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return
    const deltaY = startY - e.clientY
    terminalHeight.value = Math.max(100, Math.min(window.innerHeight - 200, startHeight + deltaY))
  }

  const handleMouseUp = () => {
    isResizing.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    const activeTab = tabs.value.find((t) => t.id === activeTabId.value)
    if (activeTab?.addon && activeTab?.socket) {
      activeTab.addon.fit()
      activeTab.socket.send(
        JSON.stringify({
          type: 'resize',
          cols: activeTab.instance!.cols,
          rows: activeTab.instance!.rows
        })
      )
    }
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleWindowResize = () => {
  const activeTab = tabs.value.find((t) => t.id === activeTabId.value)
  if (activeTab?.addon && activeTab?.socket) {
    activeTab.addon.fit()
    activeTab.socket.send(
      JSON.stringify({
        type: 'resize',
        cols: activeTab.instance!.cols,
        rows: activeTab.instance!.rows
      })
    )
  }
}

onMounted(async () => {
  if (window.api && window.api.runPtyServer) {
    window.api.runPtyServer()
  }
  await new Promise((resolve) => setTimeout(resolve, 500))

  createTab()

  window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleWindowResize)
  tabs.value.forEach((tab) => {
    tab.socket?.close()
    tab.instance?.dispose()
  })
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
