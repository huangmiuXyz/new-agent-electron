<template>
  <div class="incremark-wrapper" @contextmenu="showTransMenu">
    <MessageTranslation
      v-if="!disableTranslation"
      :translations="transResults"
      :reasoning-results="transReasoningResults"
      :translation-loading="translating"
      :translation-controller="translationController"
      :streaming-text="transText"
      :streaming-language="transLanguage || undefined"
      :streaming-tick="transTick"
      :reasoning-text="transReasoning"
      @stop-translation="stopTranslate"
    />

    <ThemeProvider :theme="theme">
      <Incremark
        class="incremark-renderer"
        :blocks="effectiveBlocks"
        :customCodeBlocks="customCodeBlocks"
        :codeBlockConfigs="codeBlockConfigs"
        :components="components"
        v-bind="$attrs"
      />
    </ThemeProvider>
  </div>
</template>

<script setup lang="ts">
import '@incremark/theme/styles.css'
import { Incremark, ThemeProvider, useIncremark } from '@incremark/vue'
import type { IncremarkContentProps, RenderableBlock } from '@incremark/vue'
import { useSettingsStore } from '@renderer/stores/settings'
import { getLanguageFlag } from '@renderer/utils/flagIcons'
import type { MenuItem } from '@renderer/composables/useContextMenu'
import MessageTranslation from './MessageTranslation.vue'

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  blocks?: RenderableBlock[]
  customCodeBlocks?: IncremarkContentProps['customCodeBlocks']
  codeBlockConfigs?: IncremarkContentProps['codeBlockConfigs']
  components?: IncremarkContentProps['components']
  text?: string
  disableTranslation?: boolean
}>()

const { display } = storeToRefs(useSettingsStore())

const theme = computed(() => (display.value.darkMode ? 'dark' : 'default'))

const textIncremark = useIncremark({ gfm: true })
watch(() => [props.text, props.blocks] as const, ([text, blocks]) => {
  if (blocks) return
  textIncremark.reset()
  if (text) {
    textIncremark.append(text)
    textIncremark.finalize()
  }
}, { immediate: true })

const effectiveBlocks = computed(() => props.blocks ?? textIncremark.blocks.value)

const translating = ref(false)
const transLanguage = ref('')
const transText = ref('')
const transReasoning = ref('')
const transTick = ref(0)
const transResults = ref<TranslationResult[]>([])
const transReasoningResults = ref<string[]>([])
const abortController = shallowRef<AbortController | null>(null)

const translationController = computed<AbortController['abort'] | undefined>(() => {
  const controller = abortController.value
  return controller ? () => controller.abort() : undefined
})

const doTranslate = async (language: string) => {
  if (!props.text || translating.value) return
  const settingsStore = useSettingsStore()
  const tProviderId = settingsStore.defaultModels.translationProviderId
  const tModelId = settingsStore.defaultModels.translationModelId
  if (!tProviderId || !tModelId) {
    messageApi.error('请先在设置中配置翻译模型')
    return
  }
  const provider = settingsStore.getProviderById(tProviderId)
  const tModel = provider?.models?.find((m) => m.id === tModelId)
  if (!tModel || !provider) {
    messageApi.error('翻译模型配置不完整')
    return
  }

  translating.value = true
  transLanguage.value = language
  transText.value = ''
  abortController.value = new AbortController()

  try {
    const { translateText } = chatService()
    const THROTTLE_MS = 100
    let lastFlush = 0
    let textBuf = ''
    let reasoningBuf = ''

    const flush = () => {
      transText.value = textBuf
      transReasoning.value = reasoningBuf
      transTick.value++
      lastFlush = Date.now()
    }

    await translateText(
      props.text,
      language,
      {
        model: tModel.id,
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl,
        provider: provider.id,
        providerType: provider.providerType
      },
      abortController.value?.signal,
      (chunk: string) => {
        textBuf += chunk
        const now = Date.now()
        if (now - lastFlush >= THROTTLE_MS) flush()
      },
      (text: string) => {
        reasoningBuf += text
        const now = Date.now()
        if (now - lastFlush >= THROTTLE_MS) flush()
      }
    )
    // 最终刷新
    flush()
    transResults.value = [...transResults.value, { text: textBuf, targetLanguage: language, timestamp: Date.now() }]
    transReasoningResults.value = [...transReasoningResults.value, reasoningBuf]
    transText.value = ''
    transReasoning.value = ''
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      messageApi.error('翻译失败: ' + e.message)
    }
  } finally {
    translating.value = false
    abortController.value = null
  }
}

