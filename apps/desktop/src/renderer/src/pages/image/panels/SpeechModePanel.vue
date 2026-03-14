<script setup lang="tsx">
import { experimental_generateSpeech as generateSpeech } from 'ai'
import { createRegistry } from '@renderer/services/chatService/registry'
import { useSettingsStore } from '@renderer/stores/settings'
import { useAudioStore } from '@renderer/stores/audio'
import type { ModelCategory } from '@agent-qi/types'
import { usePlugins } from '@renderer/composables/usePlugins'

const settingsStore = useSettingsStore()
const audioStore = useAudioStore()

const speechDynamicField = ref<FormField<any> | null>(null)
const speechVoiceOptions = ref<Array<{ label: string; value: string }>>([])
const isMusicModel = (data: any) => data?.model?.modelId?.startsWith('music-')
const isMusicModelId = (modelId?: string) => !!modelId && modelId.startsWith('music-')

const normalizeAudioSetting = (audioSetting: any) => {
  if (!audioSetting || typeof audioSetting !== 'object') return audioSetting
  const normalizeValue = (value: any) => (Array.isArray(value) ? value[0] : value)
  return {
    ...audioSetting,
    sample_rate: normalizeValue(audioSetting.sample_rate),
    bitrate: normalizeValue(audioSetting.bitrate),
    channel: normalizeValue(audioSetting.channel)
  }
}

const filterProviderOptionsForMusic = (providerOptions: any) => {
  if (!providerOptions || typeof providerOptions !== 'object') return providerOptions
  const next = { ...providerOptions }
  delete next.voice_setting
  delete next.pronunciation_dict
  delete next.timber_weights
  delete next.language_boost
  delete next.voice_modify
  delete next.subtitle_enable
  if (next.audio_setting && typeof next.audio_setting === 'object') {
    const { channel, force_cbr, ...rest } = next.audio_setting
    next.audio_setting = rest
  }
  return next
}

const normalizeFormData = (data: any) => {
  if (!data || typeof data !== 'object') return data
  const providerOptions = data.providerOptions
    ? {
      ...data.providerOptions,
      audio_setting: normalizeAudioSetting(data.providerOptions.audio_setting)
    }
    : data.providerOptions
  return {
    ...data,
    providerOptions
  }
}

const filterFieldsForMusic = (fields: FormField<any>[]) => {
  const hiddenGroups = new Set([
    'providerOptions.voice_setting',
    'providerOptions.pronunciation_dict',
    'providerOptions.timber_weights',
    'providerOptions.language_boost',
    'providerOptions.voice_modify',
    'providerOptions.subtitle_enable'
  ])
  const hiddenFields = new Set([
    'providerOptions.audio_setting.channel',
    'providerOptions.audio_setting.force_cbr'
  ])

  return fields.flatMap((field) => {
    if (hiddenGroups.has(field.name) || hiddenFields.has(field.name)) {
      return []
    }
    if (field.type === 'group' && field.children) {
      const nextChildren = filterFieldsForMusic(field.children)
      if (nextChildren.length === 0) return []
      return [{ ...field, children: nextChildren }]
    }
    return [field]
  })
}

