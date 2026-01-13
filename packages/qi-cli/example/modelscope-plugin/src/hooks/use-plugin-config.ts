import { PluginContext } from '../types'
import {
  STORAGE_KEY_CONFIG,
  DEFAULT_MODEL_ID,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_SIZE
} from '../constants'
import { modelScopeImageCallOptionsSchema } from '../modelscope/modelscope-api-types'

export function usePluginConfig(context: PluginContext, onConfigChange?: () => void) {
  const { ref } = context.vue

  const config = ref({
    model: DEFAULT_MODEL_ID,
    negative_prompt: DEFAULT_NEGATIVE_PROMPT,
    size: DEFAULT_SIZE
  })

  const [ConfigForm, formActions] = context.useForm({
    schemas: modelScopeImageCallOptionsSchema,
    initialData: config.value,
    onChange: async (_field: string, _value: any, data: any) => {
      config.value = data
      await context.localforage.setItem(STORAGE_KEY_CONFIG, data)
      onConfigChange?.()
    }
  })

  const initConfig = async () => {
    const savedConfig = await context.localforage.getItem(STORAGE_KEY_CONFIG)
    if (savedConfig) {
      config.value = savedConfig as any
    }

    formActions.setFieldsValue(config.value)

    onConfigChange?.()
  }

  return {
    config,
    ConfigForm,
    initConfig
  }
}
