let current = 0

export function acquireZIndex(): number {
  current += 1
  return current
}
