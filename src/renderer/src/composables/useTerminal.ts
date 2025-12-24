import { ref, nextTick, watch, computed } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

export interface TerminalTab {
  id: string
  title: string
  instance: Terminal | null
  addon: FitAddon | null
  isExecuting?: boolean
  isExecutingDelayed?: boolean
  lastExitCode?: number | null
  isReady?: boolean
  currentOutput?: string
  forceContinue?: () => void
  _cleanup?: () => void
}

const tabs = ref<TerminalTab[]>([])
const activeTabId = ref<string>('')
const isResizing = ref(false)
const terminalRefs = new Map<string, HTMLElement>()
const executionDebouncers = new Map<string, ReturnType<typeof debounce>>()
const toolCallToTerminalMap = ref<Record<string, string>>({})

const generateId = () => Math.random().toString(36).substring(2, 9)

export const useTerminal = () => {
  const settingsStore = useSettingsStore()
  const agentStore = useAgentStore()

  // 使用设置中的终端高度，如果没有设置则使用默认值 200
  const terminalHeight = computed({
    get: () => settingsStore.display.terminalHeight || 200,
    set: (value: number) => {
      settingsStore.updateDisplaySettings({ terminalHeight: value })
    }
  })

  // 获取终端设置
  const terminalSettings = computed(() => settingsStore.terminal)
  const setExecuting = (id: string, executing: boolean, exitCode?: number | null) => {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return

    tab.isExecuting = executing
    if (exitCode !== undefined) tab.lastExitCode = exitCode

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

  const initTerminal = async (id: string) => {
    const tabIndex = tabs.value.findIndex((t) => t.id === id)
    if (tabIndex === -1) return

    const tab = tabs.value[tabIndex]
    if (tab.instance) return

    const container = terminalRefs.get(id)
    if (!container) return

    const term = new Terminal({
      fontSize: terminalSettings.value.fontSize,
      cursorBlink: terminalSettings.value.cursorBlink,
      convertEol: true,
      fontFamily: terminalSettings.value.fontFamily,
      theme: {
        background: terminalSettings.value.backgroundColor,
        foreground: terminalSettings.value.foregroundColor,
        cursor: terminalSettings.value.cursorColor,
        selectionBackground: terminalSettings.value.selectionBackgroundColor
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(container)
    tabs.value[tabIndex].instance = term
    tabs.value[tabIndex].addon = fitAddon

    // 注册 OSC 633 处理程序 (Shell Integration)
    term.parser.registerOscHandler(633, (data) => {
      const parts = data.split(';')
      const type = parts[0]
      const currentTab = tabs.value.find((t) => t.id === id)
      if (!currentTab) return false

      if (!currentTab.isReady) currentTab.isReady = true

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

    // 获取当前选中智能体的终端启动位置
    const selectedAgent = agentStore.selectedAgent
    const cwd = selectedAgent?.terminalStartupPath || undefined
    await window.api.pty.spawn({ id, cols: term.cols, rows: term.rows, cwd })

    const cleanupData = window.api.pty.onData(id, (data) => {
      if (data) {
        term.write(data)
      }

      const currentTab = tabs.value.find((t) => t.id === id)
      if (currentTab) {
        const cleanText = stripAnsi(data)

        if (currentTab.isExecuting) {
          currentTab.currentOutput = (currentTab.currentOutput || '') + cleanText
        }

        if (/[$%#>]\s*$/.test(cleanText)) {
          if (!currentTab.isReady) {
            currentTab.isReady = true
            const platform = window.api.os.platform()
            setExecuting(id, true)
            if (platform === 'win32') {
              const psScript = `function prompt { $lastExit = $? ; Write-Host -NoNewline "\`e]633;D;$lastExit\`a" ; return "PS $($executionContext.SessionState.Path.CurrentLocation)> " }; Clear-Host`
              window.api.pty.write(id, '\r' + psScript + '\r')
            } else {
              const shellIntegration = `if [ -n "$ZSH_VERSION" ]; then unsetopt PROMPT_SP; precmd() { printf "\\033]633;D;$?\\007"; }; elif [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND='printf "\\033]633;D;$?\\007"'; fi; clear`
              window.api.pty.write(id, '\r ' + shellIntegration + '\r')
            }
          }
        }
      }
    })

    const cleanupExit = window.api.pty.onExit(id, () => {
      term.write('\r\n\x1b[31m连接已断开\x1b[0m')
    })

    // 先保存原始的清理函数，稍后会重新定义
    const originalCleanup = () => {
      cleanupData()
      cleanupExit()
    }
    tabs.value[tabIndex]._cleanup = originalCleanup

    term.onData((data) => {
      window.api.pty.write(id, data)
      if (data === '\r' || data === '\n') {
        setExecuting(id, true)
      }
    })

    term.onTitleChange((newTitle) => {
      if (newTitle && newTitle.trim() !== '') {
        tabs.value[tabIndex].title = newTitle
      }
    })

    setTimeout(() => {
      fitAddon.fit()
      window.api.pty.resize(id, term.cols, term.rows)
    }, 50)

    // 监听终端设置变化，动态更新主题
    const unwatchSettings = watch(
      () => terminalSettings.value,
      (newSettings) => {
        if (term) {
          term.options.theme = {
            background: newSettings.backgroundColor,
            foreground: newSettings.foregroundColor,
            cursor: newSettings.cursorColor,
            selectionBackground: newSettings.selectionBackgroundColor
          }
          term.options.fontSize = newSettings.fontSize
          term.options.cursorBlink = newSettings.cursorBlink
          term.options.fontFamily = newSettings.fontFamily
        }
      },
      { deep: true }
    )

    // 在标签页清理时移除监听器
    tabs.value[tabIndex]._cleanup = () => {
      unwatchSettings()
      originalCleanup()
    }
  }

  const showTerminal = async () => {
    settingsStore.display.showTerminal = true
    await waitForReady(activeTabId.value)
    nextTick(() => {
      terminalRefs.get(activeTabId.value)?.focus()
      const activeTab = tabs.value.find((t) => t.id === activeTabId.value)
      if (activeTab?.addon && activeTab?.instance) {
        if (activeTab.addon && activeTab.instance) {
          activeTab.addon.fit()
          window.api.pty.resize(activeTab.id, activeTab.instance.cols, activeTab.instance.rows)
        }
      }
    })
  }
  const hideTerminal = () => {
    settingsStore.display.showTerminal = false
  }
  const createTab = async (options?: {
    toolCallId?: string
    showTerminal?: boolean
    id: string
    command?: string
    timeout?: number
  }) => {
    let id = options?.id || generateId()
    const timeout = options?.timeout || 30000
    const title = '终端'

    if (options?.toolCallId) {
      toolCallToTerminalMap.value[options.toolCallId] = id
    }

    let tab = tabs.value.find((t) => t.id === id)
    if (!tab) {
      tabs.value.push({
        id,
        title,
        instance: null,
        addon: null
      })
      tab = tabs.value[tabs.value.length - 1]
    }

    activeTabId.value = id
    ;(options?.showTerminal || settingsStore.display.showTerminal) && showTerminal()

    await nextTick()
    await initTerminal(id)

    if (typeof options?.command !== 'string') return { id }

    if (!tab) return { id, result: { success: false, output: '' } }

    await waitForReady(id)

    // 清空之前的输出
    tab.currentOutput = ''

    setExecuting(id, true)
    window.api.pty.write(id, options?.command + '\r')

    const result = await waitForCommand(id, timeout)
    return { id, result }
  }

  const removeTab = (id: string, event?: Event) => {
    event?.stopPropagation()
    const index = tabs.value.findIndex((t) => t.id === id)
    if (index === -1) return

    const tab = tabs.value[index]

    window.api.pty.kill(id)
    tab._cleanup?.()
    tab.instance?.dispose()

    tabs.value.splice(index, 1)

    if (activeTabId.value === id && tabs.value.length > 0) {
      activeTabId.value = tabs.value[Math.max(0, index - 1)].id
    }

    if (tabs.value.length === 0) {
      hideTerminal()
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
    if (activeTab?.addon && activeTab?.instance) {
      activeTab.addon.fit()
      window.api.pty.resize(activeTab.id, activeTab.instance.cols, activeTab.instance.rows)
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
      if (activeTab?.addon && activeTab?.instance) {
        activeTab.addon.fit()
        window.api.pty.resize(activeTab.id, activeTab.instance.cols, activeTab.instance.rows)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const toggleTerminal = () => {
    if (!settingsStore.display.showTerminal) {
      showTerminal()
    } else {
      hideTerminal()
    }
    if (settingsStore.display.showTerminal && tabs.value.length === 0) {
      createTab()
    }
  }

  const waitForCommand = (id: string, timeout = 30000) => {
    return new Promise<{ success: boolean; exitCode: number | null; output: string }>((resolve) => {
      const tab = tabs.value.find((t) => t.id === id)
      if (!tab) return resolve({ success: false, exitCode: null, output: '' })

      let timer: any = null

      const onDone = (force = false) => {
        if (timer) clearTimeout(timer)
        unwatch()
        tab.forceContinue = undefined
        resolve({
          success: true,
          exitCode: force ? 0 : (tab.lastExitCode ?? 0),
          output: tab.currentOutput || ''
        })
      }

      tab.forceContinue = () => onDone(true)

      if (!tab.isExecuting) {
        return onDone()
      }

      const unwatch = watch(
        () => tab.isExecuting,
        (isExecuting) => {
          if (!isExecuting) {
            onDone()
          }
        }
      )
      if (timeout > 0) {
        timer = setTimeout(() => {
          onDone()
        }, timeout)
      }
    })
  }

  const waitForReady = (id: string, timeout = 10000) => {
    return new Promise<boolean>((resolve) => {
      const tab = tabs.value.find((t) => t.id === id)
      if (!tab) return resolve(false)

      const checkReady = () => {
        // 必须同时满足：1. 已经准备好（看到过提示符） 2. 当前没有正在执行的命令（如初始化脚本）
        return tab.isReady && !tab.isExecuting
      }

      if (checkReady()) return resolve(true)

      let timer: any = null

      const unwatch = watch([() => tab.isReady, () => tab.isExecuting], () => {
        if (checkReady()) {
          if (timer) clearTimeout(timer)
          unwatch()
          resolve(true)
        }
      })

      if (timeout > 0) {
        timer = setTimeout(() => {
          unwatch()
          resolve(false)
        }, timeout)
      }
    })
  }

  return {
    tabs,
    activeTabId,
    terminalHeight,
    terminalSettings,
    isResizing,
    createTab,
    removeTab,
    switchTab,
    setTerminalRef,
    startResizing,
    handleWindowResize,
    showTerminal,
    hideTerminal,
    toggleTerminal,
    waitForCommand,
    forceContinue: (id: string) => {
      const tab = tabs.value.find((t) => t.id === id)
      if (tab && tab.forceContinue) {
        tab.forceContinue()
      }
    },
    getTerminalIdByToolCallId: (toolCallId: string) => {
      return toolCallToTerminalMap.value[toolCallId]
    }
  }
}
