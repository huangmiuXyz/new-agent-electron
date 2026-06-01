const HL_BIGRAMS = Array.from({ length: 26 * 26 }, (_, index) => {
  const first = String.fromCharCode(97 + Math.floor(index / 26))
  const second = String.fromCharCode(97 + (index % 26))
  return `${first}${second}`
})

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export const normalizeHashlineText = (value: string) => value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

export const computeLineHash = (line: string): string => {
  const normalized = line.replace(/\r/g, '').trimEnd()
  return HL_BIGRAMS[fnv1a(normalized) % HL_BIGRAMS.length]
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
