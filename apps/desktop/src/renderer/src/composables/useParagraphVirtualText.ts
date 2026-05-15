export type ParagraphSplitMode = 'blank-line' | 'newline'

export interface ParagraphBlock {
  id: string
  index: number
  text: string
}

export interface SplitTextIntoParagraphsOptions {
  mode?: ParagraphSplitMode
  preserveEmpty?: boolean
  trimParagraphs?: boolean
}

export interface EstimateParagraphHeightOptions {
  containerWidth: number
  fontSize?: number
  lineHeight?: number
  paddingBlock?: number
  gap?: number
  minHeight?: number
}

const normalizeNewlines = (text: string) => text.replace(/\r\n?/g, '\n')

const getCharacterWidthUnits = (char: string) => {
  if (char === '\t') return 2
  if (char === ' ') return 0.35
  if (/[\u1100-\u115f\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(char)) return 1
  if (/\p{Extended_Pictographic}/u.test(char)) return 1.15
  return 0.56
}

const getLineWidthUnits = (line: string) => Array.from(line).reduce((total, char) => total + getCharacterWidthUnits(char), 0)

export const splitTextIntoParagraphs = (text: string, options: SplitTextIntoParagraphsOptions = {}): ParagraphBlock[] => {
  const { mode = 'blank-line', preserveEmpty = false, trimParagraphs = false } = options
  const normalized = normalizeNewlines(text)

  if (!normalized && !preserveEmpty) return []

  const parts = mode === 'newline' ? normalized.split('\n') : normalized.split(/\n{2,}/)

  return parts
    .map((part, index) => ({
      id: `${index}:${part.length}`,
      index,
      text: trimParagraphs ? part.trim() : part
    }))
    .filter((part) => preserveEmpty || part.text.trim().length > 0)
}

export const estimateParagraphHeight = (text: string, options: EstimateParagraphHeightOptions) => {
  const {
    containerWidth,
    fontSize = 14,
    lineHeight = 22,
    paddingBlock = 12,
    gap = 8,
    minHeight = 34
  } = options

  const usableWidth = Math.max(containerWidth, 1)
  const unitsPerLine = Math.max(usableWidth / Math.max(fontSize, 1), 8)
  const visualLines = normalizeNewlines(text)
    .split('\n')
    .reduce((total, line) => total + Math.max(Math.ceil(getLineWidthUnits(line) / unitsPerLine), 1), 0)

  return Math.max(visualLines * lineHeight + paddingBlock + gap, minHeight)
}
