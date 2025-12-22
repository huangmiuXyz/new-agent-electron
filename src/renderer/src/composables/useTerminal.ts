import { ref, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useSettingsStore } from '@renderer/stores/settings'

export interface TerminalTab {
  id: string
  title: string
  instance: Terminal | null
  addon: FitAddon | null
  socket: WebSocket | null
}

// Global state outside the hook to share across all components
const tabs = ref<TerminalTab[]>([])
const activeTabId = ref<string>('')
const terminalHeight = ref(200)
const isResizing = ref(false)
const terminalRefs = new Map<string, HTMLElement>()

const generateId = () => Math.random().toString(36).substring(2, 9)

export const useTerminal = () => {
  const settingsStore = useSettingsStore()

  const setTerminalRef = (el: any, id: string) => {
    if (el) {
      terminalRefs.set(id, el)
    } else {
      terminalRefs.delete(id)
    }
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
    settingsStore.display.showTerminal = true

    await nextTick()
    initTerminal(id)
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

  const toggleTerminal = () => {
    settingsStore.display.showTerminal = !settingsStore.display.showTerminal
    if (settingsStore.display.showTerminal && tabs.value.length === 0) {
      createTab()
    }
  }

  return {
    tabs,
    activeTabId,
    terminalHeight,
    isResizing,
    createTab,
    removeTab,
    switchTab,
    setTerminalRef,
    startResizing,
    handleWindowResize,
    showTerminal: () => (settingsStore.display.showTerminal = true),
    hideTerminal: () => (settingsStore.display.showTerminal = false),
    toggleTerminal
  }
}
