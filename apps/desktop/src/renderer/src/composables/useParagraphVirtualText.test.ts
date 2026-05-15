import { describe, expect, it } from 'vitest'
import { estimateParagraphHeight, splitTextIntoParagraphs } from './useParagraphVirtualText'

describe('splitTextIntoParagraphs', () => {
  it('splits text by blank lines by default', () => {
    const result = splitTextIntoParagraphs('first line\nstill first\r\n\r\nsecond line\n\nthird line')

    expect(result.map((paragraph) => paragraph.text)).toEqual(['first line\nstill first', 'second line', 'third line'])
  })

  it('can split text by every newline', () => {
    const result = splitTextIntoParagraphs('first\nsecond\nthird', { mode: 'newline' })

    expect(result.map((paragraph) => paragraph.text)).toEqual(['first', 'second', 'third'])
  })

  it('filters empty paragraphs unless requested', () => {
    const filtered = splitTextIntoParagraphs('first\n\n\nsecond')
    const preserved = splitTextIntoParagraphs('first\n\n\nsecond', { preserveEmpty: true, mode: 'newline' })

    expect(filtered.map((paragraph) => paragraph.text)).toEqual(['first', 'second'])
    expect(preserved.map((paragraph) => paragraph.text)).toEqual(['first', '', '', 'second'])
  })

  it('trims paragraphs when requested', () => {
    const result = splitTextIntoParagraphs('  first  \n\n  second  ', { trimParagraphs: true })

    expect(result.map((paragraph) => paragraph.text)).toEqual(['first', 'second'])
  })
})

describe('estimateParagraphHeight', () => {
  it('grows as text wraps into more visual lines', () => {
    const shortHeight = estimateParagraphHeight('short text', { containerWidth: 240 })
    const longHeight = estimateParagraphHeight('long text '.repeat(40), { containerWidth: 240 })

    expect(longHeight).toBeGreaterThan(shortHeight)
  })

  it('accounts for explicit line breaks', () => {
    const oneLine = estimateParagraphHeight('one line', { containerWidth: 600 })
    const threeLines = estimateParagraphHeight('one\ntwo\nthree', { containerWidth: 600 })

    expect(threeLines).toBeGreaterThan(oneLine)
  })
})
