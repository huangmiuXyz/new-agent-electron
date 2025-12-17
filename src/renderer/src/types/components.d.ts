export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'icon' | 'text'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  danger?: boolean
}

export interface BaseModalProps {
  title: string
  content?: string | VNode | Component
  resolve?: Function
  remove?: Function
  confirmProps?: ButtonProps
  width?: string
  onOk?: () => void
  height?: string
  maxHeight?: string
  cancelText?: string
  confirmText?: string
  onCancel?: () => void
}
