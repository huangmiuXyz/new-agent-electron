import { ref, nextTick, watch, computed } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

const tabs = ref<TerminalTab[]>([])
const activeTabId = ref<string>('')
const isResizing = ref(false)
const terminalRefs = new Map<string, HTMLElement>()
const executionDebouncers = new Map<string, ReturnType<typeof debounce>>()
const toolCallToTerminalMap = ref<Record<string, string>>({})
const POWERSHELL_SHELL_INTEGRATION = `$function:__agent_qi_prompt_original=$function:prompt; function prompt { $ec=$global:LASTEXITCODE; Write-Host "$([char]27)]633;D;$ec$([char]7)" -NoNewline; & $function:__agent_qi_prompt_original }; Clear-Host`
const generateId = () => Math.random().toString(36).substring(2, 9)

const getBufferCursorLine = (term: Terminal): number => {
  const buffer = term.buffer.active
  return buffer.baseY + buffer.cursorY
}

const extractTerminalBufferText = (term: Terminal, startLine: number, endLine: number): string => {
  const buffer = term.buffer.active
  const safeStart = Math.max(0, startLine)
  const safeEnd = Math.min(endLine, buffer.length - 1)

  if (safeStart > safeEnd) return ''

  const lines: string[] = []

  for (let lineIndex = safeStart; lineIndex <= safeEnd; lineIndex += 1) {
    const line = buffer.getLine(lineIndex)
    if (!line) continue

    const text = line.translateToString(true)
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += text
    } else {
      lines.push(text)
    }
  }

  return lines.join('\n')
}

const stripCommandEcho = (output: string, command?: string): string => {
  if (!command) return output.trimEnd()

  const lines = output.replace(/\u00a0/g, ' ').split('\n')
  const commandLineIndex = lines.findIndex((line) => line.includes(command))
  if (commandLineIndex === -1) return output.trimEnd()

  const commandLine = lines[commandLineIndex]
  const commandStart = commandLine.indexOf(command)
  const afterCommand = commandLine.slice(commandStart + command.length).trimStart()
  const remaining = [...lines.slice(commandLineIndex + 1)]

  if (afterCommand) {
    remaining.unshift(afterCommand)
  }

  return remaining.join('\n').trimEnd()
}

const captureCommandOutput = (tab: TerminalTab): string => {
  if (!tab.instance) return tab.currentOutput || ''

  const startLine =
    tab.captureStartMarker && !tab.captureStartMarker.isDisposed
      ? tab.captureStartMarker.line
      : getBufferCursorLine(tab.instance)
  const endLine = getBufferCursorLine(tab.instance)
  const rawOutput = extractTerminalBufferText(tab.instance, startLine, endLine)

  return stripCommandEcho(rawOutput, tab.captureCommand)
}

