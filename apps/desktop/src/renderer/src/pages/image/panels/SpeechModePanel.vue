<script setup lang="tsx">
import { createRegistry } from '@renderer/services/chatService/registry'
import { speechService } from '@renderer/services/speechService'
import { useSettingsStore } from '@renderer/stores/settings'
import type { ModelCategory } from '@agent-qi/types'

const settingsStore = useSettingsStore()
const tts = speechService()

const speechDynamicField = ref<FormField<any> | null>(null)
const speechVoiceOptions = ref<Array<{ label: string; value: string }>>([])

const getSpeechDynamicFields = (providerId: string) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return null

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  const providerInstance = registry.getProvider(provider.providerType)
  if (!providerInstance?.speechCallOptionsSchema) return null

  const fields = zodSchemasToFormfields(providerInstance.speechCallOptionsSchema, 'providerOptions')
  if (fields.length === 0) return null

  return {
    name: 'providerOptions',
    type: 'group',
    label: '更多设置',
    collapsible: true,
    defaultCollapsed: false,
    children: fields,
    noStyle: true
  } as FormField<any>
}

const getSpeechVoiceOptions = (providerId?: string, modelId?: string) => {
  if (!providerId || !modelId) return []
  const provider = settingsStore.getProviderById(providerId)
  const model = provider?.models?.find((item) => item.id === modelId)
  return (model?.voices || []).map((voice) => ({
    label: voice.name,
    value: voice.id
  }))
}

const speechFields = computed<FormField<any>[]>(() => {
  const fields: FormField<any>[] = [
    {
      name: 'model',
      type: 'modelSelector',
      popupPosition: 'bottom',
      label: '生成模型',
      modelCategory: ['tts'] as ModelCategory[],
      required: true,
      onChange: ({ providerId, modelId }: { providerId: string; modelId: string }) => {
        speechVoiceOptions.value = getSpeechVoiceOptions(providerId, modelId)
        speechDynamicField.value = getSpeechDynamicFields(providerId)
        const currentVoice = speechFormActions.getFieldValue('voice')
        if (currentVoice && !speechVoiceOptions.value.some((item) => item.value === currentVoice)) {
          speechFormActions.setFieldValue('voice', '')
        }
      }
    },
    {
      name: 'voice',
      type: 'select',
      label: '音色',
      placeholder: '请选择音色',
      options: speechVoiceOptions.value,
      clearable: true
    } as FormField<any>,
    {
      name: 'speed',
      type: 'number',
      label: '语速',
      min: 0.1,
      max: 4,
      step: 0.1,
      defaultValue: 1
    } as FormField<any>,
    {
      name: 'language',
      type: 'text',
      label: '语言',
      placeholder: '例如 zh、en、ja 或 auto',
      defaultValue: 'auto'
    } as FormField<any>
  ]

  if (speechDynamicField.value) {
    fields.push(speechDynamicField.value)
  }

  return fields
})

const [SpeechForm, speechFormActions] = useForm({
  fields: () => speechFields.value,
  onChange: (_field, _value, data) => {
    settingsStore.updateSpeechGenerationForm({
      ...data,
      prompt: settingsStore.speechGenerationForm?.prompt || '',
      mediaType: 'speech'
    })
  }
})

const submit = async (text: string, messageId: string) => {
  const data = speechFormActions.getData()
  if (!text.trim() || !data?.model?.modelId || !data?.model?.providerId) return

  await tts.generateAndPlay({
    text: text.trim(),
    messageId,
    modelId: data.model.modelId,
    providerId: data.model.providerId,
    voice: data.voice || undefined,
    speed: data.speed ? Number(data.speed) : undefined,
    language: data.language || undefined,
    providerOptions: data.providerOptions
  })
}

const hasModelSelected = () => !!speechFormActions.getData()?.model?.modelId

onMounted(() => {
  if (settingsStore.speechGenerationForm?.model?.providerId) {
    speechFormActions.setData(settingsStore.speechGenerationForm)
    speechVoiceOptions.value = getSpeechVoiceOptions(
      settingsStore.speechGenerationForm.model.providerId,
      settingsStore.speechGenerationForm.model.modelId
    )
    speechDynamicField.value = getSpeechDynamicFields(settingsStore.speechGenerationForm.model.providerId)
    return
  }

  if (settingsStore.defaultModels.ttsProviderId && settingsStore.defaultModels.ttsModelId) {
    speechFormActions.setFieldsValue({
      model: {
        providerId: settingsStore.defaultModels.ttsProviderId,
        modelId: settingsStore.defaultModels.ttsModelId
      },
      speed: 1,
      language: 'auto'
    } as any)
    speechVoiceOptions.value = getSpeechVoiceOptions(
      settingsStore.defaultModels.ttsProviderId,
      settingsStore.defaultModels.ttsModelId
    )
    speechDynamicField.value = getSpeechDynamicFields(settingsStore.defaultModels.ttsProviderId)
  }
})

defineExpose({
  submit,
  hasModelSelected
})
</script>

<template>
  <SpeechForm />
</template>
