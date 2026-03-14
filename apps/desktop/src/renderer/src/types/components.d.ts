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
    onOptionAction?: (option: CheckboxOption) => void
  }
}

export {}
