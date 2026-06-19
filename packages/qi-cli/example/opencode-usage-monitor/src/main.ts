import type { MainPlugin, MainPluginContext } from '@agent-qi/types'
import type { BrowserWindow, OnBeforeSendHeadersListenerDetails, BeforeSendResponse } from 'electron'

let win: BrowserWindow | null = null
/** 缓存最近一次推送的数据，新窗口 ready 后回放，避免打开瞬间空白 */
let lastData: Record<string, unknown> | null = null
let isWindowReady = false

function injectZenGuide(bw: BrowserWindow) {
  const fn = () => {
    const s = document.createElement('style')
    s.textContent = `@keyframes qi-p{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.7)}50%{box-shadow:0 0 0 10px rgba(59,130,246,0)}}.qi-g{animation:qi-p 1.5s ease-in-out infinite!important;border-radius:6px!important;outline:3px solid #3b82f6!important;outline-offset:2px!important}.qi-t{position:fixed!important;padding:8px 16px!important;border-radius:8px!important;background:#3b82f6!important;color:#fff!important;font-size:14px!important;z-index:9999!important;pointer-events:none!important;white-space:nowrap!important;box-shadow:0 4px 12px rgba(0,0,0,.3)!important;line-height:1.4!important}`
    document.head.appendChild(s)
    const showTipNear = (btn: Element) => {
      const tip = document.createElement('div')
      tip.className = 'qi-t'
      tip.textContent = '登录后可查看用量，请点击此按钮'
      document.body.appendChild(tip)
      const pos = btn.getBoundingClientRect()
      tip.style.left = Math.min(pos.left + pos.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8) + 'px'
      tip.style.top = (pos.bottom + 12) + 'px'
      setTimeout(() => tip.remove(), 8000)
    }
    const sel = 'section[data-component="hero"] a[href="/auth"]'
    const el = document.querySelector(sel)
    if (el) { el.classList.add('qi-g'); showTipNear(el) }
    else {
      const obs = new MutationObserver(() => {
        const m = document.querySelector(sel)
        if (m) { m.classList.add('qi-g'); showTipNear(m); obs.disconnect() }
      })
      obs.observe(document.body, { childList: true, subtree: true })
      setTimeout(() => obs.disconnect(), 30000)
    }
  }
  bw.webContents.executeJavaScript('(' + fn.toString() + ')()').catch(() => {})
}

function injectAuthOAuthGuide(bw: BrowserWindow) {
  const fn = () => {
    if (document.querySelector('.qi-g')) return
    const s = document.createElement('style')
    s.textContent = `@keyframes qi-p{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.7)}50%{box-shadow:0 0 0 10px rgba(59,130,246,0)}}.qi-g{animation:qi-p 1.5s ease-in-out infinite!important;border-radius:6px!important;outline:3px solid #3b82f6!important;outline-offset:2px!important}.qi-t{position:fixed!important;padding:8px 16px!important;border-radius:8px!important;background:#3b82f6!important;color:#fff!important;font-size:14px!important;z-index:9999!important;pointer-events:none!important;white-space:nowrap!important;box-shadow:0 4px 12px rgba(0,0,0,.3)!important;line-height:1.4!important}`
    document.head.appendChild(s)
    const showTip = (text: string, btn: Element) => {
      const tip = document.createElement('div')
      tip.className = 'qi-t'
      tip.textContent = text
      document.body.appendChild(tip)
      const pos = btn.getBoundingClientRect()
      const spaceAbove = pos.top
      const spaceBelow = window.innerHeight - pos.bottom
      const tipAbove = spaceAbove > tip.offsetHeight + 16
      tip.style.left = Math.min(pos.left + pos.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8) + 'px'
      tip.style.top = tipAbove ? (pos.top - tip.offsetHeight - 12) + 'px' : (pos.bottom + 12) + 'px'
      setTimeout(() => tip.remove(), 8000)
    }
    const highlightBtn = (sel: string) => {
      const el = document.querySelector(sel)
      if (el) { el.classList.add('qi-g'); return el }
      return null
    }
    const githubBtn = highlightBtn('a[href="/github/authorize"]')
    const googleBtn = highlightBtn('a[href="/google/authorize"]')
    const found = githubBtn || googleBtn
    if (found) {
      const btn = githubBtn || googleBtn!
      showTip('选择 GitHub 或 Google 账号登录', btn)
    } else {
      const obs = new MutationObserver(() => {
        const g = highlightBtn('a[href="/github/authorize"]')
        const o = highlightBtn('a[href="/google/authorize"]')
        if (g || o) { showTip('选择 GitHub 或 Google 账号登录', g || o!); obs.disconnect() }
      })
      obs.observe(document.body, { childList: true, subtree: true })
      setTimeout(() => obs.disconnect(), 30000)
    }
  }
  bw.webContents.executeJavaScript('(' + fn.toString() + ')()').catch(() => {})
}

