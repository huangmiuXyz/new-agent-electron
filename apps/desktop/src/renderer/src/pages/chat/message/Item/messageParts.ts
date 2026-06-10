export type CollapsibleMessagePart = {
  type: string
}

const isStepStartPart = (part: CollapsibleMessagePart) => part.type === 'step-start'

export const getRenderableMessageParts = <T extends CollapsibleMessagePart>(parts: T[]) => {
  const renderableParts = parts.filter((part) => !isStepStartPart(part))
  return renderableParts.length > 0 ? renderableParts : parts
}

export const getCollapsedMessageParts = <T extends CollapsibleMessagePart>(parts: T[]) => {
  const indexedRenderableParts = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => !isStepStartPart(part))

  if (indexedRenderableParts.length === 0) return []

  const lastStepStartIndex = parts.findLastIndex(isStepStartPart)
  let startIndex = -1

  if (lastStepStartIndex !== -1) {
    const firstPartAfterLastStep = indexedRenderableParts.find(
      ({ index }) => index > lastStepStartIndex
    )
    startIndex =
      firstPartAfterLastStep?.index ??
      indexedRenderableParts[indexedRenderableParts.length - 1].index
  } else {
    const lastTextPart = indexedRenderableParts.findLast(({ part }) => part.type === 'text')
    startIndex = lastTextPart?.index ?? indexedRenderableParts[indexedRenderableParts.length - 1].index
  }

  const collapsedParts = indexedRenderableParts
    .filter(({ index }) => index >= startIndex)
    .map(({ part }) => part)

  if (collapsedParts[0]?.type !== 'text') {
    return collapsedParts
  }

  const previousReasoningPart = indexedRenderableParts.findLast(
    ({ part, index }) => index < startIndex && part.type === 'reasoning'
  )

  return previousReasoningPart
    ? [previousReasoningPart.part, ...collapsedParts]
    : collapsedParts
}
