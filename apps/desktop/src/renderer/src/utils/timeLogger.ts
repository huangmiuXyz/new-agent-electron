let _enabled = true

const aggregates = new Map<string, { count: number; total: number }>()

const formatMs = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(1)}ms`)
const prefix = (label: string) => `[TimeLog][${label}]`

export const enableTimeLog = (enabled: boolean) => {
  _enabled = enabled
}

export const isTimeLogEnabled = (): boolean => _enabled

export const createTimeLog = (label: string): number => {
  if (!_enabled) return 0
  return performance.now()
}

export const syncTimeLog = (startTime: number, label: string) => {
  if (!_enabled || !startTime) return
  const elapsed = performance.now() - startTime
  console.debug(prefix(label), `${formatMs(elapsed)}`)
  const agg = aggregates.get(label)
  if (agg) {
    agg.count++
    agg.total += elapsed
  }
}

export async function asyncTimeLog<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = createTimeLog(label)
  try {
    return await fn()
  } finally {
    syncTimeLog(start, label)
  }
}

export const createAggregatedTimeLog = (label: string) => {
  if (!aggregates.has(label)) {
    aggregates.set(label, { count: 0, total: 0 })
  }
}

export const flushAggregatedTimeLog = (label: string) => {
  const agg = aggregates.get(label)
  if (!agg || agg.count === 0) return
  const avg = agg.total / agg.count
  console.debug(prefix(label), `avg=${formatMs(avg)} count=${agg.count} total=${formatMs(agg.total)}`)
  agg.count = 0
  agg.total = 0
}
