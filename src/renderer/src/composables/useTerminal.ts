import { ref, nextTick, watch } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useSettingsStore } from '@renderer/stores/settings'
import { debounce } from 'es-toolkit'

export interface TerminalTab {
  id: string
  title: string
  instance: Terminal | null
  addon: FitAddon | null
  socket: WebSocket | null
  isExecuting?: boolean
  isExecutingDelayed?: boolean // 用于 UI 显示，防抖
  lastExitCode?: number | null
}

// Global state outside the hook to share across all components
const tabs = ref<TerminalTab[]>([])
const activeTabId = ref<string>('')
const terminalHeight = ref(200)
const isResizing = ref(false)
const terminalRefs = new Map<string, HTMLElement>()
const executionDebouncers = new Map<string, ReturnType<typeof debounce>>()

const generateId = () => Math.random().toString(36).substring(2, 9)

export const useTerminal = () => {
  const settingsStore = useSettingsStore()

  /**
   * 更新执行状态（使用 es-toolkit debounce，防止快速命令闪烁）
   */
  const setExecuting = (id: string, executing: boolean, exitCode?: number | null) => {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return

    tab.isExecuting = executing
    if (exitCode !== undefined) tab.lastExitCode = exitCode

    // 获取或创建防抖函数
    let debouncer = executionDebouncers.get(id)
    if (!debouncer) {
      debouncer = debounce((val: boolean) => {
        const t = tabs.value.find((item) => item.id === id)
        if (t) t.isExecutingDelayed = val
      }, 300)
      executionDebouncers.set(id, debouncer)
    }

    if (executing) {
      debouncer(true)
    } else {
      debouncer.cancel()
      tab.isExecutingDelayed = false
    }
  }

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
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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

    // 注册 OSC 633 处理程序 (Shell Integration)
    term.parser.registerOscHandler(633, (data) => {
      const parts = data.split(';')
      const type = parts[0]
      const currentTab = tabs.value.find((t) => t.id === id)
      if (!currentTab) return false

      switch (type) {
        case 'A': // Prompt start
          setExecuting(id, false)
          break
        case 'B': // Command start
          setExecuting(id, true)
          break
        case 'C': // Command executed (output start)
          setExecuting(id, true)
          break
        case 'D': // Command finished
          setExecuting(id, false, parts[1] ? parseInt(parts[1]) : null)
          break
      }
      return true
    })

    ws.onopen = () => {
      fitAddon.fit()
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      const platform = window.api.os.platform()
      setTimeout(() => {
        if (platform === 'win32') {
          const psScript = `function prompt { $lastExit = $? ; Write-Host -NoNewline "\`e]633;D;$lastExit\`a" ; return "PS $($executionContext.SessionState.Path.CurrentLocation)> " }; Clear-Host\r`
          ws.send(psScript)
        } else {
          const shellIntegration = ` if [ -n "$ZSH_VERSION" ]; then precmd() { printf "\\033]633;D;$?\\007"; }; elif [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND='printf "\\033]633;D;$?\\007"'; fi; clear\r`
          ws.send(' ' + shellIntegration)
        }
      }, 500)
    }

    ws.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data : ''

      if (data) {
        term.write(data)
      } else if (event.data instanceof Blob) {
        event.data.text().then((t: string) => term.write(t))
      }

      const currentTab = tabs.value.find((t) => t.id === id)
      if (currentTab && currentTab.isExecuting) {
        const text = typeof event.data === 'string' ? event.data : ''
        if (/[$%#>]\s*$/.test(text)) {
          setExecuting(id, false)
        }
      }
    }

    ws.onclose = () => {
      term.write('\r\n\x1b[31m连接已断开\x1b[0m')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
        if (data === '\r' || data === '\n') {
          setExecuting(id, true)
        }
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

  const waitForCommand = (id: string, timeout = 30000) => {
    return new Promise<{ success: boolean; exitCode: number | null }>((resolve) => {
      const tab = tabs.value.find((t) => t.id === id)
      if (!tab) return resolve({ success: false, exitCode: null })

      if (!tab.isExecuting) {
        return resolve({ success: true, exitCode: tab.lastExitCode ?? 0 })
      }

      let timer: any = null

      const unwatch = watch(
        () => tab.isExecuting,
        (isExecuting) => {
          if (!isExecuting) {
            if (timer) clearTimeout(timer)
            unwatch()
            resolve({ success: true, exitCode: tab.lastExitCode ?? 0 })
          }
        }
      )
      if (timeout > 0) {
        timer = setTimeout(() => {
          unwatch()
          resolve({ success: false, exitCode: null })
        }, timeout)
      }
    })
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
    toggleTerminal,
    waitForCommand
  }
}
