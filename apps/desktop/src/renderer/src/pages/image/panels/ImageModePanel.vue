<script setup lang="tsx">
import { createRegistry } from '@renderer/services/chatService/registry'
import { useSettingsStore } from '@renderer/stores/settings'
import { ImageBatch, useImageStore } from '@renderer/stores/image'
import { useImageGeneration } from '@renderer/composables/useImageGeneration'
import type { ModelCategory } from '@agent-qi/types'

type ImageResolutionPreset = '1K' | '2K' | '3K' | '4K'

const settingsStore = useSettingsStore()
const imgStore = useImageStore()
const { createImageBatch, startGeneration } = useImageGeneration()

const IMAGE_SIZE_PRESETS: Record<ImageResolutionPreset, Record<string, `${number}x${number}`>> = {
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1424x800',
    '9:16': '800x1424',
    '3:2': '1248x832',
    '2:3': '832x1248',
    '21:9': '1568x672'
  },
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2304x1728',
    '3:4': '1728x2304',
    '16:9': '2848x1600',
    '9:16': '1600x2848',
    '3:2': '2496x1664',
    '2:3': '1664x2496',
    '21:9': '3136x1344'
  },
  '3K': {
    '1:1': '3072x3072',
    '4:3': '3456x2592',
    '3:4': '2592x3456',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
    '2:3': '2496x3744',
    '3:2': '3744x2496',
    '21:9': '4704x2016'
  },
  '4K': {
    '1:1': '4096x4096',
    '4:3': '4608x3456',
    '3:4': '3456x4608',
    '16:9': '5696x3200',
    '9:16': '3200x5696',
    '3:2': '4992x3328',
    '2:3': '3328x4992',
    '21:9': '6272x2688'
  }
}

const IMAGE_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9']

const getSizeFromPreset = (resolution: string, aspectRatio: string): string => {
  const map = IMAGE_SIZE_PRESETS[resolution as keyof typeof IMAGE_SIZE_PRESETS]
  if (!map) return IMAGE_SIZE_PRESETS['2K']['1:1']
  return map[aspectRatio] || map['1:1']
}

const parseSize = (size?: string): { width: number; height: number } => {
  const [w, h] = String(size || '').split('x').map((v) => Number(v))
  return {
    width: Number.isFinite(w) && w > 0 ? w : 1024,
    height: Number.isFinite(h) && h > 0 ? h : 1024
  }
}

const getPresetBySize = (size?: string): { resolution: ImageResolutionPreset; aspectRatio: string; custom: boolean } => {
  if (!size) return { resolution: '2K', aspectRatio: '1:1', custom: false }
  for (const resolution of Object.keys(IMAGE_SIZE_PRESETS) as Array<ImageResolutionPreset>) {
    for (const [aspectRatio, presetSize] of Object.entries(IMAGE_SIZE_PRESETS[resolution])) {
      if (presetSize === size) return { resolution, aspectRatio, custom: false }
    }
  }
  return { resolution: '2K', aspectRatio: '1:1', custom: true }
}

const getDynamicFields = (providerId: string) => {
  const provider = settingsStore.getProviderById(providerId)
  if (!provider) return null

  const registry = createRegistry({
    apiKey: provider.apiKey || '',
    baseURL: provider.baseUrl,
    name: provider.name
  })
  const providerInstance = registry.getProvider(provider.providerType)
  const schema = providerInstance?.imageCallOptionsSchema
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

const imageDynamicField = ref<FormField<any> | null>(null)
const Dices = useIcon('Dices')

const imageFields = computed<FormField<any>[]>(() => {
  const fields: FormField<any>[] = [
    {
      name: 'model',
      type: 'modelSelector',
      popupPosition: 'bottom',
      label: '生成模型',
      modelCategory: ['image'] as ModelCategory[],
      required: true,
      onChange: ({ providerId }: { providerId: string; modelId: string }) => {
        imageDynamicField.value = getDynamicFields(providerId)
      }
    },
    {
      name: 'customSizeEnabled',
      type: 'boolean',
      label: '自定义分辨率',
      defaultValue: false
    } as FormField<any>,
    {
      name: 'resolution',
      type: 'select',
      label: '分辨率档位',
      defaultValue: '2K',
      options: [
        { label: '1K', value: '1K' },
        { label: '2K', value: '2K' },
        { label: '3K', value: '3K' },
        { label: '4K', value: '4K' }
      ],
      ifShow: (data: any) => !data.customSizeEnabled
    } as FormField<any>,
    {
      name: 'aspectRatio',
      type: 'select',
      label: '宽高比',
      defaultValue: '1:1',
      options: IMAGE_ASPECT_RATIOS.map((ratio) => ({ label: ratio, value: ratio })),
      ifShow: (data: any) => !data.customSizeEnabled
    } as FormField<any>,
    {
      name: 'customWidth',
      type: 'number',
      label: '自定义宽度',
      defaultValue: 1024,
      ifShow: (data: any) => !!data.customSizeEnabled
    } as FormField<any>,
    {
      name: 'customHeight',
      type: 'number',
      label: '自定义高度',
      defaultValue: 1024,
      ifShow: (data: any) => !!data.customSizeEnabled
    } as FormField<any>,
    {
      name: 'size',
      type: 'custom',
      label: '当前像素',
      defaultValue: IMAGE_SIZE_PRESETS['2K']['1:1'],
      render: (data: any) => (
        <div class="resolution-value">
          {data.size || (data.customSizeEnabled
            ? `${Number(data.customWidth) || 1024}x${Number(data.customHeight) || 1024}`
            : getSizeFromPreset(data.resolution, data.aspectRatio))}
        </div>
      )
    } as FormField<any>,
    {
      name: 'n',
      type: 'slider',
      label: '生成数量',
      min: 1,
      max: 4,
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
            imageFormActions.setFieldValue('seed', Math.floor(Math.random() * 1000000))
          }}
        >
          {Dices}
        </Button>
      )
    } as FormField<any>
  ]

  if (imageDynamicField.value) {
    fields.push(imageDynamicField.value)
  }

  return fields
})