const stopTranslate = () => {
  abortController.value?.abort()
  abortController.value = null
}

const showTransMenu = (e: MouseEvent) => {
  if (props.disableTranslation) {
    return
  }
  if (!props.text) return
  e.preventDefault()
  const LANGUAGES = ['中文', '英文', '日文', '韩文', '法文', '德文', '西班牙文', '俄文']
  const items: MenuItem[] = LANGUAGES.map((lang) => ({
    label: lang,
    icon: getLanguageFlag(lang),
    onClick: () => doTranslate(lang)
  }))
  items.push({ type: 'divider' } as any)
  items.push({
    label: '自定义语言...',
    icon: getLanguageFlag('custom'),
    onClick: async () => {
      const { confirm } = useModal()
      const [FormComponent, { getFieldValue }] = useForm({
        fields: [{ label: '自定义语言', type: 'text', name: 'customLanguage', placeholder: '请输入语言名称' }],
        initialData: { customLanguage: '' }
      })
      if (await confirm({ title: '自定义翻译', content: FormComponent })) {
        const lang = getFieldValue('customLanguage')
        if (lang?.trim()) doTranslate(lang.trim())
      }
    }
  })
  useContextMenu().showContextMenu(e, items)
}
</script>

<style scoped>
.incremark-renderer {
  max-width: 100%;
  overflow-wrap: break-word;
  color: var(--text-primary);
  background: transparent !important;
}

.incremark-renderer :deep(.incremark-default) {
  color: var(--text-primary);
  background: transparent;
}

.incremark-renderer :deep(.incremark-heading),
.incremark-renderer :deep(.incremark-paragraph),
.incremark-renderer :deep(.incremark-list),
.incremark-renderer :deep(.incremark-list-item),
.incremark-renderer :deep(.incremark-footnote-body),
.incremark-renderer :deep(.incremark-table),
.incremark-renderer :deep(.incremark-table th),
.incremark-renderer :deep(.incremark-table td) {
  color: var(--text-primary);
}

.incremark-renderer :deep(.incremark-link) {
  color: var(--color-primary);
}

.incremark-renderer :deep(.incremark-inline-code) {
  color: var(--text-primary);
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.1em 0.35em;
}

.incremark-renderer :deep(.incremark-code pre),
.incremark-renderer :deep(pre) {
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  overflow-x: auto;
}

.incremark-renderer :deep(.incremark-code),
.incremark-renderer :deep(.shiki),
.incremark-renderer :deep(.incremark-code-stream) {
  border-radius: 10px;
}

.incremark-renderer :deep(code) {
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}

.incremark-renderer :deep(.incremark-blockquote) {
  color: var(--text-secondary);
  border-left: 3px solid var(--border-subtle);
  background: var(--bg-hover);
  border-radius: 0 8px 8px 0;
}

.incremark-renderer :deep(.incremark-hr) {
  border-color: var(--border-subtle);
}

.incremark-renderer :deep(.incremark-table-wrapper),
.incremark-renderer :deep(table) {
  display: block;
  width: 100%;
  overflow-x: auto;
}

.incremark-renderer :deep(.incremark-table) {
  border-color: var(--border-subtle);
}

.incremark-renderer :deep(.incremark-table th),
.incremark-renderer :deep(.incremark-table td) {
  border-color: var(--border-subtle);
}

.incremark-renderer :deep(.incremark-table th) {
  background: var(--bg-hover);
}

.incremark-renderer :deep(.incremark-table tr) {
  background: transparent !important;
}

.incremark-renderer :deep(img) {
  max-width: 100%;
  height: auto;
}


</style>
