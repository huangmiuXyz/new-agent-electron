type ChatCanvasState = {
  html: string
  updatedAt: number
}

const insertHtmlNearBody = (source: string, fragment: string, position: 'start' | 'end') => {
  if (!source) return fragment

  if (position === 'start') {
    const bodyOpenMatch = source.match(/<body[^>]*>/i)
    if (bodyOpenMatch && bodyOpenMatch.index != null) {
      const insertIndex = bodyOpenMatch.index + bodyOpenMatch[0].length
      return `${source.slice(0, insertIndex)}\n${fragment}\n${source.slice(insertIndex)}`
    }
    return `${fragment}\n${source}`
  }

  const bodyCloseMatch = source.match(/<\/body>/i)
  if (bodyCloseMatch && bodyCloseMatch.index != null) {
    return `${source.slice(0, bodyCloseMatch.index)}\n${fragment}\n${source.slice(bodyCloseMatch.index)}`
  }

  return `${source}\n${fragment}`
}

export const useCanvasStore = defineStore(
  'canvas',
  () => {
    const canvases = ref<Record<string, ChatCanvasState>>({})

    const resolveChatId = (chatId?: string) => {
      if (chatId) return chatId
      return useChatsStores().currentChat?.id || 'default'
    }

    const ensureCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      const existing = canvases.value[resolvedChatId]
      if (existing) return { chatId: resolvedChatId, canvas: existing }

      const canvas: ChatCanvasState = {
        html: '',
        updatedAt: Date.now()
      }
      canvases.value = {
        ...canvases.value,
        [resolvedChatId]: canvas
      }
      return { chatId: resolvedChatId, canvas }
    }

    const getCanvas = (chatId?: string) => {
      const resolvedChatId = resolveChatId(chatId)
      return canvases.value[resolvedChatId] || null
    }

    const getCanvasHtml = (chatId?: string) => {
      return getCanvas(chatId)?.html || ''
    }

    const setCanvasHtml = (html: string, chatId?: string) => {
      const { chatId: resolvedChatId } = ensureCanvas(chatId)
      canvases.value = {
        ...canvases.value,
        [resolvedChatId]: {
          html,
          updatedAt: Date.now()
        }
      }
    }

    const appendCanvasHtml = (fragment: string, chatId?: string, position: 'start' | 'end' = 'end') => {
      const nextHtml = insertHtmlNearBody(getCanvasHtml(chatId), fragment, position)
      setCanvasHtml(nextHtml, chatId)
      return nextHtml
    }

    const clearCanvas = (chatId?: string) => {
      setCanvasHtml('', chatId)
    }

    return {
      canvases,
      getCanvas,
      getCanvasHtml,
      setCanvasHtml,
      appendCanvasHtml,
      clearCanvas
    }
  },
  {
    persist: {
      paths: ['canvases']
    }
  }
)
