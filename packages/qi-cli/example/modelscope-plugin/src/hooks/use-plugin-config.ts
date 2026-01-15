import { PluginContext } from '../types'
import {
  STORAGE_KEY_CONFIG,
  DEFAULT_MODEL_ID,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_SIZE
} from '../constants'
import { modelScopeImageCallOptionsSchema } from '../modelscope/modelscope-api-types'

export function usePluginConfig(context: PluginContext) {
  const { ref, toRaw } = context.vue

  const config = ref({
    model: DEFAULT_MODEL_ID,
    negative_prompt: DEFAULT_NEGATIVE_PROMPT,
    size: DEFAULT_SIZE
  })

  const [ConfigForm, formActions] = context.useForm({
    schemas: modelScopeImageCallOptionsSchema,
    initialData: config.value,
    filterDefaultValues: true,
    size: 'sm',
    onChange: async (_field: string, _value: any, data: any) => {
      // 确保保存的是纯对象，避免 DataCloneError
      const plainData = JSON.parse(JSON.stringify(toRaw(data)))
      config.value = plainData
      await context.localforage.setItem(STORAGE_KEY_CONFIG, plainData)
    }
  })

  const initConfig = async () => {
    const savedConfig = await context.localforage.getItem(STORAGE_KEY_CONFIG)
    if (savedConfig) {
      config.value = savedConfig as any
    }

    formActions.setFieldsValue(config.value)
  }

  return {
    config,
    ConfigForm,
    initConfig
  }
}
