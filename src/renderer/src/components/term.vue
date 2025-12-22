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
      background: '#000000'
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
  <div ref="terminalEl" style="width: 100vw; height: 100vh; background: black" />
</template>
