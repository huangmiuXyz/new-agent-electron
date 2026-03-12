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

const getUrlOrigin = (value: string) => {
  try {
    return value ? new URL(value).origin : null
  } catch {
    return null
  }
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
      const onLoad = () => {
        cleanup()
        resolve()
      }

      const onFail = (
        _event: Electron.Event,
        _errorCode: number,
        errorDescription: string
      ) => {
        cleanup()
        reject(new Error(`Navigation failed: ${errorDescription}`))
      }

      const cleanup = () => {
        session.win.webContents.off('did-finish-load', onLoad)
        session.win.webContents.off('did-fail-load', onFail)
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

const pageSnapshotEvaluator = () => {
  const clean = (value: unknown, max = 200) => {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
    return text.length > max ? `${text.slice(0, max)}…` : text
  }

  const visible = (el: Element | null) => {
    if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return false
    const rect = (el as HTMLElement).getBoundingClientRect()
    const style = window.getComputedStyle(el)
    return !!style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
  }

  const selector = (el: Element | null) => {
    if (!el || !el.tagName) return 'unknown'
    const tag = String(el.tagName).toLowerCase()
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

  const textOf = (el: Element | null, max = 120) => {
    if (!el) return ''
    const inputEl = el as HTMLInputElement
    return clean(
      (el as HTMLElement).innerText ||
        el.textContent ||
        inputEl.value ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        '',
      max
    )
  }

  const attrText = (el: Element | null) => {
    if (!el) return ''
    return [el.getAttribute('id'), el.getAttribute('class'), el.getAttribute('role'), el.getAttribute('aria-label')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }

  const hasAncestor = (el: Element | null, selectorText: string) => {
    if (!el || typeof el.closest !== 'function') return false
    return Boolean(el.closest(selectorText))
  }

  const collectDocumentSnapshot = (doc: Document, frameEl: HTMLIFrameElement | null = null) => {
    const scopeVisible = (el: Element | null) => {
      if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return false
      const rect = (el as HTMLElement).getBoundingClientRect()
      const style = doc.defaultView?.getComputedStyle(el)
      return !!style && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }

    const scopeTextOf = (el: Element | null, max = 120) => {
      if (!el) return ''
      const inputEl = el as HTMLInputElement
      return clean(
        (el as HTMLElement).innerText ||
          el.textContent ||
          inputEl.value ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          '',
        max
      )
    }

    const findMain = () => {
      const selectors = ['main', 'article', '[role="main"]', '#content', '.content', '.main', '.main-content']
      for (const value of selectors) {
        const found = doc.querySelector(value)
        if (found && scopeVisible(found)) return found
      }
      return doc.body
    }

    const mainEl = findMain()
    const bodyText = clean(doc.body ? doc.body.innerText || doc.body.textContent || '' : '', 3000)
    const mainText = clean(scopeTextOf(mainEl, 3500) || bodyText, 3000)
    const activeEl = doc.activeElement

    return {
      frameSelector: frameEl ? selector(frameEl) : null,
      title: doc.title || '',
      url: doc.defaultView?.location?.href || '',
      readyState: doc.readyState || 'unknown',
      activeElement:
        activeEl && activeEl !== doc.body
          ? {
              tag: activeEl.tagName ? String(activeEl.tagName).toLowerCase() : 'unknown',
              selector: selector(activeEl),
              text: scopeTextOf(activeEl)
            }
          : null,
      mainText,
      buttons: Array.from(doc.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
        .filter((el) => scopeVisible(el))
        .slice(0, 20)
        .map((el, index) => ({
          id: `frame_btn_${index}`,
          text: scopeTextOf(el),
          selector: selector(el)
        })),
      inputs: Array.from(doc.querySelectorAll('input,textarea,select'))
        .filter((el) => scopeVisible(el))
        .slice(0, 20)
        .map((el, index) => ({
          id: `frame_input_${index}`,
          tag: el.tagName ? String(el.tagName).toLowerCase() : 'unknown',
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          selector: selector(el)
        })),
      links: Array.from(doc.querySelectorAll('a[href]'))
        .filter((el) => scopeVisible(el))
        .slice(0, 20)
        .map((el, index) => ({
          id: `frame_link_${index}`,
          text: scopeTextOf(el),
          href: (el as HTMLAnchorElement).href || '',
          selector: selector(el)
        }))
        .filter((item) => item.text || item.href)
    }
  }

  const regionOf = (el: Element | null, mainEl: Element | null) => {
    if (!el) return 'unknown'
    if (mainEl && (el === mainEl || mainEl.contains(el))) return 'main'
    if (hasAncestor(el, 'form')) return 'form'
    if (hasAncestor(el, 'header, [role="banner"]')) return 'header'
    if (hasAncestor(el, 'nav, [role="navigation"]')) return 'nav'
    if (hasAncestor(el, 'footer, [role="contentinfo"]')) return 'footer'
    if (hasAncestor(el, 'aside, [role="complementary"]')) return 'aside'
    if (hasAncestor(el, '[role="dialog"], dialog, .modal, .popup, .popover, .drawer')) return 'overlay'
    if (hasAncestor(el, 'article, [role="article"], .result, .results, .search-results, .b_algo, .tF2Cxc, .c-container, .mw-search-result')) {
      return 'search_result'
    }
    return 'unknown'
  }

  const isStructuralNoise = (el: Element | null) => {
    if (!el) return false
    const attrs = attrText(el)
    return /cookie|consent|privacy|gdpr|reward|feedback|popover|modal|dialog|drawer|tooltip|share/.test(attrs)
  }

  const isNoiseText = (text: string) => {
    return /^(manage cookies|cookie settings|accept|reject|allow all|decline|like|dislike|feedback|share|更多|喜欢|不喜欢|microsoft rewards)$/i.test(
      text.toLowerCase()
    )
  }

  const findMainContent = () => {
    const selectors = ['main', 'article', '[role="main"]', '#content', '.content', '.main', '.main-content']
    for (const value of selectors) {
      const found = document.querySelector(value)
      if (found && visible(found)) return found
    }

    const candidates = Array.from(document.querySelectorAll('section, article, main, div'))
      .filter((el) => visible(el))
      .map((el) => ({ el, len: textOf(el, 10000).length }))
      .filter((item) => item.len > 120)
      .sort((a, b) => b.len - a.len)

    return candidates[0]?.el || document.body
  }

  const scoreElement = (el: Element | null, mainEl: Element | null) => {
    if (!el) return -1000
    let score = 0
    const region = regionOf(el, mainEl)
    if (region === 'main') score += 60
    else if (region === 'form') score += 50
    else if (region === 'search_result') score += 45
    else if (region === 'overlay') score += 10
    else if (region === 'header' || region === 'nav') score -= 10
    else if (region === 'footer' || region === 'aside') score -= 20

    if (hasAncestor(el, 'form')) score += 20
    if (hasAncestor(el, 'main, article, [role="main"]')) score += 15
    if (isStructuralNoise(el)) score -= 15

    const text = textOf(el)
    if (isNoiseText(text)) score -= 10
    if (!text) score -= 5
    return score
  }

  const title = document.title || ''
  const url = location.href || ''
  const hash = location.hash || ''
  const readyState = document.readyState || 'unknown'
  const bodyText = clean(document.body ? document.body.innerText || document.body.textContent || '' : '', 4000)
  const mainEl = findMainContent()
  const mainText = clean(textOf(mainEl, 5000) || bodyText, 4000)
  const activeEl = document.activeElement
  const active = activeEl && activeEl !== document.body
    ? {
        tag: activeEl.tagName ? String(activeEl.tagName).toLowerCase() : 'unknown',
        selector: selector(activeEl),
        text: textOf(activeEl)
      }
    : null

  const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'))
    .filter((el) => visible(el))
    .sort((a, b) => scoreElement(b, mainEl) - scoreElement(a, mainEl))
    .slice(0, 60)
    .map((el, index) => ({
      id: `btn_${index}`,
      text: textOf(el),
      selector: selector(el),
      disabled: Boolean((el as HTMLButtonElement | HTMLInputElement).disabled),
      priority: scoreElement(el, mainEl),
      region: regionOf(el, mainEl)
    }))

  const inputs = Array.from(document.querySelectorAll('input,textarea,select'))
    .filter((el) => visible(el))
    .sort((a, b) => scoreElement(b, mainEl) - scoreElement(a, mainEl))
    .slice(0, 60)
    .map((el, index) => {
      const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      const type = el.getAttribute('type') || ''
      const rawValue = typeof inputEl.value === 'string' ? inputEl.value : ''
      return {
        id: `input_${index}`,
        tag: el.tagName ? String(el.tagName).toLowerCase() : 'unknown',
        type,
        name: el.getAttribute('name') || '',
        selector: selector(el),
        placeholder: clean(el.getAttribute('placeholder') || '', 120),
        value: type === 'password' ? (rawValue ? '••••••••' : '') : clean(rawValue, 120),
        disabled: Boolean(inputEl.disabled),
        priority: scoreElement(el, mainEl),
        region: regionOf(el, mainEl)
      }
    })

  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter((el) => visible(el))
    .filter((el) => Boolean(textOf(el)))
    .sort((a, b) => scoreElement(b, mainEl) - scoreElement(a, mainEl))
    .slice(0, 80)
    .map((el, index) => ({
      id: `link_${index}`,
      text: textOf(el),
      href: (el as HTMLAnchorElement).href || '',
      selector: selector(el),
      priority: scoreElement(el, mainEl),
      region: regionOf(el, mainEl)
    }))

  const searchResults = Array.from(document.querySelectorAll('article, .b_algo, .result, .c-container, .g, .mw-search-result, li[data-hveid], .tF2Cxc'))
    .filter((el) => visible(el))
    .slice(0, 10)
    .map((el) => {
      const link = el.querySelector('a[href]') as HTMLAnchorElement | null
      const titleEl = el.querySelector('h1,h2,h3,h4') || link
      return {
        title: textOf(titleEl, 160),
        url: link?.href || '',
        snippet: textOf(el, 500)
      }
    })
    .filter((item) => item.title || item.url || item.snippet)

  const iframes = Array.from(document.querySelectorAll('iframe'))
    .slice(0, 20)
    .map((frame, index) => {
      const iframe = frame as HTMLIFrameElement
      const base = {
        id: `frame_${index}`,
        selector: selector(iframe),
        src: iframe.src || iframe.getAttribute('src') || '',
        visible: visible(iframe),
        active: document.activeElement === iframe,
        sameOrigin: false,
        accessible: false,
        title: '',
        url: '',
        mainText: '',
        buttons: [],
        inputs: [],
        links: []
      }

      try {
        const doc = iframe.contentDocument
        const href = iframe.contentWindow?.location?.href || ''
        const sameOrigin = !!doc && !!href
        if (!doc || !sameOrigin) {
          return base
        }

        const frameSnapshot = collectDocumentSnapshot(doc, iframe)
        return {
          ...base,
          sameOrigin: true,
          accessible: true,
          title: frameSnapshot.title,
          url: frameSnapshot.url,
          mainText: frameSnapshot.mainText,
          activeElement: frameSnapshot.activeElement,
          buttons: frameSnapshot.buttons,
          inputs: frameSnapshot.inputs,
          links: frameSnapshot.links
        }
      } catch {
        return base
      }
    })

  let state = 'content'
  const lower = `${title}\n${mainText}\n${url}`.toLowerCase()
  if (/captcha|verify you are human|human verification|security check|access denied|bot detection|人机验证|安全验证/.test(lower)) {
    state = 'blocked'
  } else if (/[?&](wd|q|query|search)=/.test(url.toLowerCase()) || /search results|搜索结果/.test(lower)) {
    state = 'search_results'
  } else if (/not found|页面不存在|未找到/.test(lower)) {
    state = 'not_found'
  }

  return {
    title,
    url,
    hash,
    state,
    readyState,
    activeElement: active,
    mainText,
    textSample: bodyText,
    searchResults,
    buttons,
    inputs,
    links,
    iframes
  }
}

const getPageSnapshot = async (session: BrowserSession) => {
  const snapshotCode = `(${pageSnapshotEvaluator.toString()})()`

  try {
    return await session.win.webContents.executeJavaScript(snapshotCode, true)
  } catch (error) {
    return {
      title: session.win.webContents.getTitle(),
      url: session.win.webContents.getURL(),
      hash: '',
      state: 'snapshot_error',
      readyState: 'unknown',
      activeElement: null,
      mainText: '',
      textSample: '',
      searchResults: [],
      buttons: [],
      inputs: [],
      links: [],
      snapshotError: toErrorMessage(error)
    }
  }
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

  beginExecutionState(sessionId)
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
      pushExecutionLog(sessionId, 'browser.getPageSnapshot(start)')
      const pageSnapshot = await getPageSnapshot(session)
      pushExecutionLog(sessionId, `browser.getPageSnapshot(done:${String((pageSnapshot as { state?: unknown })?.state || 'unknown')})`)
      if (pageSnapshot && typeof pageSnapshot === 'object' && 'iframes' in pageSnapshot && Array.isArray((pageSnapshot as { iframes?: unknown[] }).iframes)) {
        const frames = (pageSnapshot as { iframes: Array<{ visible?: boolean; accessible?: boolean; sameOrigin?: boolean; src?: string }> }).iframes
        pushExecutionLog(sessionId, `browser.getPageSnapshot(iframes:${frames.length})`)
        pushExecutionLog(
          sessionId,
          `browser.getPageSnapshot(iframes_visible:${frames.filter((item) => item?.visible).length},accessible:${frames.filter((item) => item?.accessible).length},same_origin:${frames.filter((item) => item?.sameOrigin).length})`
        )
        for (const [index, frame] of frames.slice(0, 3).entries()) {
          pushExecutionLog(
            sessionId,
            `browser.getPageSnapshot(iframe_${index}:visible=${String(!!frame.visible)},accessible=${String(!!frame.accessible)},sameOrigin=${String(!!frame.sameOrigin)},src=${JSON.stringify(String(frame.src || ''))})`
          )
        }
      }
      if (pageSnapshot && typeof pageSnapshot === 'object' && 'snapshotError' in pageSnapshot) {
        pushExecutionLog(sessionId, `browser.getPageSnapshot(error:${String((pageSnapshot as { snapshotError?: unknown }).snapshotError || '')})`)
      }
      return {
        sessionId,
        execution: {
          mode: 'direct_navigation',
          requestedUrl: directNavigationUrl,
          returnedValue: null
        },
        navigation: {
          detected: true,
          type:
            beforeUrl && getUrlOrigin(beforeUrl) && getUrlOrigin(beforeUrl) === getUrlOrigin(directNavigationUrl)
              ? 'full-navigation-same-origin'
              : 'full-navigation-cross-origin',
          fromUrl: beforeUrl,
          toUrl: session.win.webContents.getURL()
        },
        page: buildExecutionMetadata(session, finalState),
        logs: getExecutionState(sessionId).logs,
        pageSnapshot
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
              : getUrlOrigin(beforeUrl) && getUrlOrigin(beforeUrl) === getUrlOrigin(afterUrl)
                ? 'full-navigation-same-origin'
                : 'full-navigation-cross-origin',
          fromUrl: beforeUrl,
          toUrl: afterUrl
        }
      }
    }

    finishExecutionState(sessionId)
    const finalState = getExecutionState(sessionId)
    pushExecutionLog(sessionId, 'browser.getPageSnapshot(start)')
    const pageSnapshot = await getPageSnapshot(session)
    pushExecutionLog(sessionId, `browser.getPageSnapshot(done:${String((pageSnapshot as { state?: unknown })?.state || 'unknown')})`)
    if (pageSnapshot && typeof pageSnapshot === 'object' && 'iframes' in pageSnapshot && Array.isArray((pageSnapshot as { iframes?: unknown[] }).iframes)) {
      const frames = (pageSnapshot as { iframes: Array<{ visible?: boolean; accessible?: boolean; sameOrigin?: boolean; src?: string }> }).iframes
      pushExecutionLog(sessionId, `browser.getPageSnapshot(iframes:${frames.length})`)
      pushExecutionLog(
        sessionId,
        `browser.getPageSnapshot(iframes_visible:${frames.filter((item) => item?.visible).length},accessible:${frames.filter((item) => item?.accessible).length},same_origin:${frames.filter((item) => item?.sameOrigin).length})`
      )
      for (const [index, frame] of frames.slice(0, 3).entries()) {
        pushExecutionLog(
          sessionId,
          `browser.getPageSnapshot(iframe_${index}:visible=${String(!!frame.visible)},accessible=${String(!!frame.accessible)},sameOrigin=${String(!!frame.sameOrigin)},src=${JSON.stringify(String(frame.src || ''))})`
        )
      }
    }
    if (pageSnapshot && typeof pageSnapshot === 'object' && 'snapshotError' in pageSnapshot) {
      pushExecutionLog(sessionId, `browser.getPageSnapshot(error:${String((pageSnapshot as { snapshotError?: unknown }).snapshotError || '')})`)
    }

    return {
      sessionId,
      execution: {
        mode: 'execute_javascript',
        returnedValue: createSerializableResult(result)
      },
      navigation,
      page: buildExecutionMetadata(session, finalState),
      logs: getExecutionState(sessionId).logs,
      pageSnapshot
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
