import { PluginContext } from '../types'
import {
  STORAGE_KEY_MODEL_ID,
  STORAGE_KEY_NEGATIVE_PROMPT,
  STORAGE_KEY_SIZE,
  DEFAULT_MODEL_ID,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_SIZE
} from '../constants'

export function usePluginConfig(context: PluginContext, onConfigChange?: () => void) {
  const { ref } = context.vue

  const currentModelId = ref(DEFAULT_MODEL_ID)
  const currentNegativePrompt = ref(DEFAULT_NEGATIVE_PROMPT)
  const currentSize = ref(DEFAULT_SIZE)

  const [ConfigForm, formActions] = context.useForm({
    fields: [
      {
        name: 'modelId',
        type: 'text',
        label: '当前模型',
        placeholder: '输入模型 ID...',
        size: 'sm'
      },
      {
        name: 'negativePrompt',
        type: 'text',
        label: '负面提示词',
        placeholder: '输入负面提示词...',
        size: 'sm'
      },
      {
        name: 'size',
        type: 'text',
        label: '生成尺寸',
        placeholder: '如 1024x1024...',
        size: 'sm'
      }
    ],
    initialData: {
      modelId: currentModelId.value,
      negativePrompt: currentNegativePrompt.value,
      size: currentSize.value
    },
    onChange: async (_field: string, _value: any, data: any) => {
      currentModelId.value = data.modelId
      currentNegativePrompt.value = data.negativePrompt
      currentSize.value = data.size
      await Promise.all([
        context.localforage.setItem(STORAGE_KEY_MODEL_ID, data.modelId),
        context.localforage.setItem(STORAGE_KEY_NEGATIVE_PROMPT, data.negativePrompt),
        context.localforage.setItem(STORAGE_KEY_SIZE, data.size)
      ])
      onConfigChange?.()
    }
  })

  const initConfig = async () => {
    const [savedModelId, savedNegativePrompt, savedSize] = await Promise.all([
      context.localforage.getItem(STORAGE_KEY_MODEL_ID),
      context.localforage.getItem(STORAGE_KEY_NEGATIVE_PROMPT),
      context.localforage.getItem(STORAGE_KEY_SIZE)
    ])
    if (savedModelId) currentModelId.value = savedModelId
    if (savedNegativePrompt) currentNegativePrompt.value = savedNegativePrompt
    if (savedSize) currentSize.value = savedSize

    formActions.setFieldsValue({
      modelId: currentModelId.value,
      negativePrompt: currentNegativePrompt.value,
      size: currentSize.value
    })

    onConfigChange?.()
  }

  return {
    currentModelId,
    currentNegativePrompt,
    currentSize,
    ConfigForm,
    initConfig
  }
}
