import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'

export function useXterm() {
  let term: Terminal | null = null
  let fitAddon: FitAddon | null = null
  const terminalContainer = ref(null)

  const initTerminal = () => {
    if (!terminalContainer.value || term) return

    term = new Terminal({
      cursorBlink: true,
      fontSize: 14
    })

    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(terminalContainer.value)
    fitAddon.fit()
    window.api.onTerminalData((data) => {
      term!.write(data)
    })

    term.onData((data) => {
      window.api.writeToTerminal(data)
    })

    const handleResize = () => {
      if (fitAddon) {
        fitAddon.fit()
        const { cols, rows } = term!
        window.api.resizeTerminal(cols, rows)
      }
    }
    window.addEventListener('resize', handleResize)

    window.api.onTerminalExit(() => {
      term!.write('\r\n\n\r\n[Process exited. Press any key to close.]\r\n')
      term!.onData(() => {
        dispose()
      })
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize)
    })
  }

  const dispose = () => {
    if (term) {
      term.dispose()
      term = null
      fitAddon = null
    }
  }
  onMounted(() => {
    initTerminal()
  })
  onBeforeUnmount(() => {
    dispose()
  })

  return {
    terminalContainer
  }
}
