import type { TextUIPart } from 'ai'
import { getCollapsedMessageParts, getRenderableMessageParts } from '../Item/messageParts'

export interface VirtualChatItem {
  uid: string
  type: string
  messageId: string
  groupId: string
  isFirstInGroup: boolean
  isLastInGroup: boolean
  msg: BaseMessage | null
  part: BaseMessage['parts'][number] | null
  partIndex: number
  /** collapsed toggle: how many parts are hidden */
  hiddenCount?: number
  /** whether this reasoning part is the last reasoning block in the message */
  isLastReasoningPart?: boolean
}

function estimateTextHeight(len: number): number {
  // 14~18px font, line-height ~1.6, ~760px container
  return Math.min(Math.max(Math.round(len * 0.3) + 10, 40), 600)
}

function getMsgTextLen(msg: BaseMessage | null): number {
  if (!msg?.parts) return 0
  return msg.parts.reduce((sum: number, p: any) => sum + (p.text?.length ?? 0), 0)
}

export function estimateItemHeight(item: VirtualChatItem): number {
  switch (item.type) {
    case 'context-divider': return 48
    case 'user-message': return estimateTextHeight(getMsgTextLen(item.msg))
    case 'system-message': return estimateTextHeight(getMsgTextLen(item.msg))
    case 'ai-header': return 48
    case 'ai-rag-search': return 60
    case 'ai-loading': return 40
    case 'ai-error': return 40
    case 'ai-retry': return 40
    case 'ai-collapsed-toggle': return 28
    case 'ai-waveform': return 40
    case 'ai-actions': return 36
    case 'ai-translation': return 52
    case 'ai-part-text': {
      const len = (item.part as TextUIPart)?.text?.length ?? 0
      return estimateTextHeight(len)
    }
    case 'ai-part-reasoning': return 28
    case 'ai-part-dynamic-tool': return 28
    case 'ai-part-tool': return 28
    case 'ai-part-file': return 120
    default: return 60
  }
}

export function generateFlatItems(
  msgs: BaseMessage[],
  contextCount: number,
  hasCompressedContext: boolean,
  editingMessageId: string | null,
  collapsePreviousContent: boolean,
  expandedMessageIds?: Set<string>
): VirtualChatItem[] {
  const items: VirtualChatItem[] = []

  for (let mi = 0; mi < msgs.length; mi++) {
    const msg = msgs[mi]
    if (!msg) continue
    const gid = msg.id || `msg-${mi}`

    // context divider
    if (mi === msgs.length - contextCount && contextCount < msgs.length && !hasCompressedContext) {
      items.push({
        uid: `cd-${mi}`, type: 'context-divider',
        messageId: gid, groupId: gid,
        isFirstInGroup: true, isLastInGroup: false,
        msg: null, part: null, partIndex: -1
      })
    }

    if (msg.role === 'user') {
      items.push({
        uid: `user-${msg.id}`, type: 'user-message',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: true, isLastInGroup: true,
        msg, part: null, partIndex: -1
      })
      continue
    }

    if (msg.role === 'system') {
      items.push({
        uid: `sys-${msg.id}`, type: 'system-message',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: true, isLastInGroup: true,
        msg, part: null, partIndex: -1
      })
      continue
    }

    // assistant — flatten
    items.push({
      uid: `ai-hdr-${msg.id}`, type: 'ai-header',
      messageId: msg.id!, groupId: gid,
      isFirstInGroup: true, isLastInGroup: false,
      msg, part: null, partIndex: -1
    })

    // RAG
    if (msg.metadata?.ragEnabled || msg.metadata?.ragSearchDetails?.length) {
      items.push({
        uid: `ai-rag-${msg.id}`, type: 'ai-rag-search',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1
      })
    }

    // loading
    if (!msg.metadata?.error && msg.metadata?.loading &&
        msg.parts.findIndex((p: any) => p.type === 'step-start') === -1) {
      items.push({
        uid: `ai-ld-${msg.id}`, type: 'ai-loading',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1
      })
    }

    // error
    if (msg.metadata?.error && !msg.metadata?.retrying) {
      items.push({
        uid: `ai-err-${msg.id}`, type: 'ai-error',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1
      })
    }

    // retry
    if (msg.metadata?.retrying) {
      items.push({
        uid: `ai-rt-${msg.id}`, type: 'ai-retry',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1
      })
    }

    // parts
    const isEditing = editingMessageId === msg.id
    const isExpanded = !!expandedMessageIds?.has(msg.id!)
    const renderable = getRenderableMessageParts(msg.parts)
    const collapsed = getCollapsedMessageParts(msg.parts)
    const showToggle = collapsePreviousContent && !isEditing && collapsed.length > 0 && renderable.length > collapsed.length
    const hideParts = showToggle && !isExpanded
    const displayedParts = hideParts ? collapsed : msg.parts

    // collapsed toggle (always rendered when collapsing is possible)
    if (showToggle) {
      items.push({
        uid: `ai-ct-${msg.id}`, type: 'ai-collapsed-toggle',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1,
        hiddenCount: hideParts ? renderable.length - collapsed.length : 0
      })
    }

    let lastReasoningPartIdx = -1
    for (let pi = 0; pi < displayedParts.length; pi++) {
      if (displayedParts[pi].type === 'reasoning') lastReasoningPartIdx = pi
    }

    for (let pi = 0; pi < displayedParts.length; pi++) {
      const part = displayedParts[pi]
      // skip step-start/step-end parts
      if (part.type === 'step-start' || part.type === ('step-end' as string)) continue
      let ptype = 'ai-part-text'
      if (part.type === 'text') ptype = 'ai-part-text'
      else if (part.type === 'reasoning') ptype = 'ai-part-reasoning'
      else if (part.type === 'dynamic-tool') ptype = 'ai-part-dynamic-tool'
      else if (part.type.startsWith('tool')) ptype = 'ai-part-tool'
      else if (part.type === 'file' && (part as any).mediaType?.startsWith('audio/')) ptype = 'ai-part-audio'
      else if (part.type === 'file') ptype = 'ai-part-file'

      items.push({
        uid: `ai-p-${msg.id}-${pi}`,
        type: ptype,
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part, partIndex: pi,
        isLastReasoningPart: part.type === 'reasoning' && pi === lastReasoningPartIdx
      })
    }

    // waveform
    const hasAudio = (msg.metadata?.audio?.chunks?.length ?? 0) > 0
    const isStreamingAudio = hasAudio && !!msg.metadata?.loading &&
      msg.metadata!.audio!.chunks!.some((c: any) => !c.data || c.data === '')
    if (isStreamingAudio) {
      items.push({
        uid: `ai-wf-${msg.id}`, type: 'ai-waveform',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1
      })
    }

    // actions
    if (!!msg.metadata?.loading || hasAudio || msg.metadata?.retrying || (msg.metadata?.loading && !msg.metadata?.error && msg.metadata?.stop != null)) {
      items.push({
        uid: `ai-act-${msg.id}`, type: 'ai-actions',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: false,
        msg, part: null, partIndex: -1
      })
    }

    // translation
    if (msg.metadata?.translations || msg.metadata?.translationLoading) {
      items.push({
        uid: `ai-tr-${msg.id}`, type: 'ai-translation',
        messageId: msg.id!, groupId: gid,
        isFirstInGroup: false, isLastInGroup: true,
        msg, part: null, partIndex: -1
      })
    }

    if (items.length > 0) items[items.length - 1].isLastInGroup = true
  }

  return items
}
