<script setup lang="ts">
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useSettingsStore } from '@renderer/stores/settings'

const settingsStore = useSettingsStore()
const terminalEl = ref<HTMLDivElement | null>(null)

let term: Terminal
let fitAddon: FitAddon
let resizeHandler: () => void

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

onMounted(() => {
  window.api.pty.start()

  term = new Terminal({
    fontSize: 14,
    cursorBlink: true,
    convertEol: true,
    theme: {
      background: '#ffffff',
      foreground: '#333333',
      cursor: '#333333',
      selectionBackground: '#add6ff',
      black: '#000000',
      red: '#cd3131',
      green: '#00bc00',
      yellow: '#949800',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#555555',
      brightBlack: '#666666',
      brightRed: '#cd3131',
      brightGreen: '#14ce14',
      brightYellow: '#b5ba00',
      brightBlue: '#0451a5',
      brightMagenta: '#bc05bc',
      brightCyan: '#0598bc',
      brightWhite: '#a5a5a5'
    }
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)

  term.open(terminalEl.value!)

  setTimeout(() => {
    fitAddon.fit()
  }, 10)

  window.api.pty.onOutput((data) => {
    term.write(data)
  })

  term.onData((data) => {
    window.api.pty.sendInput(data)
  })

  resizeHandler = () => {
    fitAddon.fit()
    window.api.pty.resize(term.cols, term.rows)
  }

  window.addEventListener('resize', resizeHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler)
  term?.dispose()
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
      <span>终端</span>
      <div class="terminal-actions">
        <button @click="settingsStore.display.showTerminal = false" class="close-btn">×</button>
      </div>
    </div>
    <div class="terminal-body">
      <div ref="terminalEl" class="xterm-container" />
    </div>
  </div>
</template>

<style scoped>
.terminal-container {
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
  flex-shrink: 0;
}

.terminal-container.is-resizing {
  user-select: none;
}

.resizer {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 3px;
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
  color: #666;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 12px;
  user-select: none;
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
  position: relative;
}

.xterm-container {
  height: 100%;
  width: 100%;
}
</style>
