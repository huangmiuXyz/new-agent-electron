import { onMounted, onUnmounted, watch, isRef } from 'vue'

export interface UseBackButtonOptions {
  enabled?: boolean | Ref<boolean>
  handler: () => boolean | void
}

export function useBackButton(options: UseBackButtonOptions) {
  const { enabled = true, handler } = options
  let pushed = false

  const isEnabled = () => (typeof enabled === 'boolean' ? enabled : enabled.value)

  const push = () => {
    if (!pushed) {
      history.pushState({ __backBlock: true }, '', location.href)
      pushed = true
    }
  }

  const pop = () => {
    if (pushed) {
      history.back()
      pushed = false
    }
  }

  const onPopState = () => {
    if (!isEnabled()) return

    const block = handler()
    if (block === true) {
      push()
    } else {
      pushed = false
    }
  }

  onMounted(() => {
    if (isEnabled()) {
      push()
      window.addEventListener('popstate', onPopState)
    }
  })

  if (isRef(enabled)) {
    watch(enabled, (val) => {
      if (val) {
        push()
        window.addEventListener('popstate', onPopState)
      } else {
        window.removeEventListener('popstate', onPopState)
        pop()
      }
    })
  }

  onUnmounted(() => {
    window.removeEventListener('popstate', onPopState)
    pop()
  })
}
