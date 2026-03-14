import { createVNode, render, type VNode } from 'vue'
import BaseModal from '@renderer/components/BaseModal.vue'

const MODAL_BASE_Z_INDEX = 3000
const activeModalContainers: HTMLDivElement[] = []

function syncModalStackZIndex() {
  activeModalContainers.forEach((container, index) => {
    container.style.setProperty('--modal-z-index', String(MODAL_BASE_Z_INDEX + index))
  })
}

export function useModal(): ModalActions {
  const show = (options: BaseModalProps): Promise<string | boolean> => {
    return new Promise<string | boolean>((resolve: ModalResolve) => {
      const container = document.createElement('div')
      const remove = (): void => {
        if (!container.isConnected) return
        render(null, container)
        document.body.removeChild(container)
        const index = activeModalContainers.indexOf(container)
        if (index > -1) {
          activeModalContainers.splice(index, 1)
          syncModalStackZIndex()
        }
      }

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
    remove: () => {
      const topContainer = activeModalContainers[activeModalContainers.length - 1]
      if (!topContainer) return
      render(null, topContainer)
      document.body.removeChild(topContainer)
      activeModalContainers.pop()
      syncModalStackZIndex()
    }
  }
}
