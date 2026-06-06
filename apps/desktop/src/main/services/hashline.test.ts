import { describe, expect, it } from 'vitest'
import {
  applyHashlineOperations,
  computeSnapshotTag,
  formatHashLines,
  parseHashlineOperations
} from './hashline'

describe('parseHashlineOperations', () => {
  it('accepts insert-after syntax', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`insert after 2:\n+inserted line`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nbravo\ninserted line\ncharlie')
  })

  it('accepts multi-line replacement payloads', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`replace 2..2:\n+first\n+second`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nfirst\nsecond\ncharlie')
  })

  it('accepts delete syntax', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations('delete 2')

    expect(applyHashlineOperations(source, operations)).toBe('alpha\ncharlie')
  })

  it('formats read output body lines with line numbers only', () => {
    expect(formatHashLines('alpha\nbravo')).toBe('1:alpha\n2:bravo')
    expect(computeSnapshotTag('alpha\nbravo')).toMatch(/^[0-9A-F]{4}$/)
  })
})
