import { createVNode, render, type VNode } from 'vue'
import BaseModal from '@renderer/components/BaseModal.vue'
import { acquireZIndex } from '@renderer/utils/z-index-manager'

const activeModalContainers: HTMLDivElement[] = []

function syncModalDocumentState() {
  document.documentElement.classList.toggle('basic-modal-open', activeModalContainers.length > 0)
}

function syncModalStackZIndex() {
  activeModalContainers.forEach((container) => {
    container.style.setProperty('--modal-z-index', container.dataset.zIndex ?? '0')
  })
  syncModalDocumentState()
}

export function useModal(): ModalActions {
  let currentContainer: HTMLDivElement | null = null

  const removeContainer = (container: HTMLDivElement | null): void => {
    if (!container?.isConnected) return
    render(null, container)
    document.body.removeChild(container)
    const index = activeModalContainers.indexOf(container)
    if (index > -1) {
      activeModalContainers.splice(index, 1)
      syncModalStackZIndex()
    }
    if (currentContainer === container) {
      currentContainer = null
    }
  }

  const show = (options: BaseModalProps): Promise<string | boolean> => {
    return new Promise<string | boolean>((resolve: ModalResolve) => {
      const container = document.createElement('div')
      currentContainer = container
      const remove = (): void => removeContainer(container)

      container.dataset.zIndex = String(acquireZIndex())
      activeModalContainers.push(container)
      syncModalStackZIndex()
      document.body.appendChild(container)
      const vnode: VNode = createVNode(BaseModal, {
        ...options,
        resolve,
        remove
      })
      render(vnode, container)
    })
  }

  const confirm = (props: BaseModalProps): Promise<string | boolean> => {
    return show(props)
  }

  return {
    confirm,
    remove: () => removeContainer(currentContainer)
  }
}
