export function useRequestIdleCallback(
  cb: (deadline: IdleDeadline) => void
) {
  let id: number | null = null

  function start() {
    id = requestIdleCallback(cb)
  }

  function cancel() {
    if (id !== null) {
      cancelIdleCallback(id)
      id = null
    }
  }

  return { start, cancel }
}

export function useIdleChunk<T>(
  list: T[],
  handler: (item: T, index: number) => void,
  chunkSize = 100
) {
  const index = ref(0)
  const done = ref(false)

  const { start, cancel } = useRequestIdleCallback((deadline) => {
    let count = 0

    while (
      deadline.timeRemaining() > 0 &&
      index.value < list.length &&
      count < chunkSize
    ) {
      handler(list[index.value], index.value)
      index.value++
      count++
    }

    if (index.value < list.length) {
      start()
    } else {
      done.value = true
    }
  })

  return {
    start,
    stop: cancel,
    done,
    progress: computed(() =>
      list.length ? index.value / list.length : 1
    ),
  }
}

export function useIdleChunkAsync<T>(
  list: T[],
  handler: (item: T, index: number) => Promise<void>,
  chunkSize = 1
) {
  const index = ref(0)
  const done = ref(false)
  let cancelled = false

  const { start, cancel } = useRequestIdleCallback(async (deadline) => {
    let count = 0

    while (
      !cancelled &&
      deadline.timeRemaining() > 0 &&
      index.value < list.length &&
      count < chunkSize
    ) {
      await handler(list[index.value], index.value)
      index.value++
      count++
    }

    if (!cancelled && index.value < list.length) {
      start()
    } else if (index.value >= list.length) {
      done.value = true
    }
  })

  return {
    start,
    stop: () => {
      cancelled = true
      cancel()
    },
    done,
    progress: computed(() =>
      list.length ? index.value / list.length : 1
    ),
  }
}
