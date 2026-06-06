import { describe, expect, it } from 'vitest'
import { buildNoteHashlineReference } from './noteHashlines'

describe('buildNoteHashlineReference', () => {
  it('reports the exact selected text within a single line', () => {
    const text = 'Alpha\nBravo Charlie\nDelta'
    const selectionStartOffset = text.indexOf('vo Ch')
    const selectionEndOffset = selectionStartOffset + 'vo Ch'.length

    const reference = buildNoteHashlineReference({
      text,
      selectionStartOffset,
      selectionEndOffset,
      title: 'Demo note',
      path: '/Folder/Demo note',
      referenceId: 'note-1'
    })

    expect(reference).toContain('note: /Folder/Demo note')
    expect(reference).toContain('note_id: note-1')
    expect(reference).toContain('title: Demo note')
    expect(reference).toContain('lines: 2-2')
    expect(reference).toContain('2:Bravo Charlie')
    expect(reference).toContain('selection: cols 4-8')
    expect(reference).toContain('text: vo Ch')
  })

  it('keeps selected text attached to the correct lines across line breaks', () => {
    const text = 'Alpha\nBravo Charlie\nDelta'
    const selectionStartOffset = text.indexOf('pha')
    const selectionEndOffset = text.indexOf('vo')

    const reference = buildNoteHashlineReference({
      text,
      selectionStartOffset,
      selectionEndOffset,
      title: 'Demo note'
    })

    expect(reference).toContain('lines: 1-2')
    expect(reference).toContain('1:Alpha')
    expect(reference).toContain('selection: cols 3-5')
    expect(reference).toContain('text: pha')
    expect(reference).toContain('2:Bravo Charlie')
    expect(reference).toContain('selection: cols 1-3')
    expect(reference).toContain('text: Bra')
  })

  it('returns the cursor line when there is no selected text', () => {
    const text = 'Alpha\nBravo Charlie\nDelta'
    const cursorOffset = text.indexOf('Charlie')

    const reference = buildNoteHashlineReference({
      text,
      selectionStartOffset: cursorOffset,
      selectionEndOffset: cursorOffset,
      title: 'Demo note'
    })

    expect(reference).toContain('lines: 2-2')
    expect(reference).toContain('2:Bravo Charlie')
    expect(reference).not.toContain('selection: cols')
    expect(reference).not.toContain('text: Charlie')
  })
})
