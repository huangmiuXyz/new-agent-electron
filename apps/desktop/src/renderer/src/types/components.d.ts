export * from '@agent-qi/types/components'

import type { Component, CSSProperties, VNode } from 'vue'

declare global {
  interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'icon' | 'text'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    danger?: boolean
    loading?: boolean
  }

  interface BaseModalProps {
    title: string
    content?: string | VNode | Component | (() => VNode)
    footer?: string | VNode | Component | (() => VNode)
    resolve?: (value: string | boolean) => void
    remove?: () => void
    confirmProps?: ButtonProps
    width?: string
    onOk?: (remove: () => void) => void | Promise<void>
    height?: string
    maxHeight?: string
    cancelText?: string
    showCancel?: boolean
    confirmText?: string
    onCancel?: () => void | Promise<void>
    onClose?: () => void
    beforeClose?: () => boolean | Promise<boolean>
    variant?: 'center' | 'drawer'
    showFooter?: boolean
    modalBodyStyle?: CSSProperties
  }

  interface CheckboxOption {
    actionActive?: boolean
    actionDisabled?: boolean
    actionTitle?: string
    tags?: string[]
    tagColor?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'cyan'
  }

  interface CheckboxGroupField<T> {
    optionAction?: (option: CheckboxOption, event?: MouseEvent) => void
    optionContextMenu?: (option: CheckboxOption, event: MouseEvent) => void
  }
}

export {}
