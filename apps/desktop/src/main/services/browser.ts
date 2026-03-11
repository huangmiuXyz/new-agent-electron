import { BrowserWindow, ipcMain, net } from 'electron'

type BrowserActionPayload = {
  sessionId?: string
  action?: string
  [key: string]: unknown
}

type BrowserSession = {
  id: string
  win: BrowserWindow
  visible: boolean
}

type BrowserExecutionState = {
  sessionId: string
  running: boolean
  lastStep: string | null
  logs: string[]
  startedAt: number | null
  finishedAt: number | null
  lastError: string | null
}

const browserSessions = new Map<string, BrowserSession>()
const browserExecutionStates = new Map<string, BrowserExecutionState>()
const DEFAULT_SESSION_ID = 'default'

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.stack || error.message
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error, null, 2)
    } catch {
      return Object.prototype.toString.call(error)
    }
  }
  return String(error)
}

const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || error.message
    }
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return {
        name: 'NonErrorObject',
        message: JSON.stringify(error),
        stack: JSON.stringify(error, null, 2)
      }
    } catch {
      return {
        name: 'NonErrorObject',
        message: Object.prototype.toString.call(error),
        stack: Object.prototype.toString.call(error)
      }
    }
  }

  return {
    name: typeof error,
    message: String(error),
    stack: String(error)
  }
}

const getDurationMs = (startedAt: number | null, finishedAt: number | null) => {
  if (!startedAt || !finishedAt) return null
  return Math.max(0, finishedAt - startedAt)
}

const trimForSnapshot = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}…`
}

const buildElementSelector = (el: Element) => {
  const tag = el.tagName.toLowerCase()
  const id = el.getAttribute('id')
  if (id) return `${tag}#${id}`

  const name = el.getAttribute('name')
  if (name) return `${tag}[name=${JSON.stringify(name)}]`

  const type = el.getAttribute('type')
  if (type) return `${tag}[type=${JSON.stringify(type)}]`

  const role = el.getAttribute('role')
  if (role) return `${tag}[role=${JSON.stringify(role)}]`

  return tag
}

const buildExecutionMetadata = (session: BrowserSession, state: BrowserExecutionState) => ({
  finalUrl: session.win.webContents.getURL(),
  loading: session.win.webContents.isLoading(),
  title: session.win.webContents.getTitle(),
  timing: {
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    durationMs: getDurationMs(state.startedAt, state.finishedAt)
  }
})

const getSessionId = (payload?: BrowserActionPayload) => {
  const value = payload?.sessionId
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SESSION_ID
}

const getExecutionState = (sessionId: string): BrowserExecutionState => {
  const existing = browserExecutionStates.get(sessionId)
  if (existing) return existing

  const created: BrowserExecutionState = {
    sessionId,
    running: false,
    lastStep: null,
    logs: [],
    startedAt: null,
    finishedAt: null,
    lastError: null
  }
  browserExecutionStates.set(sessionId, created)
  return created
}

const beginExecutionState = (sessionId: string) => {
  const state = getExecutionState(sessionId)
  state.running = true
  state.lastStep = 'starting'
  state.logs = []
  state.startedAt = Date.now()
  state.finishedAt = null
  state.lastError = null
  return state
}

const finishExecutionState = (sessionId: string, error?: string) => {
  const state = getExecutionState(sessionId)
  state.running = false
  state.finishedAt = Date.now()
  state.lastError = error || null
  return state
}

const pushExecutionLog = (sessionId: string, step: string) => {
  const state = getExecutionState(sessionId)
  const line = `[${new Date().toISOString()}] ${step}`
  state.lastStep = step
  state.logs = [...state.logs, line]
  return line
}

const createWindow = (sessionId: string, visible: boolean) => {
  const win = new BrowserWindow({
    show: visible,
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `agent-qi-browser-${sessionId}`,
      backgroundThrottling: false
    }
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return win
}

const waitForPossibleNavigation = async (session: BrowserSession, timeoutMs: number) => {
  if (!session.win.webContents.isLoadingMainFrame() && !session.win.webContents.isLoading()) {
    return
  }

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        session.win.webContents.removeListener('did-finish-load', onLoad)
        session.win.webContents.removeListener('did-fail-load', onFail)
      }

      const onLoad = () => {
        cleanup()
        resolve()
      }

      const onFail = (_event: Event, _code: number, description: string) => {
        cleanup()
        reject(new Error(`Navigation failed: ${description}`))
      }

      session.win.webContents.once('did-finish-load', onLoad)
      session.win.webContents.once('did-fail-load', onFail)
    }),
    timeoutMs,
    'post-execution navigation'
  )
}

