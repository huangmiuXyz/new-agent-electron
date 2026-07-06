import {
  computed,
  nextTick,
  ref,
  render,
  watch,
  type ComputedRef,
  type Ref,
  type WritableComputedRef
} from 'vue'
import { getFileIcon } from '@renderer/utils/fileIcons'
import { useIcon } from '@renderer/composables/useIcon'

type MentionPanelRef = {
  syncMentionState?: (message: string, cursor: number) => void
  scheduleClose?: () => void
  clearCloseTimer?: () => void
  isMentionPanelOpen?: () => boolean
  handleKeydown?: (
    event: KeyboardEvent,
    message: string,
    cursor: number
  ) => { handled: boolean; payload?: { message: string; cursor: number } | null }
}

type MentionChip = {
  id: string
  kind: 'skills' | 'file' | 'note' | 'agent'
  kindLabel: string
  label: string
  raw: string
}

type MentionToken = MentionChip & { start: number; end: number }

const MAX_EDITOR_ROWS = 5
const MENTION_CHIP_SELECTOR = '[data-mention-chip="true"]'
const FORMAL_MENTION_REGEX =
  /@(skills|技能|file|文件|note|笔记|agent|智能体):(?:"((?:\\"|[^"])*)"|'([^'\n\r]*)'|([^\s]+))/gi
