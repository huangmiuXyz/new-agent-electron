export * from '@agent-qi/types/components'

declare global {
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
