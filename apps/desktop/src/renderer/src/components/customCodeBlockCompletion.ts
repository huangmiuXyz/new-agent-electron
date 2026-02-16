import type { ComputedRef, InjectionKey } from 'vue'

export const CUSTOM_CODE_BLOCK_COMPLETED_KEY: InjectionKey<ComputedRef<boolean>> =
    Symbol('custom-code-block-completed')
