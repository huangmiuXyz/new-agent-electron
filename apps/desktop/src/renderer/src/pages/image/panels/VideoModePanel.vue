<script setup lang="tsx">
import { createRegistry } from '@renderer/services/chatService/registry'
import { useSettingsStore } from '@renderer/stores/settings'
import { ImageBatch, useImageStore } from '@renderer/stores/image'
import { useImageGeneration } from '@renderer/composables/useImageGeneration'
import type { ModelCategory } from '@agent-qi/types'

const settingsStore = useSettingsStore()
const imgStore = useImageStore()
const { createVideoBatch, startVideoGeneration } = useImageGeneration()

const getDynamicFields = (providerId: string) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return null

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  const providerInstance = registry.getProvider(provider.providerType)
  const schema = providerInstance?.videoCallOptionsSchema
  if (!schema) return null

  const fields = zodSchemasToFormfields(schema, `providerOptions.${provider.providerType}`)
  if (fields.length === 0) return null

  return {
    name: `providerOptions.${provider.providerType}`,
    type: 'group',
    label: '更多设置',
    collapsible: true,
    defaultCollapsed: false,
    children: fields,
    noStyle: true
  } as FormField<any>
}

const videoDynamicField = ref<FormField<any> | null>(null)
const Dices = useIcon('Dices')

const videoFields = computed<FormField<any>[]>(() => {
  const fields: FormField<any>[] = [
    {
      name: 'model',
      type: 'modelSelector',
      popupPosition: 'bottom',
      label: '生成模型',
      modelCategory: ['video'] as ModelCategory[],
      required: true,
      onChange: ({ providerId }: { providerId: string; modelId: string }) => {
        videoDynamicField.value = getDynamicFields(providerId)
      }
    },
    {
      name: 'duration',
      type: 'slider',
      label: '视频时长',
      defaultValue: 5,
      min: 1,
      step: 1,
    } as FormField<any>,
    {
      name: 'resolution',
      type: 'select',
      label: '分辨率',
      defaultValue: '720p',
      options: [
        { label: '540p', value: '540p' },
        { label: '720p', value: '720p' },
        { label: '1080p', value: '1080p' }
      ]
    } as FormField<any>,
    {
      name: 'n',
      type: 'slider',
      label: '生成视频数',
      min: 1,
      max: 1,
      step: 1,
      defaultValue: 1
    } as FormField<any>,
    {
      name: 'seed',
      label: '随机种子',
      placeholder: '留空则随机生成...',
      type: 'number',
      rest: () => (
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            videoFormActions.setFieldValue('seed', Math.floor(Math.random() * 1000000))
          }}
        >
          {Dices}
        </Button>
      )
    } as FormField<any>
  ]

  if (videoDynamicField.value) {
    fields.push(videoDynamicField.value)
  }

  return fields
})

const [VideoForm, videoFormActions] = useForm({
  fields: () => videoFields.value,
  onChange: (_field, _value, data) => {
    settingsStore.updateImageGenerationForm({
      ...data,
      mediaType: 'video'
    })
  }
})

const submit = async (prompt: string, referenceImages: string[] = []) => {
  const data = videoFormActions.getData()
  if (!prompt.trim() || !data?.model?.modelId || !data?.model?.providerId) return

  const batch = createVideoBatch({
    prompt: prompt.trim(),
    model: data.model.modelId,
    providerId: data.model.providerId,
    n: data.n,
    seed: data.seed ? Number(data.seed) : undefined,
    duration: data.duration ? Number(data.duration) : undefined,
    resolution: data.resolution,
    providerOptions: data.providerOptions,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined
  })

  imgStore.addBatch(batch)
  await startVideoGeneration(batch)
}

const hasModelSelected = () => !!videoFormActions.getData()?.model?.modelId

const restoreFromBatch = (batch: ImageBatch) => {
  videoFormActions.setFieldsValue({
    model: {
      modelId: batch.model,
      providerId: batch.providerId
    },
    n: batch.n,
    seed: batch.seed,
    providerOptions: batch.params?.providerOptions,
    duration: batch.duration,
    resolution: batch.resolution
  } as any)

  if (batch.providerId) {
    videoDynamicField.value = getDynamicFields(batch.providerId)
  }
}

onMounted(() => {
  const saved = settingsStore.videoGenerationForm
  if (!saved?.model?.providerId) return

  videoFormActions.setData(saved)
  videoDynamicField.value = getDynamicFields(saved.model.providerId)
})

defineExpose({
  submit,
  hasModelSelected,
  restoreFromBatch
})
</script>

<template>
  <VideoForm />
</template>
