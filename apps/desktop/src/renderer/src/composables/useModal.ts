import { createVNode, render, type VNode } from 'vue'
import BaseModal from '@renderer/components/BaseModal.vue'
import type { BaseModalProps, ModalActions, ModalResolve } from '@agent-qi/types'

export function useModal(): ModalActions {
  let container: HTMLDivElement | null
  const remove = (): void => {
    if (!container) return
    render(null, container)
    document.body.removeChild(container)
    container = null
  }
  const show = (options: BaseModalProps): Promise<string | boolean> => {
    return new Promise<string | boolean>((resolve: ModalResolve) => {
      container = document.createElement('div')
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
    remove
  }
}