export const useTerminal = (): TerminalActions => {
  const settingsStore = useSettingsStore()
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()

  const { register } = useShortcuts()
  register({
    id: 'chat.toggleTerminal',
    handler: () => {
      settingsStore.display.showTerminal = !settingsStore.display.showTerminal
    }
  })

  const terminalHeight = computed({
    get: () => settingsStore.display.terminalHeight || 200,
    set: (value: number) => {
      settingsStore.updateDisplaySettings({ terminalHeight: value })
    }
  })


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


    term.parser.registerOscHandler(633, (data) => {
      const parts = data.split(';')
      const type = parts[0]
      const currentTab = tabs.value.find((t) => t.id === id)
      if (!currentTab) return false

      if (!currentTab.isReady) currentTab.isReady = true

      switch (type) {
        case 'A':
          setExecuting(id, false)
          break
        case 'B':
          setExecuting(id, true)
          break
        case 'C':
          setExecuting(id, true)
          break
        case 'D': {
          if (!parts[1]) {
            setExecuting(id, false, null)
            break
          }
          const exitCode = Number.parseInt(parts[1], 10)
          setExecuting(id, false, Number.isNaN(exitCode) ? null : exitCode)
          break
        }
      }
      return true
    })


    const currentAgentId = chatsStore.currentChat?.agentId || 'default'
    const cwd = agentStore.getAgentById(currentAgentId)?.terminalStartupPath || undefined
    await window.api.pty.spawn({ id, cols: term.cols, rows: term.rows, cwd })

      const cleanupData = window.api.pty.onData(id, (data) => {
      if (data) {
        term.write(data)
      }

      const currentTab = tabs.value.find((t) => t.id === id)
      if (currentTab) {
        const cleanText = stripAnsi(data)
        if (/[$%#>]\s*$/.test(cleanText)) {
          const platform = window.api.os.platform()

          if (!currentTab.isReady) {
            currentTab.isReady = true
            setExecuting(id, true)

            if (platform === 'win32') {
              currentTab.shellIntegrationEnabled = true
              window.api.pty.write(id, '\r ' + POWERSHELL_SHELL_INTEGRATION + '\r')
            } else {
              const shellIntegration = `if [ -n "$ZSH_VERSION" ]; then unsetopt PROMPT_SP; precmd() { printf "\\033]633;D;$?\\007"; }; elif [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND='printf "\\033]633;D;$?\\007"'; fi; clear`
              window.api.pty.write(id, '\r ' + shellIntegration + '\r')
            }
          }

          if (platform === 'win32' && currentTab.isExecuting && !currentTab.shellIntegrationEnabled) {
            setExecuting(id, false, 0)
          }
        }
      }
    })

    const cleanupExit = window.api.pty.onExit(id, () => {
      term.write('\r\n\x1b[31m连接已断开\x1b[0m')
    })


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


    tabs.value[tabIndex]._cleanup = () => {
      unwatchSettings()
      originalCleanup()
    }
  }

  const showTerminal = async (active: boolean = true) => {
    settingsStore.display.showTerminal = active
    if (tabs.value.length === 0) {
      await createTab()
      return
    }
    await waitForReady(activeTabId.value)
    nextTick(() => {
      terminalRefs.get(activeTabId.value)?.focus()
      // 延迟执行 fit，确保 ResizeBox 从 collapsed 展开后高度已正确应用
      setTimeout(() => {
        const activeTab = tabs.value.find((t) => t.id === activeTabId.value)
        if (activeTab?.addon && activeTab?.instance) {
          activeTab.addon.fit()
          window.api.pty.resize(activeTab.id, activeTab.instance.cols, activeTab.instance.rows)
        }
      }, 300)
    })
  }
  const hideTerminal = () => {
    settingsStore.display.showTerminal = false
  }
  const createTab = async (options?: {
    toolCallId?: string
    showTerminal?: boolean
    id?: string
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
        instance: undefined,
        addon: undefined
      })
      tab = tabs.value[tabs.value.length - 1]
    }

    activeTabId.value = id
      ; (options?.showTerminal || settingsStore.display.showTerminal) && showTerminal()

    await nextTick()
    await initTerminal(id)

    if (typeof options?.command !== 'string') return { id }

    if (!tab) return { id, result: { success: false, exitCode: null, output: '' } }

    await waitForReady(id)


    tab.captureStartMarker?.dispose()
    tab.captureStartMarker = tab.instance?.registerMarker(0)
    tab.captureCommand = options.command
    tab.currentOutput = ''

    tab.lastExitCode = null

    setExecuting(id, true)
    window.api.pty.write(id, options.command + '\r')

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

  // 监听高度变化，自动调整终端大小
  watch(terminalHeight, () => {
    handleWindowResize()
  })

  const toggleTerminal = () => {
    if (!settingsStore.display.showTerminal) {
      showTerminal()
    } else {
      hideTerminal()
    }
  }

  const waitForCommand = (id: string, timeout = 30000) => {
    return new Promise<{ success: boolean; exitCode: number | null; output: string }>((resolve) => {
      const tab = tabs.value.find((t) => t.id === id)
      if (!tab) return resolve({ success: false, exitCode: null, output: '' })

      let timer: any = null
      let unwatch = () => { }

      const onDone = (force = false) => {
        if (timer) clearTimeout(timer)
        unwatch()
        tab.forceContinue = undefined
        tab.currentOutput = captureCommandOutput(tab)
        tab.captureStartMarker?.dispose()
        tab.captureStartMarker = undefined
        tab.captureCommand = undefined
        resolve({
          success: force ? true : ((tab.lastExitCode ?? 0) === 0),
          exitCode: force ? 0 : (tab.lastExitCode ?? 0),
          output: tab.currentOutput || ''
        })
      }

      tab.forceContinue = () => onDone(true)

      if (!tab.isExecuting) {
        return onDone()
      }

      unwatch = watch(
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