const getOrCreateSession = (sessionId: string) => {
  const existing = browserSessions.get(sessionId)
  if (existing && !existing.win.isDestroyed()) return existing

  const session: BrowserSession = {
    id: sessionId,
    win: createWindow(sessionId, false),
    visible: false
  }

  session.win.on('closed', () => {
    browserSessions.delete(sessionId)
  })

  browserSessions.set(sessionId, session)
  return session
}

const setSessionVisibility = (session: BrowserSession, visible: boolean) => {
  session.visible = visible
  if (session.win.isDestroyed()) return
  if (visible) {
    session.win.show()
    session.win.focus()
  } else {
    session.win.hide()
  }
}

const createSerializableResult = (value: unknown): unknown => {
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(createSerializableResult)
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { type: 'buffer', base64: value.toString('base64') }
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      output[key] = createSerializableResult(item)
    }
    return output
  }
  return String(value)
}

const isGotoInstruction = (value: unknown): value is { __browser_goto: string } => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    '__browser_goto' in value &&
    typeof (value as { __browser_goto?: unknown }).__browser_goto === 'string'
  )
}

const extractDirectNavigationUrl = (code: string): string | null => {
  const patterns = [
    /__browser_goto\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]/i,
    /(?:window\.)?location\.href\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/i,
    /window\.open\(\s*["'`](https?:\/\/[^"'`]+)["'`]/i
  ]

  for (const pattern of patterns) {
    const match = code.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

const getPageSnapshot = async (session: BrowserSession) => {
  return session.win.webContents.executeJavaScript(
    `(() => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      }

      const trimForSnapshot = (value, max = 200) => {
        const text = String(value || '').replace(/\s+/g, ' ').trim()
        return text.length > max ? text.slice(0, max) + '…' : text
      }

      const norm = (value, max = 200) => trimForSnapshot(value, max)

      const selector = (el) => {
        const tag = el.tagName.toLowerCase()
        const id = el.getAttribute('id')
        if (id) return tag + '#' + id
        const name = el.getAttribute('name')
        if (name) return tag + '[name=' + JSON.stringify(name) + ']'
        const type = el.getAttribute('type')
        if (type) return tag + '[type=' + JSON.stringify(type) + ']'
        const role = el.getAttribute('role')
        if (role) return tag + '[role=' + JSON.stringify(role) + ']'
        return tag
      }

      const currentUrl = location.href
      const currentHash = location.hash || ''
      const activeElement = document.activeElement
      const activeElementInfo = activeElement && activeElement !== document.body
        ? {
            tag: activeElement.tagName.toLowerCase(),
            selector: selector(activeElement),
            text: norm(activeElement.innerText || activeElement.value || activeElement.getAttribute('aria-label') || '', 120)
          }
        : null

      const getMainContent = () => {
        const selectors = ['main', 'article', '[role="main"]', '.mw-parser-output', '#content', '.content', '.main', '.main-content']
        for (const selector of selectors) {
          const el = document.querySelector(selector)
          if (el && visible(el)) return el
        }

        const candidates = [...document.querySelectorAll('div,section,article,main')]
          .filter(visible)
          .map((el) => ({ el, len: norm(el.innerText, 20000).length }))
          .sort((a, b) => b.len - a.len)

        return candidates[0]?.el || document.body
      }

      const detectPageState = () => {
        const title = norm(document.title, 500).toLowerCase()
        const bodyText = norm(document.body?.innerText || '', 5000).toLowerCase()
        const url = location.href.toLowerCase()

        if (
          /captcha|challenge|verify|verification|人机验证|请解决以下难题以继续|最后一步/.test(title + '\n' + bodyText)
        ) {
          return 'blocked'
        }
        if (
          /找不到这个页面|页面不存在|no results|没有找到|did not match any documents|未找到/.test(bodyText)
        ) {
          return 'not_found'
        }
        if (
          /[?&](wd|q|query|search)=/.test(url) || /百度搜索| - 搜索|search results|搜索结果/.test(title)
        ) {
          return 'search_results'
        }
        return 'content'
      }

      const main = getMainContent()
      const mainText = norm(main?.innerText || document.body?.innerText || '', 4000)
      const textSample = norm(document.body?.innerText || '', 4000)

      const buttons = [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]
        .filter(visible)
        .slice(0, 50)
        .map((el, index) => ({
          id: 'btn_' + index,
          text: norm(el.innerText || el.value || el.getAttribute('aria-label') || '', 120),
          selector: selector(el),
          disabled: 'disabled' in el ? Boolean(el.disabled) : false
        }))

      const inputs = [...document.querySelectorAll('input,textarea,select')]
        .filter(visible)
        .slice(0, 50)
        .map((el, index) => ({
          id: 'input_' + index,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || undefined,
          name: el.getAttribute('name') || undefined,
          selector: selector(el),
          placeholder: norm(el.getAttribute('placeholder') || '', 120),
          value: 'value' in el ? norm(el.value || '', 120) : '',
          disabled: 'disabled' in el ? Boolean(el.disabled) : false
        }))

      const links = [...document.querySelectorAll('a')]
        .filter(visible)
        .slice(0, 50)
        .map((el, index) => ({
          id: 'link_' + index,
          text: norm(el.innerText || el.getAttribute('aria-label') || '', 120),
          href: el.href,
          selector: selector(el)
        }))

      const searchResults = [...document.querySelectorAll('article, .b_algo, .result, .c-container, .g, .mw-search-result, li[data-hveid], .tF2Cxc')]
        .filter(visible)
        .map((el) => {
          const link = el.querySelector('a[href]')
          const titleEl = el.querySelector('h1,h2,h3,h4') || link
          const text = norm(el.innerText || '', 500)
          return {
            title: norm(titleEl?.innerText || link?.textContent || '', 160),
            url: link?.href || '',
            snippet: text
          }
        })
        .filter((item) => item.title || item.url || item.snippet)
        .slice(0, 10)

      return {
        title: document.title,
        url: currentUrl,
        hash: currentHash,
        state: detectPageState(),
        readyState: document.readyState,
        activeElement: activeElementInfo,
        mainText,
        textSample,
        searchResults,
        buttons,
        inputs,
        links
      }
    })()`,
    true
  )
}
const navigateSession = async (session: BrowserSession, url: string, timeoutMs: number) => {
  await withTimeout(net.fetch(url, { method: 'GET', redirect: 'follow' }), Math.min(timeoutMs, 15000), `Preflight ${url}`)
  await withTimeout(session.win.loadURL(url), timeoutMs, `loadURL ${url}`)
}

const executeBrowserCode = async (payload: BrowserActionPayload) => {
  const sessionId = getSessionId(payload)
  const code = typeof payload.code === 'string' ? payload.code : ''
  const timeoutMs =
    typeof payload.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs)
      ? Math.max(1000, Math.round(payload.timeoutMs))
      : 30000
  const headless = payload.headless !== false

  if (!code.trim()) {
    throw new Error('code is required')
  }

  const state = beginExecutionState(sessionId)
  const session = getOrCreateSession(sessionId)
  setSessionVisibility(session, !headless)

  try {
    const directNavigationUrl = extractDirectNavigationUrl(code)
    if (directNavigationUrl) {
      pushExecutionLog(sessionId, `browser.directNavigation(${JSON.stringify(directNavigationUrl)})`)
      const beforeUrl = session.win.webContents.getURL()
      await navigateSession(session, directNavigationUrl, timeoutMs)
      pushExecutionLog(sessionId, 'browser.directNavigation(done)')
      finishExecutionState(sessionId)
      const finalState = getExecutionState(sessionId)
      return {
        sessionId,
        execution: {
          mode: 'direct_navigation',
          requestedUrl: directNavigationUrl,
          returnedValue: null
        },
        navigation: {
          detected: true,
          type: beforeUrl && new URL(beforeUrl).origin === new URL(directNavigationUrl).origin ? 'full-navigation-same-origin' : 'full-navigation-cross-origin',
          fromUrl: beforeUrl,
          toUrl: session.win.webContents.getURL()
        },
        page: buildExecutionMetadata(session, finalState),
        logs: finalState.logs,
        pageSnapshot: await getPageSnapshot(session)
      }
    }

    const beforeUrl = session.win.webContents.getURL()
    pushExecutionLog(sessionId, 'browser.executeJavaScript(start)')

    // Optional reachability hint for common navigations written directly in JS.
    const urlMatch = code.match(/https?:\/\/[^\s"'`]+/)
    if (urlMatch?.[0]) {
      pushExecutionLog(sessionId, `browser.preflight(${JSON.stringify(urlMatch[0])})`)
      try {
        await withTimeout(net.fetch(urlMatch[0], { method: 'GET', redirect: 'follow' }), 15000, `Preflight ${urlMatch[0]}`)
      } catch (error) {
        pushExecutionLog(sessionId, `browser.preflight_failed(${toErrorMessage(error)})`)
      }
    }

    const wrappedCode = `
      (async () => {
        const __agentQiOriginalOpen = window.open
        window.open = function (url) {
          if (url != null) {
            location.href = String(url)
          }
          return null
        }
        try {
          ${code}
        } finally {
          window.open = __agentQiOriginalOpen
        }
      })()
    `

    const result = await withTimeout(
      session.win.webContents.executeJavaScript(wrappedCode, true),
      timeoutMs,
      'browser executeJavaScript'
    )

    pushExecutionLog(sessionId, 'browser.executeJavaScript(done)')

    let navigation: {
      detected: boolean
      type: 'no-navigation' | 'same-document' | 'full-navigation-same-origin' | 'full-navigation-cross-origin' | 'main-goto'
      fromUrl: string
      toUrl: string
      requestedUrl?: string
    } = {
      detected: false,
      type: 'no-navigation',
      fromUrl: beforeUrl,
      toUrl: beforeUrl
    }

    if (isGotoInstruction(result)) {
      pushExecutionLog(sessionId, `browser.mainGoto(${JSON.stringify(result.__browser_goto)})`)
      await navigateSession(session, result.__browser_goto, timeoutMs)
      pushExecutionLog(sessionId, 'browser.mainGoto(done)')
      navigation = {
        detected: true,
        type: 'main-goto',
        fromUrl: beforeUrl,
        toUrl: session.win.webContents.getURL(),
        requestedUrl: result.__browser_goto
      }
    } else {
      pushExecutionLog(sessionId, 'browser.waitForPossibleNavigation()')
      await waitForPossibleNavigation(session, Math.min(timeoutMs, 15000))
      pushExecutionLog(sessionId, 'browser.waitForPossibleNavigation(done)')
      const afterUrl = session.win.webContents.getURL()
      if (afterUrl !== beforeUrl) {
        const beforeWithoutHash = beforeUrl.split('#')[0]
        const afterWithoutHash = afterUrl.split('#')[0]
        navigation = {
          detected: true,
          type:
            beforeWithoutHash === afterWithoutHash
              ? 'same-document'
              : new URL(beforeUrl).origin === new URL(afterUrl).origin
                ? 'full-navigation-same-origin'
                : 'full-navigation-cross-origin',
          fromUrl: beforeUrl,
          toUrl: afterUrl
        }
      }
    }

    finishExecutionState(sessionId)
    const finalState = getExecutionState(sessionId)

    return {
      sessionId,
      execution: {
        mode: 'execute_javascript',
        returnedValue: createSerializableResult(result)
      },
      navigation,
      page: buildExecutionMetadata(session, finalState),
      logs: finalState.logs,
      pageSnapshot: await getPageSnapshot(session)
    }
  } catch (error) {
    const details = getErrorDetails(error)
    finishExecutionState(sessionId, details.stack)
    const finalState = getExecutionState(sessionId)
    throw new Error(
      [
        `browser execution failed`,
        `error_name: ${details.name}`,
        `error_message: ${details.message}`,
        `error_stack:\n${details.stack}`,
        finalState.lastStep ? `last_step: ${finalState.lastStep}` : '',
        finalState.logs.length ? `logs:\n${finalState.logs.join('\n')}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
    )
  } finally {
    const current = getExecutionState(sessionId)
    if (current.running) {
      finishExecutionState(sessionId)
    }
  }
}

const browserActionHandlers = {
  execute_code: async (payload: BrowserActionPayload) => executeBrowserCode(payload),
  close: async (payload: BrowserActionPayload) => {
    const sessionId = getSessionId(payload)
    const session = browserSessions.get(sessionId)
    if (!session || session.win.isDestroyed()) {
      return { sessionId, closed: false }
    }
    session.win.close()
    browserSessions.delete(sessionId)
    return { sessionId, closed: true }
  }
} satisfies Record<string, (payload: BrowserActionPayload) => Promise<unknown>>

export const setupBrowserHandlers = () => {
  ipcMain.handle('browser:run', async (_event, payload: BrowserActionPayload = {}) => {
    const action = typeof payload.action === 'string' ? payload.action : ''
    const handler = browserActionHandlers[action]

    if (!handler) {
      return {
        ok: false,
        error: `Unsupported browser action: ${action || 'unknown'}`
      }
    }

    try {
      return {
        ok: true,
        data: await handler(payload)
      }
    } catch (error) {
      return {
        ok: false,
        error: toErrorMessage(error)
      }
    }
  })

  ipcMain.handle('browser:get-state', async (_event, sessionId?: string) => {
    const normalizedSessionId =
      typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : DEFAULT_SESSION_ID
    return getExecutionState(normalizedSessionId)
  })
}
