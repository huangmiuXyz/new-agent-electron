<script setup lang="ts">
import { acquireZIndex } from '@renderer/utils/z-index-manager'

const { Search, ChevronUp, ChevronDown, X } = useIcon([
  'Search',
  'ChevronUp',
  'ChevronDown',
  'X'
])

const visible = ref(false)
const query = ref('')
const activeMatch = ref(0)
const matches = ref(0)
const findBarZIndex = acquireZIndex()
const inputRef = ref<HTMLInputElement | null>(null)
let findTimer: ReturnType<typeof setTimeout> | null = null
let matchRanges: Range[] = []

const MATCH_HIGHLIGHT = 'agent-qi-page-find-match'
const ACTIVE_HIGHLIGHT = 'agent-qi-page-find-active'

type HighlightConstructor = new (...ranges: Range[]) => Highlight
type HighlightRegistry = Map<string, Highlight>

const getHighlightApi = () => {
  const css = CSS as typeof CSS & { highlights?: HighlightRegistry }
  const HighlightClass = window.Highlight as HighlightConstructor | undefined
  if (!css.highlights || !HighlightClass) return null
  return { highlights: css.highlights, HighlightClass }
}

const hasQuery = computed(() => query.value.trim().length > 0)
const resultText = computed(() => {
  if (!hasQuery.value) return ''
  if (matches.value === 0) return '0/0'
  return `${activeMatch.value}/${matches.value}`
})

const clearHighlights = () => {
  const api = getHighlightApi()
  api?.highlights.delete(MATCH_HIGHLIGHT)
  api?.highlights.delete(ACTIVE_HIGHLIGHT)
  matchRanges = []
}

const shouldSkipNode = (node: Node) => {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement

  return Boolean(element?.closest([
    '.page-find-bar',
    'script',
    'style',
    'noscript',
    'textarea',
    'input',
    'select',
    'button'
  ].join(',')))
}

const collectRanges = (text: string) => {
  const ranges: Range[] = []
  const needle = text.toLocaleLowerCase()
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue?.trim() || shouldSkipNode(node)) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      }
    }
  )

  let node = walker.nextNode()
  while (node) {
    const value = node.nodeValue ?? ''
    const haystack = value.toLocaleLowerCase()
    let start = haystack.indexOf(needle)

    while (start !== -1) {
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + text.length)
      ranges.push(range)
      start = haystack.indexOf(needle, start + text.length)
    }

    node = walker.nextNode()
  }

  return ranges
}

const getRangeElement = (range: Range) => {
  const node = range.commonAncestorContainer
  return node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement
}

const isScrollable = (element: HTMLElement) => {
  const style = window.getComputedStyle(element)
  return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1
}

const getScrollContainer = (range: Range) => {
  let element = getRangeElement(range)?.parentElement ?? null

  while (element && element !== document.body && element !== document.documentElement) {
    if (isScrollable(element)) {
      return element
    }
    element = element.parentElement
  }

  return null
}

const scrollRangeIntoView = (range: Range) => {
  const rect = range.getBoundingClientRect()
  const scrollContainer = getScrollContainer(range)

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const targetOffset = rect.top - containerRect.top - scrollContainer.clientHeight / 2 + rect.height / 2

    scrollContainer.scrollBy({
      top: targetOffset,
      behavior: 'smooth'
    })

    if (containerRect.top < 0 || containerRect.bottom > window.innerHeight) {
      scrollContainer.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    }
    return
  }

  if (rect.top < 64 || rect.bottom > window.innerHeight - 48) {
    window.scrollBy({
      top: rect.top - window.innerHeight / 2 + rect.height / 2,
      behavior: 'smooth'
    })
  }
}

const updateActiveHighlight = () => {
  const api = getHighlightApi()
  const activeRange = matchRanges[activeMatch.value - 1]
  if (!api || !activeRange) {
    api?.highlights.delete(ACTIVE_HIGHLIGHT)
    return
  }

  api.highlights.set(ACTIVE_HIGHLIGHT, new api.HighlightClass(activeRange))
  scrollRangeIntoView(activeRange)
}