const [ImageForm, imageFormActions] = useForm({
  fields: () => imageFields.value,
  onChange: (field, _value, data) => {
    if (field === 'customSizeEnabled') {
      const nextSize = data.customSizeEnabled
        ? `${Number(data.customWidth) || 1024}x${Number(data.customHeight) || 1024}`
        : getSizeFromPreset(data.resolution, data.aspectRatio)
      if (data.size !== nextSize) {
        imageFormActions.setFieldValue('size', nextSize)
        return
      }
    }
    if (!data.customSizeEnabled && (field === 'resolution' || field === 'aspectRatio')) {
      const nextSize = getSizeFromPreset(data.resolution, data.aspectRatio)
      if (data.size !== nextSize) {
        imageFormActions.setFieldValue('size', nextSize)
        return
      }
    }
    if (data.customSizeEnabled && (field === 'customWidth' || field === 'customHeight')) {
      const nextSize = `${Number(data.customWidth) || 1024}x${Number(data.customHeight) || 1024}`
      if (data.size !== nextSize) {
        imageFormActions.setFieldValue('size', nextSize)
        return
      }
    }
    settingsStore.updateImageGenerationForm({
      ...data,
      mediaType: 'image'
    })
  }
})

const submit = async (prompt: string, referenceImages: string[] = []) => {
  const data = imageFormActions.getData()
  if (!prompt.trim() || !data?.model?.modelId || !data?.model?.providerId) return

  const batch = createImageBatch({
    prompt: prompt.trim(),
    model: data.model.modelId,
    providerId: data.model.providerId,
    size: data.size,
    n: data.n,
    seed: data.seed ? Number(data.seed) : undefined,
    providerOptions: data.providerOptions,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined
  })

  imgStore.addBatch(batch)
  await startGeneration(batch)
}

const hasModelSelected = () => !!imageFormActions.getData()?.model?.modelId

const restoreFromBatch = (batch: ImageBatch) => {
  const preset = getPresetBySize(batch.size)
  const parsed = parseSize(batch.size)

  imageFormActions.setFieldsValue({
    model: {
      modelId: batch.model,
      providerId: batch.providerId
    },
    n: batch.n,
    seed: batch.seed,
    providerOptions: batch.params?.providerOptions,
    customSizeEnabled: preset.custom,
    resolution: preset.resolution,
    aspectRatio: preset.aspectRatio,
    customWidth: parsed.width,
    customHeight: parsed.height,
    size: batch.size
  } as any)

  if (batch.providerId) {
    imageDynamicField.value = getDynamicFields(batch.providerId)
  }
}

onMounted(() => {
  const saved = settingsStore.imageGenerationForm
  if (!saved?.model?.providerId) return

  imageFormActions.setData(saved)
  const preset = getPresetBySize(saved.size)
  const parsed = parseSize(saved.size)
  imageFormActions.setFieldValue('customSizeEnabled', (saved as any).customSizeEnabled ?? preset.custom)
  imageFormActions.setFieldValue('resolution', (saved as any).resolution || preset.resolution)
  imageFormActions.setFieldValue('aspectRatio', (saved as any).aspectRatio || preset.aspectRatio)
  imageFormActions.setFieldValue('customWidth', Number((saved as any).customWidth) || parsed.width)
  imageFormActions.setFieldValue('customHeight', Number((saved as any).customHeight) || parsed.height)
  imageFormActions.setFieldValue('size', saved.size || getSizeFromPreset(preset.resolution, preset.aspectRatio))
  imageDynamicField.value = getDynamicFields(saved.model.providerId)
})

defineExpose({
  submit,
  hasModelSelected,
  restoreFromBatch
})
</script>

<template>
  <ImageForm />
</template>

<style scoped>
.resolution-value {
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 20px;
}
</style>