const getSpeechDynamicFields = (providerId: string, modelId?: string) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return null

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  const providerInstance = registry.getProvider(provider.providerType)
  if (!providerInstance?.speechCallOptionsSchema) return null

  let fields = zodSchemasToFormfields(providerInstance.speechCallOptionsSchema, 'providerOptions')
  if (fields.length === 0) return null
  if (isMusicModelId(modelId)) {
    fields = filterFieldsForMusic(fields)
  }

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
        speechDynamicField.value = getSpeechDynamicFields(providerId, modelId)
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
      clearable: true,
      ifShow: (data: any) => !isMusicModel(data)
    } as FormField<any>,
    {
      name: 'speed',
      type: 'number',
      label: '语速',
      min: 0.1,
      max: 4,
      step: 0.1,
      defaultValue: 1,
      ifShow: (data: any) => !isMusicModel(data)
    } as FormField<any>,
    {
      name: 'language',
      type: 'text',
      label: '语言',
      placeholder: '例如 zh、en、ja 或 auto',
      defaultValue: 'auto',
      ifShow: (data: any) => !isMusicModel(data)
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
  const providerOptions = isMusicModelId(data.model.modelId)
    ? filterProviderOptionsForMusic(data.providerOptions)
    : data.providerOptions
  const provider = settingsStore.getProviderById(data.model.providerId)!
  const chunkId = nanoid()

  const modelInfo = provider.models?.find((item) => item.id === data.model.modelId)
  audioStore.addBatch({
    id: chunkId,
    messageId,
    prompt: text.trim(),
    model: data.model.modelId,
    providerId: data.model.providerId,
    providerName: provider.name,
    modelName: modelInfo?.name || data.model.modelId,
    mediaType: isMusicModelId(data.model.modelId) ? 'music' : 'speech',
    status: 'processing'
  })

  const modelString = `${provider.providerType}:${data.model.modelId}`
  const cleanObject = (obj: any): any => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => {
          if (v === '' || v === null || v === undefined) return false
          if (Array.isArray(v) && v.length === 0) return false
          return true
        })
        .map(([k, v]) => [k, cleanObject(v)])
    )
  }

  const params = {
    text: text.trim(),
    messageId,
    modelId: data.model.modelId,
    providerId: data.model.providerId,
    voice: data.voice || undefined,
    speed: data.speed ? Number(data.speed) : undefined,
    language: data.language || undefined,
    providerOptions
  }

  try {

    const { audio } = await generateSpeech({
      model: createRegistry({
        apiKey: provider.apiKey || '',
        baseURL: provider.baseUrl,
        name: provider.name
      }).speechModel(modelString as any),
      text: params.text,
      voice: params.voice,
      speed: params.speed,
      language: params.language,
      providerOptions: {
        [provider.providerType]: cleanObject(providerOptions || {})
      }
    })

    const base64 = audio.base64
    const mediaType = audio.mediaType || 'audio/mpeg'
    audioStore.updateBatch(chunkId, {
      audioData: base64,
      audioMediaType: mediaType,
      audioFormat: audio.format,
      status: 'completed',
      error: undefined
    })
  } catch (error) {
    console.error('Speech generation failed:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    audioStore.updateBatch(chunkId, { status: 'failed', error: errorMessage })
    throw error
  }
}

const hasModelSelected = () => !!speechFormActions.getData()?.model?.modelId

onMounted(() => {
  if (settingsStore.speechGenerationForm?.model?.providerId) {
    speechFormActions.setData(normalizeFormData(settingsStore.speechGenerationForm))
    speechVoiceOptions.value = getSpeechVoiceOptions(
      settingsStore.speechGenerationForm.model.providerId,
      settingsStore.speechGenerationForm.model.modelId
    )
    speechDynamicField.value = getSpeechDynamicFields(
      settingsStore.speechGenerationForm.model.providerId,
      settingsStore.speechGenerationForm.model.modelId
    )
    return
  }

  if (settingsStore.defaultModels.ttsProviderId && settingsStore.defaultModels.ttsModelId) {
    speechFormActions.setFieldsValue(normalizeFormData({
      model: {
        providerId: settingsStore.defaultModels.ttsProviderId,
        modelId: settingsStore.defaultModels.ttsModelId
      },
      speed: 1,
      language: 'auto'
    } as any))
    speechVoiceOptions.value = getSpeechVoiceOptions(
      settingsStore.defaultModels.ttsProviderId,
      settingsStore.defaultModels.ttsModelId
    )
    speechDynamicField.value = getSpeechDynamicFields(
      settingsStore.defaultModels.ttsProviderId,
      settingsStore.defaultModels.ttsModelId
    )
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