const runFind = (options: { forward?: boolean; findNext?: boolean } = {}) => {
  if (findTimer) {
    clearTimeout(findTimer)
    findTimer = null
  }

  const text = query.value.trim()
  const api = getHighlightApi()
  if (!text || !api) {
    matches.value = 0
    activeMatch.value = 0
    clearHighlights()
    return
  }

  if (!options.findNext) {
    matchRanges = collectRanges(text)
    matches.value = matchRanges.length
    activeMatch.value = matchRanges.length > 0 ? 1 : 0
    api.highlights.set(MATCH_HIGHLIGHT, new api.HighlightClass(...matchRanges))
    updateActiveHighlight()
    return
  }

  if (matchRanges.length === 0) return

  const direction = options.forward === false ? -1 : 1
  activeMatch.value = ((activeMatch.value - 1 + direction + matchRanges.length) % matchRanges.length) + 1
  updateActiveHighlight()
}

const scheduleFind = () => {
  if (!visible.value) return
  if (findTimer) clearTimeout(findTimer)
  findTimer = setTimeout(() => runFind(), 120)
}

const open = () => {
  const selection = document.getSelection()?.toString().trim()
  if (selection && !selection.includes('\n')) {
    query.value = selection
  }

  visible.value = true
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
    runFind()
  })
}

const close = () => {
  visible.value = false
  matches.value = 0
  activeMatch.value = 0
  if (findTimer) {
    clearTimeout(findTimer)
    findTimer = null
  }
  clearHighlights()
}

const findNext = () => runFind({ forward: true, findNext: true })
const findPrevious = () => runFind({ forward: false, findNext: true })

const handleInputKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) {
      findPrevious()
    } else {
      findNext()
    }
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  const isFindShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
  if (isFindShortcut) {
    event.preventDefault()
    event.stopPropagation()
    open()
    return
  }

  if (visible.value && event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(query, () => {
  scheduleFind()
})

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true)
  if (findTimer) clearTimeout(findTimer)
  clearHighlights()
})
</script>

<template>
  <div v-if="visible" class="page-find-bar no-drag" :style="{ zIndex: findBarZIndex }" @keydown.stop>
    <div class="find-input-wrap">
      <component :is="Search" class="find-icon" />
      <input
        ref="inputRef"
        v-model="query"
        class="find-input"
        type="text"
        placeholder="查找"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        @keydown="handleInputKeydown"
      />
    </div>
    <div class="find-count" :class="{ empty: hasQuery && matches === 0 }">{{ resultText }}</div>
    <button class="find-button" type="button" :disabled="!hasQuery" title="上一个" @click="findPrevious">
      <component :is="ChevronUp" />
    </button>
    <button class="find-button" type="button" :disabled="!hasQuery" title="下一个" @click="findNext">
      <component :is="ChevronDown" />
    </button>
    <button class="find-button" type="button" title="关闭" @click="close">
      <component :is="X" />
    </button>
  </div>
</template>

<style scoped>
.page-find-bar {
  position: fixed;
  top: calc(var(--safe-area-top, env(safe-area-inset-top)) + 10px);
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  width: min(420px, calc(100vw - 32px));
  height: 42px;
  padding: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
}

.find-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-input);
}

.find-icon {
  width: 15px;
  height: 15px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.find-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.find-input::placeholder {
  color: var(--text-placeholder);
}

.find-count {
  min-width: 42px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.find-count.empty {
  color: var(--color-danger);
}

.find-button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.find-button:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.find-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.find-button svg {
  width: 16px;
  height: 16px;
}

@media (max-width: 520px) {
  .page-find-bar {
    left: 10px;
    right: 10px;
    width: auto;
  }
}
</style>

<style>
::highlight(agent-qi-page-find-match) {
  background: rgba(255, 214, 10, 0.55);
  color: inherit;
}

::highlight(agent-qi-page-find-active) {
  background: rgba(255, 149, 0, 0.9);
  color: #111;
}
</style>
