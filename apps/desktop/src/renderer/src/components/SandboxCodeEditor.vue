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

const MONACO_CONFIGURED_KEY = '__agentQiMonacoConfigured__'
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

const editorValue = computed({
  get: () => props.modelValue,
  set: (value?: string) => emit('update:modelValue', value || '')
})

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

const createModelUri = () => monaco.Uri.parse(modelPath.value)

const getOrCreateModel = () => {
  const uri = createModelUri()
  const existingModel = monaco.editor.getModel(uri)

  if (existingModel) {
    if (existingModel.getLanguageId() !== monacoLanguage.value) {
      monaco.editor.setModelLanguage(existingModel, monacoLanguage.value)
    }
    if (existingModel.getValue() !== props.modelValue) {
      existingModel.setValue(props.modelValue)
    }
    return existingModel
  }

  return monaco.editor.createModel(props.modelValue, monacoLanguage.value, uri)
}

const ensureEditor = () => {
  if (!containerRef.value || editorRef.value) return

  const model = getOrCreateModel()
  monaco.editor.setTheme('vs-dark')
  editorRef.value = monaco.editor.create(containerRef.value, {
    ...editorOptions.value,
    model
  })
  editorRef.value.layout()

  changeListener = editorRef.value.onDidChangeModelContent(() => {
    const value = editorRef.value?.getValue() || ''
    if (value !== props.modelValue) {
      editorValue.value = value
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
    if (!editorRef.value) return
    const nextModel = getOrCreateModel()
    if (editorRef.value.getModel() !== nextModel) {
      editorRef.value.setModel(nextModel)
    }
  }
)

watch(
  () => props.modelValue,
  (value) => {
    const model = editorRef.value?.getModel()
    if (!model) return
    if (model.getValue() !== value) {
      model.setValue(value)
    }
  }
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
  background: #1e1e1e;
  overflow: hidden;
}

.sandbox-monaco-status {
  height: 100%;
  display: grid;
  place-items: center;
  color: rgba(212, 212, 212, 0.68);
  font-size: 12px;
  letter-spacing: 0.02em;
  background: #1e1e1e;
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
  background: #1e1e1e;
}
</style>
