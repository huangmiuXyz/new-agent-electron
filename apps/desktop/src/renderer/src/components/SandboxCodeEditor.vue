<script setup lang="ts">
import 'monaco-editor/esm/nls.messages.zh-cn.js'
import * as monaco from 'monaco-editor'
import type { editor, IDisposable } from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import 'monaco-editor/min/vs/editor/editor.main.css'

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    path?: string
    readOnly?: boolean
  }>(),
  {
    language: 'text',
    path: '/untitled.txt',
    readOnly: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  mount: [editor: editor.IStandaloneCodeEditor]
}>()

const settingsStore = useSettingsStore()
const MONACO_CONFIGURED_KEY = '__agentQiMonacoConfigured__'
const MONACO_DIFF_LANGUAGE_KEY = '__agentQiMonacoDiffLanguageConfigured__'
const containerRef = useTemplateRef('containerRef')
const editorRef = shallowRef<editor.IStandaloneCodeEditor | null>(null)
let changeListener: IDisposable | null = null
let resizeObserver: ResizeObserver | null = null

const configureMonaco = () => {
  if (typeof self === 'undefined') return

  const globalScope = self as typeof self & {
    MonacoEnvironment?: {
      getWorker: (_: string, label: string) => Worker
    }
    [MONACO_CONFIGURED_KEY]?: boolean
  }
  if (globalScope[MONACO_CONFIGURED_KEY]) return

  globalScope.MonacoEnvironment = {
    getWorker(_: string, label: string) {
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      return new editorWorker()
    }
  }

  if (!monaco.languages.getLanguages().some((language) => language.id === 'diff')) {
    monaco.languages.register({ id: 'diff' })
  }

  if (!globalScope[MONACO_DIFF_LANGUAGE_KEY]) {
    monaco.languages.setMonarchTokensProvider('diff', {
      tokenizer: {
        root: [
          [/^diff --git.*$/, 'keyword'],
          [/^index .*$/, 'meta'],
          [/^@@.*@@.*$/, 'number'],
          [/^\+\+\+ .*$/, 'type'],
          [/^--- .*$/, 'type'],
          [/^\+.*$/, 'string'],
          [/^-.*$/, 'invalid'],
          [/^Binary files .* differ$/, 'comment'],
          [/^\\ No newline at end of file$/, 'comment'],
          [/^.*$/, '']
        ]
      }
    })
    globalScope[MONACO_DIFF_LANGUAGE_KEY] = true
  }

  globalScope[MONACO_CONFIGURED_KEY] = true
}

configureMonaco()

const monacoLanguage = computed(() => {
  switch (props.language) {
    case 'text':
      return 'plaintext'
    default:
      return props.language
  }
})

const modelPath = computed(() => {
  const normalized = String(props.path || '/untitled.txt').replaceAll('\\', '/')
  return `file://${normalized.startsWith('/') ? normalized : `/${normalized}`}`
})

const monacoTheme = computed(() => (settingsStore.display.darkMode ? 'vs-dark' : 'vs'))

const editorOptions = computed<editor.IStandaloneEditorConstructionOptions>(() => ({
  automaticLayout: true,
  minimap: { enabled: false },
  readOnly: props.readOnly,
  fontSize: 12,
  lineHeight: 20,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  scrollBeyondLastLine: false,
  roundedSelection: false,
  wordWrap: 'off',
  tabSize: 2,
  insertSpaces: true,
  padding: {
    top: 12,
    bottom: 12
  },
  renderLineHighlight: 'all',
  smoothScrolling: true
}))

let modelRef: editor.ITextModel | null = null

const getCurrentModel = () => modelRef

const syncCurrentModelValue = (value: string) => {
  const model = getCurrentModel()
  if (!model) return
  if (model.getValue() === value) return
  model.setValue(value)
}

const ensureEditor = () => {
  if (!containerRef.value || editorRef.value) return

  modelRef = monaco.editor.createModel(props.modelValue, monacoLanguage.value)

  monaco.editor.setTheme(monacoTheme.value)
  editorRef.value = monaco.editor.create(containerRef.value, {
    ...editorOptions.value,
    model: modelRef
  })
  editorRef.value.layout()

  changeListener = editorRef.value.onDidChangeModelContent(() => {
    const value = editorRef.value?.getValue() || ''
    if (value !== props.modelValue) {
      emit('update:modelValue', value)
    }
  })

  requestAnimationFrame(() => {
    editorRef.value?.layout()
  })

  emit('mount', editorRef.value)
}

onMounted(() => {
  nextTick(() => {
    ensureEditor()
    if (containerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          editorRef.value?.layout()
        })
      })
      resizeObserver.observe(containerRef.value)
    }
  })
})

watch(
  [() => modelPath.value, () => monacoLanguage.value],
  () => {
    const model = getCurrentModel()
    if (!model) return
    if (model.getLanguageId() !== monacoLanguage.value) {
      monaco.editor.setModelLanguage(model, monacoLanguage.value)
    }
  }
)

watch(
  () => props.modelValue,
  (value) => {
    syncCurrentModelValue(value)
  }
)

watch(
  monacoTheme,
  (theme) => {
    monaco.editor.setTheme(theme)
  },
  { immediate: true }
)

watch(
  editorOptions,
  (options) => {
    editorRef.value?.updateOptions(options)
    editorRef.value?.layout()
  },
  { deep: true }
)

watch(
  () => containerRef.value,
  () => {
    editorRef.value?.layout()
  }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  changeListener?.dispose()
  changeListener = null
  editorRef.value?.dispose()
  editorRef.value = null
  modelRef?.dispose()
  modelRef = null
})
</script>

<template>
  <div class="sandbox-monaco-editor">
    <div ref="containerRef" class="sandbox-monaco-inner"></div>
  </div>
</template>

<style scoped>
.sandbox-monaco-editor {
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  background: var(--sandbox-editor-bg, #f8fafc);
  overflow: hidden;
}

.sandbox-monaco-status {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.02em;
  background: var(--sandbox-editor-bg, #f8fafc);
}

.sandbox-monaco-inner {
  flex: 1;
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.sandbox-monaco-editor :deep(.monaco-editor),
.sandbox-monaco-editor :deep(.monaco-editor-background),
.sandbox-monaco-editor :deep(.margin) {
  background: var(--sandbox-editor-bg, #f8fafc);
}

:global(.dark-mode) .sandbox-monaco-editor {
  --sandbox-editor-bg: #1e1e1e;
}
</style>