const CONFIRMED_MENTION_START = '<|at_start|>'
const CONFIRMED_MENTION_END = '<|at_end|>'
const CONFIRMED_MENTION_REGEX =
  /<\|at_start\|>@?((skills|技能|file|文件|note|笔记|agent|智能体):(?:"((?:\\"|[^"])*)"|'([^'\n\r]*)'|([^\s<>]+)))<\|at_end\|>/gi

const mentionKindLabelMap: Record<MentionChip['kind'], string> = {
  skills: '技能',
  file: '文件',
  note: '笔记',
  agent: '智能体'
}

const normalizeMentionKind = (kind: string): MentionChip['kind'] => {
  const normalizedKind = kind.toLowerCase()
  if (normalizedKind === 'file' || kind === '文件') return 'file'
  if (normalizedKind === 'note' || kind === '笔记') return 'note'
  if (normalizedKind === 'agent' || kind === '智能体') return 'agent'
  return 'skills'
}

const unescapeMentionLabel = (label: string) => label.replace(/\\"/g, '"').trim()
const createMentionChipId = (kind: MentionChip['kind'], raw: string) =>
  `${kind}:${raw}:${Date.now()}:${Math.random().toString(36).slice(2)}`
const wrapConfirmedMention = (raw: string) =>
  `${CONFIRMED_MENTION_START}${raw.replace(/^@/, '')}${CONFIRMED_MENTION_END}`
const escapeRegexSource = (source: string) => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stripCaretAnchors = (text: string) => text.replace(/\u200B/g, '')

export const unwrapConfirmedMentions = (text: string) => {
  return text.replace(CONFIRMED_MENTION_REGEX, '@$1')
}

export const separateConfirmedMentionsForSend = (text: string) => {
  const confirmedMentionEndPattern = new RegExp(
    `${escapeRegexSource(CONFIRMED_MENTION_END)}(?=[^\\s)\\]};,.!?'"，。！？】【])`,
    'g'
  )
  return text.replace(confirmedMentionEndPattern, `${CONFIRMED_MENTION_END} `)
}

export const confirmMentionTokens = (text: string) => {
  return text.replace(FORMAL_MENTION_REGEX, (raw) => wrapConfirmedMention(raw))
}

const parseMentionTokens = (text: string) => {
  const tokens: MentionToken[] = []
  for (const match of text.matchAll(CONFIRMED_MENTION_REGEX)) {
    const raw = match[1]
    const rawKind = match[2] || 'skills'
    const kind = normalizeMentionKind(rawKind)
    const label = unescapeMentionLabel(match[3] || match[4] || match[5] || '')
    const start = match.index ?? 0
    const end = start + match[0].length
    if (!label) continue
    tokens.push({
      id: createMentionChipId(kind, raw),
      kind,
      kindLabel: mentionKindLabelMap[kind],
      label,
      raw,
      start,
      end
    })
  }
  return tokens
}

// 各类型图标与 AtPanel 保持一致：文件用 fileIcons，其余用 useIcon (Fluent UI)
const CHIP_ICONS = {
  skills: () => useIcon('Wrench20Regular'),
  note: () => useIcon('NoteAdd24Regular'),
  agent: () => useIcon('Robot')
} as const

const createMentionChipNode = (chip: MentionChip) => {
  const chipNode = document.createElement('span')
  chipNode.className = `mention-chip mention-chip--${chip.kind}`
  chipNode.contentEditable = 'false'
  chipNode.dataset.mentionChip = 'true'
  chipNode.dataset.raw = chip.raw
  chipNode.dataset.kind = chip.kind
  chipNode.title = `${chip.kindLabel}: ${chip.label}`

  // 图标：文件按扩展名匹配 material-icon-theme，其他用 Fluent UI 图标
  const iconBox = document.createElement('span')
  iconBox.className = 'mention-chip__icon'
  if (chip.kind === 'file') {
    const path = chip.raw.replace(/^file:/i, '')
    render(getFileIcon(path).vnode, iconBox)
  } else {
    const icon = CHIP_ICONS[chip.kind]()
    render(icon, iconBox)
  }

  const kindNode = document.createElement('span')
  kindNode.className = 'mention-chip__kind'
  kindNode.textContent = chip.kindLabel
  const labelNode = document.createElement('span')
  labelNode.className = 'mention-chip__label'
  labelNode.textContent = chip.label
  const closeNode = document.createElement('span')
  closeNode.className = 'mention-chip__close'
  closeNode.setAttribute('aria-hidden', 'true')
  chipNode.append(iconBox, kindNode, labelNode, closeNode)
  return chipNode
}

export const useMentionEditor = (options: {
  message: WritableComputedRef<string> | Ref<string>
  textareaRef: Ref<HTMLElement | null>
  atPanelRef: Ref<MentionPanelRef | null>
  onSend: () => void
  isProcessingVoice: ComputedRef<boolean> | Ref<boolean>
}) => {
  const isComposing = ref(false)
  const isRenderingEditor = ref(false)
  const isSyncingMessageFromEditor = ref(false)
  const isSettingEditorMessageProgrammatically = ref(false)
  const activeMentionChipNode = ref<HTMLElement | null>(null)
  const lockedEditorSelection = ref<number | null>(null)
  const editorIsEmpty = computed(() => stripCaretAnchors(options.message.value).trim().length === 0)

  const adjustEditorHeight = (target: Event | HTMLElement | null | undefined) => {
    const editor = target instanceof HTMLElement ? target : (target?.target as HTMLElement | null)
    if (!editor) return
    const style = window.getComputedStyle(editor)
    const lineHeight =
      Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4
    const verticalPadding =
      Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    const maxHeight = Math.ceil(lineHeight * MAX_EDITOR_ROWS + verticalPadding)
    editor.style.height = 'auto'
    editor.style.height = `${Math.min(editor.scrollHeight, maxHeight)}px`
    editor.style.overflowY = editor.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  const resolveDomOffsetFromSerializedTextOffset = (text: string, serializedOffset: number) => {
    if (serializedOffset <= 0) return text.startsWith('\u200B') ? 1 : 0
    let visibleOffset = 0
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== '\u200B') visibleOffset += 1
      if (visibleOffset >= serializedOffset) return index + 1
    }
    return text.length
  }

  const resolveSerializedOffsetFromDomTextOffset = (text: string, domOffset: number) => {
    return stripCaretAnchors(text.slice(0, domOffset)).length
  }

  const serializeEditorNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return stripCaretAnchors(node.textContent || '')
    if (!(node instanceof HTMLElement)) return ''
    if (node.matches(MENTION_CHIP_SELECTOR)) return wrapConfirmedMention(node.dataset.raw || '')
    if (node.tagName === 'BR') return '\n'
    return Array.from(node.childNodes).map(serializeEditorNode).join('')
  }

  const serializeEditorContent = () => {
    const editor = options.textareaRef.value
    if (!editor) return ''
    return Array.from(editor.childNodes).map(serializeEditorNode).join('')
  }

  const renderEditorContent = () => {
    const editor = options.textareaRef.value
    if (!editor) return
    isRenderingEditor.value = true
    editor.replaceChildren()
    const text = options.message.value
    const tokens = parseMentionTokens(text)
    let offset = 0
    for (const token of tokens) {
      if (token.start > offset) editor.append(document.createTextNode(text.slice(offset, token.start)))
      editor.append(createMentionChipNode(token))
      offset = token.end
    }
    if (offset < text.length) editor.append(document.createTextNode(text.slice(offset)))
    isRenderingEditor.value = false
    adjustEditorHeight(editor)
  }

  const getMentionChipNodes = () =>
    Array.from(options.textareaRef.value?.querySelectorAll<HTMLElement>(MENTION_CHIP_SELECTOR) || [])
  const getClosestMentionChipNode = (node: Node | null) => {
    const element = node instanceof HTMLElement ? node : node?.parentElement
    return element?.closest?.(MENTION_CHIP_SELECTOR) as HTMLElement | null
  }
  const setActiveMentionChipNode = (chipNode: HTMLElement | null) => {
    if (activeMentionChipNode.value === chipNode) return
    activeMentionChipNode.value?.classList.remove('is-active')
    activeMentionChipNode.value = chipNode
    activeMentionChipNode.value?.classList.add('is-active')
  }
  const isRangeIntersectingNode = (range: Range, node: Node) => {
    try {
      return range.intersectsNode(node)
    } catch {
      return false
    }
  }
  const getSelectedMentionChipNodes = (range: Range | null = null) => {
    const chips = getMentionChipNodes()
    if (!range) return chips.filter((chip) => chip.classList.contains('is-selected'))
    return chips.filter((chip) => isRangeIntersectingNode(range, chip))
  }

  const updateMentionChipSelectionState = () => {
    const editor = options.textareaRef.value
    const selection = window.getSelection()
    const chips = getMentionChipNodes()
    chips.forEach((chip) => chip.classList.remove('is-selected'))
    if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    if (!isRangeIntersectingNode(range, editor)) return
    getSelectedMentionChipNodes(range).forEach((chip) => chip.classList.add('is-selected'))
  }

  const getNodeSerializedLength = (node: Node) => serializeEditorNode(node).length
  const getEditorCaretOffset = () => {
    const editor = options.textareaRef.value
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return options.message.value.length
    const range = selection.getRangeAt(0)
    if (!editor.contains(range.startContainer)) return options.message.value.length
    let offset = 0
    let found = false
    const walk = (node: Node) => {
      if (found) return
      if (node === range.startContainer) {
        if (node.nodeType === Node.TEXT_NODE) {
          offset += resolveSerializedOffsetFromDomTextOffset(node.textContent || '', range.startOffset)
        } else {
          const children = Array.from(node.childNodes).slice(0, range.startOffset)
          offset += children.reduce((sum, child) => sum + getNodeSerializedLength(child), 0)
        }
        found = true
        return
      }
      if (node instanceof HTMLElement && node.matches(MENTION_CHIP_SELECTOR)) {
        offset += getNodeSerializedLength(node)
        return
      }
      for (const child of Array.from(node.childNodes)) {
        walk(child)
        if (found) return
      }
    }
    walk(editor)
    return offset
  }

  const setEditorCaretOffset = (targetOffset: number) => {
    const editor = options.textareaRef.value
    const selection = window.getSelection()
    if (!editor || !selection) return
    let offset = Math.min(Math.max(targetOffset, 0), serializeEditorContent().length)
    const range = document.createRange()
    const walk = (node: Node): boolean => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        const length = stripCaretAnchors(text).length
        if (offset <= length) {
          range.setStart(node, resolveDomOffsetFromSerializedTextOffset(text, offset))
          range.collapse(true)
          return true
        }
        offset -= length
        return false
      }
      if (node instanceof HTMLElement && node.matches(MENTION_CHIP_SELECTOR)) {
        const length = getNodeSerializedLength(node)
        if (offset <= length) {
          range.setStartAfter(node)
          range.collapse(true)
          return true
        }
        offset -= length
        return false
      }
      return Array.from(node.childNodes).some(walk)
    }
    if (!walk(editor)) {
      range.selectNodeContents(editor)
      range.collapse(false)
    }
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const syncEditorMessage = () => {
    if (isRenderingEditor.value) return
    isSyncingMessageFromEditor.value = true
    options.message.value = serializeEditorContent()
    nextTick(() => {
      isSyncingMessageFromEditor.value = false
    })
  }

  const focusEditorAtEnd = () => {
    const editor = options.textareaRef.value
    if (!editor) return
    editor.focus()
    setEditorCaretOffset(serializeEditorContent().length)
  }

  const insertEditorTextAtCursor = (text: string) => {
    const editor = options.textareaRef.value
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    syncEditorMessage()
    adjustEditorHeight(editor)
    options.atPanelRef.value?.syncMentionState?.(options.message.value, getEditorCaretOffset())
  }

  const applyMention = (payload: { message: string; cursor: number }) => {
    const originalBeforeCursor = payload.message.slice(0, payload.cursor)
    const confirmedBeforeCursor = confirmMentionTokens(originalBeforeCursor).replace(
      new RegExp(`${escapeRegexSource(CONFIRMED_MENTION_END)} $`),
      CONFIRMED_MENTION_END
    )
    isSettingEditorMessageProgrammatically.value = true
    options.message.value = `${confirmedBeforeCursor}${confirmMentionTokens(payload.message.slice(payload.cursor))}`
    nextTick(() => {
      renderEditorContent()
      options.textareaRef.value?.focus()
      setEditorCaretOffset(confirmedBeforeCursor.length)
      adjustEditorHeight(options.textareaRef.value)
      isSettingEditorMessageProgrammatically.value = false
    })
  }

  const previewMention = (payload: { message: string; cursor: number }) => {
    isSettingEditorMessageProgrammatically.value = true
    options.message.value = payload.message
    nextTick(() => {
      renderEditorContent()
      options.textareaRef.value?.focus()
      setEditorCaretOffset(payload.cursor)
      adjustEditorHeight(options.textareaRef.value)
      isSettingEditorMessageProgrammatically.value = false
    })
  }

  const normalizeEditorProtocolMentions = () => {
    const editor = options.textareaRef.value
    if (!editor?.textContent?.includes(CONFIRMED_MENTION_START)) return false
    const cursor = options.message.value.length
    renderEditorContent()
    options.textareaRef.value?.focus()
    setEditorCaretOffset(cursor)
    adjustEditorHeight(options.textareaRef.value)
    return true
  }

  const handleEditorInput = (event: Event) => {
    syncEditorMessage()
    normalizeEditorProtocolMentions()
    adjustEditorHeight(event)
    options.atPanelRef.value?.syncMentionState?.(options.message.value, getEditorCaretOffset())
  }

  const syncMentionPanelFromEditor = () => {
    syncEditorMessage()
    options.atPanelRef.value?.syncMentionState?.(options.message.value, getEditorCaretOffset())
  }

  const handleEditorPaste = (event: ClipboardEvent) => {
    const hasFile = Array.from(event.clipboardData?.items || []).some((item) => item.kind === 'file')
    if (hasFile) return
    const text = event.clipboardData?.getData('text/plain')
    if (text == null) return
    event.preventDefault()
    insertEditorTextAtCursor(text)
    normalizeEditorProtocolMentions()
  }

  const resolveEditorClipboardPayload = () => {
    const editor = options.textareaRef.value
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    if (!selection.isCollapsed && editor.contains(range.commonAncestorContainer)) {
      const text = Array.from(range.cloneContents().childNodes).map(serializeEditorNode).join('')
      if (text) return { text, range, chipNode: null as HTMLElement | null }
      const selectedChipText = getSelectedMentionChipNodes(range).map(serializeEditorNode).join('')
      if (selectedChipText) return { text: selectedChipText, range, chipNode: null as HTMLElement | null }
    }
    const chipNode =
      activeMentionChipNode.value?.isConnected && editor.contains(activeMentionChipNode.value)
        ? activeMentionChipNode.value
        : getClosestMentionChipNode(selection.anchorNode ?? null)
    const text = chipNode ? serializeEditorNode(chipNode) : ''
    return text ? { text, range: null, chipNode } : null
  }

  const handleEditorCopy = (event: ClipboardEvent) => {
    const payload = resolveEditorClipboardPayload()
    if (!payload) return
    event.preventDefault()
    event.clipboardData?.setData('text/plain', payload.text)
  }

  const handleEditorCut = (event: ClipboardEvent) => {
    const payload = resolveEditorClipboardPayload()
    if (!payload) return
    event.preventDefault()
    event.clipboardData?.setData('text/plain', payload.text)
    if (payload.chipNode) {
      payload.chipNode.remove()
      setActiveMentionChipNode(null)
    } else if (payload.range) {
      const selection = window.getSelection()
      payload.range.deleteContents()
      selection?.removeAllRanges()
      selection?.addRange(payload.range)
    }
    syncEditorMessage()
    adjustEditorHeight(options.textareaRef.value)
  }

  const removeMentionChipNode = (chipNode: HTMLElement) => {
    chipNode.remove()
    setActiveMentionChipNode(null)
    syncEditorMessage()
    nextTick(() => {
      options.textareaRef.value?.focus()
      adjustEditorHeight(options.textareaRef.value)
      options.atPanelRef.value?.syncMentionState?.(options.message.value, getEditorCaretOffset())
    })
  }

  const restoreLockedEditorSelection = () => {
    if (lockedEditorSelection.value == null || !options.textareaRef.value) return
    options.textareaRef.value.focus()
    setEditorCaretOffset(lockedEditorSelection.value)
  }

  const lockEditorCursorWhileMentionPanelOpen = (event: Event) => {
    if (!options.atPanelRef.value?.isMentionPanelOpen?.()) return
    lockedEditorSelection.value = getEditorCaretOffset()
    event.preventDefault()
    options.atPanelRef.value?.clearCloseTimer?.()
    restoreLockedEditorSelection()
  }

  const handleEditorClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    const chipNode = target?.closest?.(MENTION_CHIP_SELECTOR) as HTMLElement | null
    if (chipNode && target?.closest?.('.mention-chip__close')) {
      event.preventDefault()
      removeMentionChipNode(chipNode)
      return
    }
    setActiveMentionChipNode(chipNode)
    if (options.atPanelRef.value?.isMentionPanelOpen?.()) {
      event.preventDefault()
      restoreLockedEditorSelection()
    }
  }

  const insertEditorNewline = () => insertEditorTextAtCursor('\n')
  const handleCompositionStart = () => {
    isComposing.value = true
  }
  const handleCompositionEnd = () => {
    isComposing.value = false
  }

  const handleEditorKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      insertEditorNewline()
      return
    }
    const mentionResult = options.atPanelRef.value?.handleKeydown?.(
      event,
      options.message.value,
      getEditorCaretOffset()
    )
    if (mentionResult?.handled) {
      if (mentionResult.payload) applyMention(mentionResult.payload)
      return
    }
    if (event.key === '@' && !options.atPanelRef.value?.isMentionPanelOpen?.()) {
      nextTick(syncMentionPanelFromEditor)
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (isComposing.value) return
      options.onSend()
    }
  }

  const handleEditorKeyup = (event: KeyboardEvent) => {
    if (isComposing.value) return
    if (['@', 'Backspace', 'Delete'].includes(event.key) || event.key.length === 1) {
      nextTick(syncMentionPanelFromEditor)
    }
  }

  watch(options.message, () => {
    if (isSyncingMessageFromEditor.value || isSettingEditorMessageProgrammatically.value) return
    nextTick(renderEditorContent)
  })

  return {
    editorIsEmpty,
    adjustEditorHeight,
    renderEditorContent,
    syncEditorMessage,
    focusEditorAtEnd,
    getEditorCaretOffset,
    updateMentionChipSelectionState,
    applyMention,
    previewMention,
    handleEditorInput,
    handleEditorKeydown,
    handleEditorKeyup,
    handleEditorPaste,
    handleEditorCopy,
    handleEditorCut,
    handleEditorClick,
    lockEditorCursorWhileMentionPanelOpen,
    handleCompositionStart,
    handleCompositionEnd
  }
}
