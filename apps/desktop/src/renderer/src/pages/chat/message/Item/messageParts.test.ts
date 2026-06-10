import { describe, expect, it } from 'vitest'
import { getCollapsedMessageParts, getRenderableMessageParts } from './messageParts'

type TestPart = {
  id: string
  type: string
}

const part = (id: string, type: string): TestPart => ({ id, type })

describe('getRenderableMessageParts', () => {
  it('removes step-start marker parts when renderable parts exist', () => {
    expect(
      getRenderableMessageParts([part('step', 'step-start'), part('text', 'text')]).map(
        ({ id }) => id
      )
    ).toEqual(['text'])
  })
})

describe('getCollapsedMessageParts', () => {
  it('keeps all trailing parts from the last text when there is no step marker', () => {
    const collapsedParts = getCollapsedMessageParts([
      part('old-tool', 'dynamic-tool'),
      part('thinking', 'reasoning'),
      part('reply', 'text'),
      part('latest-tool', 'dynamic-tool')
    ])

    expect(collapsedParts.map(({ id }) => id)).toEqual(['thinking', 'reply', 'latest-tool'])
  })

  it('keeps every renderable part after the last step marker', () => {
    const collapsedParts = getCollapsedMessageParts([
      part('old-thinking', 'reasoning'),
      part('old-tool', 'dynamic-tool'),
      part('step', 'step-start'),
      part('latest-thinking', 'reasoning'),
      part('latest-tool', 'dynamic-tool')
    ])

    expect(collapsedParts.map(({ id }) => id)).toEqual(['latest-thinking', 'latest-tool'])
  })

  it('only prepends previous reasoning when the latest segment starts with text', () => {
    const collapsedParts = getCollapsedMessageParts([
      part('old-thinking', 'reasoning'),
      part('step', 'step-start'),
      part('reply', 'text'),
      part('latest-tool', 'dynamic-tool')
    ])

    expect(collapsedParts.map(({ id }) => id)).toEqual(['old-thinking', 'reply', 'latest-tool'])
  })

  it('does not prepend previous reasoning when the latest segment starts with a tool', () => {
    const collapsedParts = getCollapsedMessageParts([
      part('old-thinking', 'reasoning'),
      part('step', 'step-start'),
      part('latest-tool', 'dynamic-tool')
    ])

    expect(collapsedParts.map(({ id }) => id)).toEqual(['latest-tool'])
  })
})
