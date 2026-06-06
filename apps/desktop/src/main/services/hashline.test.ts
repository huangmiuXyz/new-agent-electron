import { describe, expect, it } from 'vitest'
import {
  applyHashlineOperations,
  computeLineHash,
  parseHashlineOperations
} from './hashline'

const anchorFor = (lineNumber: number, text: string) =>
  `${lineNumber}${computeLineHash(lineNumber, text)}`

describe('parseHashlineOperations', () => {
  it('accepts inline payload after an insert-after anchor separator', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`»${anchorFor(2, 'bravo')}|inserted line`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nbravo\ninserted line\ncharlie')
  })

  it('keeps following payload lines after an inline payload', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`»${anchorFor(2, 'bravo')}|first\nsecond`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nbravo\nfirst\nsecond\ncharlie')
  })

  it('accepts inline payload when replacing a line', () => {
    const source = 'alpha\nbravo\ncharlie'
    const operations = parseHashlineOperations(`≔${anchorFor(2, 'bravo')}|BRAVO`)

    expect(applyHashlineOperations(source, operations)).toBe('alpha\nBRAVO\ncharlie')
  })
})
