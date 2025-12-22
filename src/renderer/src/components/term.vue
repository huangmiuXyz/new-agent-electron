<script setup lang="ts">
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

const terminalEl = ref<HTMLDivElement | null>(null)

let term: Terminal
let fitAddon: FitAddon
let resizeHandler: () => void

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
  fitAddon.fit()

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
  <div ref="terminalEl" />
</template>
