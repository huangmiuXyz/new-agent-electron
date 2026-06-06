const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export const normalizeHashlineText = (value: string) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

export const computeSnapshotTag = (text: string): string =>
  (fnv1a(normalizeHashlineText(text)) & 0xffff).toString(16).padStart(4, '0').toUpperCase()

const getLineIndexAtOffset = (text: string, offset: number) => {
  const lines = text.split('\n')
  let cursor = 0

  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = cursor + lines[index].length
    if (offset <= lineEnd) return index
    cursor = lineEnd + 1
  }

  return Math.max(0, lines.length - 1)
}

const getLineStartOffsets = (lines: string[]) => {
  const offsets: number[] = []
  let cursor = 0

  lines.forEach((line) => {
    offsets.push(cursor)
    cursor += line.length + 1
  })

  return offsets
}

const sliceLineSelection = (
  line: string,
  lineStartOffset: number,
  selectionStart: number,
  selectionEnd: number
) => {
  const lineEndOffset = lineStartOffset + line.length
  const start = Math.max(0, Math.min(line.length, selectionStart - lineStartOffset))
  const end = Math.max(0, Math.min(line.length, selectionEnd - lineStartOffset))

  if (selectionEnd < lineStartOffset || selectionStart > lineEndOffset) return null
  if (start === end && selectionStart !== selectionEnd) return null

  return {
    start,
    end,
    text: line.slice(start, end)
  }
}

export const buildNoteHashlineReference = (options: {
  text: string
  selectionStartOffset: number
  selectionEndOffset: number
  title: string
  path?: string
  referenceId?: string
}) => {
  const text = normalizeHashlineText(options.text)
  if (!text.trim()) return ''

  const selectionStartOffset = Math.max(0, Math.min(options.selectionStartOffset, text.length))
  const selectionEndOffset = Math.max(selectionStartOffset, Math.min(options.selectionEndOffset, text.length))
  const hasSelection = selectionEndOffset > selectionStartOffset
  const startIndex = getLineIndexAtOffset(text, selectionStartOffset)
  const endIndex = getLineIndexAtOffset(
    text,
    hasSelection ? Math.max(selectionStartOffset, selectionEndOffset - 1) : selectionEndOffset
  )
  const lines = text.split('\n')
  const lineStartOffsets = getLineStartOffsets(lines)
  const selectedLines = lines.slice(startIndex, endIndex + 1)

  if (!selectedLines.some((line) => line.trim())) return ''

  const startLine = startIndex + 1
  const endLine = endIndex + 1
  const hashLines = selectedLines.map((line, index) => {
    const lineNumber = startLine + index
    const anchorLine = `${lineNumber}:${line}`
    if (!hasSelection) return anchorLine

    const selectedPart = sliceLineSelection(
      line,
      lineStartOffsets[startIndex + index] ?? 0,
      selectionStartOffset,
      selectionEndOffset
    )

    if (!selectedPart || !selectedPart.text) return anchorLine
    return [
      anchorLine,
      `  selection: cols ${selectedPart.start + 1}-${selectedPart.end}`,
      `  text: ${selectedPart.text}`
    ].join('\n')
  })

  return [
    `note: ${options.path || options.title}`,
    options.referenceId ? `note_id: ${options.referenceId}` : '',
    options.path ? `title: ${options.title}` : '',
    `lines: ${startLine}-${endLine}`,
    'hashlines:',
    `¶${options.referenceId || options.title}#${computeSnapshotTag(text)}`,
    hashLines.join('\n')
  ].filter(Boolean).join('\n')
}

export const stripNoteHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