const mainPlugin: MainPlugin = {
  name: 'opencode-usage-monitor',
  version: '1.0.0',
  description: 'OpenCode usage monitor main-process window',

  install: (ctx: MainPluginContext) => {
    const { BrowserWindow } = ctx.electron

    const ensureWindow = (): Promise<BrowserWindow> => {
      if (win && !win.isDestroyed()) return Promise.resolve(win)
      isWindowReady = false
      win = new BrowserWindow({
        width: 1280,
        height: 980,
        title: 'OpenCode Zen',
        backgroundColor: '#1a1a1a',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })

      const readyPromise = new Promise<void>((resolve) => {
        win!.webContents.once('did-finish-load', () => {
          isWindowReady = true
          resolve()
        })
        win!.webContents.once('dom-ready', () => {
          isWindowReady = true
          resolve()
        })
      })

      win!.webContents.on('did-finish-load', () => {
        const url = win?.webContents.getURL() || ''
        if (url.includes('auth.opencode.ai/authorize')) {
          injectAuthOAuthGuide(win!)
        } else if (url.includes('opencode.ai/zen') || url.includes('opencode.ai/')) {
          injectZenGuide(win!)
        }
      })

      void win.loadURL('https://opencode.ai/zen')

      const workspaceFilter = { urls: ['https://opencode.ai/workspace/*'] }
      const onWorkspaceRequest = (details: OnBeforeSendHeadersListenerDetails, callback: (response: BeforeSendResponse) => void) => {
        const match = details.url.match(/\/workspace\/(wrk_[^/?]+)/)
        const workId = match ? match[1] : null
        const cookieHeader = (details.requestHeaders['Cookie'] || details.requestHeaders['cookie'] || '') as string
        const authMatch = cookieHeader.match(/(?:^|;\s*)auth=([^;]+)/)
        const authCookie = authMatch ? authMatch[1] : null
        if (workId && authCookie) {
          lastData = { workId, authCookie, timestamp: Date.now() }
          ctx.logger.info(`Captured workspace: ${workId}`)
          const channel = `plugin:${ctx.pluginName}:workspace-data`
          try {
            for (const w of ctx.electron.BrowserWindow.getAllWindows()) {
              if (!w.isDestroyed()) w.webContents.send(channel, { workId, authCookie })
            }
          } catch {}
        }
        callback({ requestHeaders: details.requestHeaders })
      }
      win!.webContents.session.webRequest.onBeforeSendHeaders(workspaceFilter, onWorkspaceRequest)

      win.on('closed', () => {
        try { win?.webContents.session.webRequest.removeListener('onBeforeSendHeaders', onWorkspaceRequest) } catch {}
        win = null
        isWindowReady = false
      })

      return readyPromise.then(() => win as BrowserWindow)
    }

    ctx.ipc.handle('show-window', async () => {
      const w = await ensureWindow()
      w.show()
      w.focus()
      return { ok: true }
    })

    ctx.ipc.handle('hide-window', () => {
      if (win && !win.isDestroyed()) win.hide()
      return { ok: true }
    })

    ctx.onUnload(() => {
      if (win && !win.isDestroyed()) {
        win.destroy()
      }
      win = null
      isWindowReady = false
      lastData = null
    })

    ctx.logger.info('main-process window plugin installed')
  },

  uninstall: (ctx: MainPluginContext) => {
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
    win = null
    isWindowReady = false
    lastData = null
    ctx.logger.info('main-process window plugin uninstalled')
  }
}

export default mainPlugin
