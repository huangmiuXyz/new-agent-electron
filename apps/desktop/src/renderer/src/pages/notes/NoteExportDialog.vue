<script setup lang="ts">
import Button from '@renderer/components/Button.vue'
import Input from '@renderer/components/Input.vue'
import Select from '@renderer/components/Select.vue'
import Textarea from '@renderer/components/Textarea.vue'
import { useModal } from '@renderer/composables/useModal'
import { FormItem } from '@renderer/composables/useForm'
import type { Note } from '@renderer/stores/notes'
import type { FormField } from '@renderer/types/components'
import { copyElementImageToClipboard, saveElementImageToFile } from '@renderer/utils'
import { formatTime } from '@renderer/utils/time'
import { defineComponent, h } from 'vue'
import JSZip from 'jszip'

const props = defineProps<{
  onClose?: () => void
}>()

type ExportFormat = 'image' | 'pdf' | 'word' | 'epub' | 'html' | 'text'
type CssPreset = {
  id: string
  name: string
  css: string
  builtin?: boolean
}

const notesStore = useNotesStore()
const cssPresetModal = useModal()
const { Copy, Document, Download, File, Settings } = useIcon([
  'Copy',
  'Document',
  'Download',
  'File',
  'Settings'
])

type ExportSettingsForm = {
  includeTitle: boolean
  exportContent: string
  useEditorStyle: boolean
  customCss: string
  textOutputMode: string
  textExtension: string
  lineBreakMode: string
}

const formatTabs: { key: ExportFormat; label: string; disabled?: boolean }[] = [
  { key: 'image', label: '图片' },
  // { key: 'pdf', label: 'PDF', disabled: true },
  // { key: 'word', label: 'Word', disabled: true },
  // { key: 'epub', label: 'EPUB', disabled: true },
  // { key: 'html', label: 'HTML', disabled: true },
  { key: 'text', label: '文本' }
]

const activeFormat = ref<ExportFormat>('image')
const selectedNoteIds = ref<string[]>([])
const includeTitle = ref(true)
const imageWidth = ref(600)
const imageWaitSeconds = ref(3)
const useEditorStyle = ref(true)
const customCss = ref('')
const textOutputMode = ref('single')
const textExtension = ref<'txt' | 'md'>('txt')
const lineBreakMode = ref('auto')
const isCopyingImage = ref(false)
const isExporting = ref(false)
const previewArticleRef = ref<HTMLElement | null>(null)

const textOutputOptions = [
  { label: '单个文件', value: 'single' },
  { label: '多个文件', value: 'multiple' }
]
const textExtensionOptions = [
  { label: 'Text (.txt)', value: 'txt' },
  { label: 'Markdown (.md)', value: 'md' }
]
const CUSTOM_CSS_PRESETS_STORAGE_KEY = 'note-export-custom-css-presets'
const BUILTIN_CSS_PRESETS: CssPreset[] = [
  {
    id: 'builtin-default',
    name: '默认',
    css: '',
    builtin: true
  },
  {
    id: 'builtin-paper',
    name: '纸张',
    css: `.note-export-image-card {
  background: #fffdf7;
  color: #2b2118;
  border: 1px solid #eadfca;
  box-shadow: 0 22px 54px rgba(112, 84, 48, 0.18);
  font-family: Georgia, "Times New Roman", serif;
}

.note-export-image-title,
.note-export-image-content h1,
.note-export-image-content h2,
.note-export-image-content h3 {
  color: #24190f;
}

.note-export-image-divider {
  background: linear-gradient(90deg, transparent, #c7a46a, transparent);
}`,
    builtin: true
  },
  {
    id: 'builtin-simulation',
    name: '仿真',
    css: `.note-export-image-card {
  background:
    linear-gradient(90deg, rgba(255, 0, 0, 0.035) 1px, transparent 1px) 42px 0 / 24px 24px,
    linear-gradient(#f9f2de 23px, #e7d8b6 24px);
  color: #2c2418;
  border: 1px solid #d8c69f;
  box-shadow: 0 26px 70px rgba(58, 42, 22, 0.24);
}

.note-export-image-content {
  font-family: "Bradley Hand", "Comic Sans MS", "Segoe Print", cursive;
  font-size: 18px;
}

.note-export-image-title {
  font-family: "Bradley Hand", "Comic Sans MS", "Segoe Print", cursive;
}`,
    builtin: true
  },
  {
    id: 'builtin-cyberpunk',
    name: '赛博朋克',
    css: `.note-export-image-card {
  background:
    linear-gradient(135deg, rgba(255, 0, 184, 0.18), transparent 32%),
    linear-gradient(315deg, rgba(0, 240, 255, 0.2), transparent 38%),
    #080812;
  color: #e8fbff;
  border: 1px solid #00f0ff;
  box-shadow: 0 0 0 1px rgba(255, 0, 184, 0.5), 0 0 42px rgba(0, 240, 255, 0.32);
}

.note-export-image-title,
.note-export-image-content h1,
.note-export-image-content h2,
.note-export-image-content h3 {
  color: #ff4fd8;
  text-shadow: 0 0 12px rgba(255, 79, 216, 0.75);
}

.note-export-image-meta,
.note-export-image-content {
  color: #d7fbff;
}

.note-export-image-divider {
  background: linear-gradient(90deg, #ff4fd8, #00f0ff);
}`,
    builtin: true
  }
]

const loadCustomCssPresets = (): CssPreset[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_CSS_PRESETS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((preset) => {
        return (
          preset &&
          typeof preset.id === 'string' &&
          typeof preset.name === 'string' &&
          typeof preset.css === 'string'
        )
      })
      .map((preset) => ({
        id: preset.id,
        name: preset.name,
        css: preset.css
      }))
  } catch {
    return []
  }
}

const customCssPresets = ref<CssPreset[]>(loadCustomCssPresets())
const selectedCssPresetId = ref(BUILTIN_CSS_PRESETS[0]!.id)
const cssPresetName = ref('')

const [SettingsForm, settingsFormActions] = useForm<ExportSettingsForm>({
  size: 'sm',
  showHeader: false,
  initialData: {
    includeTitle: includeTitle.value,
    exportContent: 'body',
    useEditorStyle: useEditorStyle.value,
    customCss: customCss.value,
    textOutputMode: textOutputMode.value,
    textExtension: textExtension.value,
    lineBreakMode: lineBreakMode.value
  },
  fields: (): FormField<ExportSettingsForm>[] => [
    {
      name: 'includeTitle',
      label: '导出项中包含文档标题',
      type: 'boolean'
    },
    ...(activeFormat.value === 'image'
      ? ([
          {
            name: 'useEditorStyle',
            label: '应用编辑器中的文字样式',
            type: 'boolean'
          }
        ] as FormField<ExportSettingsForm>[])
      : ([
          {
            name: 'textOutputMode',
            label: '输出为',
            type: 'select',
            required: true,
            options: textOutputOptions
          },
          {
            name: 'textExtension',
            label: '文件后缀',
            type: 'select',
            required: true,
            options: textExtensionOptions
          }
        ] as FormField<ExportSettingsForm>[]))
  ],
  onChange: (_field, _value, data) => {
    includeTitle.value = Boolean(data.includeTitle)
    useEditorStyle.value = Boolean(data.useEditorStyle)
    textOutputMode.value = String(data.textOutputMode || 'single')
    textExtension.value = data.textExtension === 'md' ? 'md' : 'txt'
    lineBreakMode.value = String(data.lineBreakMode || 'auto')
  }
})

const baseSettingsFields = computed<FormField<ExportSettingsForm>[]>(() => [
  {
    name: 'includeTitle',
    label: '导出项中包含文档标题',
    type: 'boolean'
  }
])

const imageStyleSettingsFields = computed<FormField<ExportSettingsForm>[]>(() => [
  {
    name: 'useEditorStyle',
    label: '应用编辑器中的文字样式',
    type: 'boolean'
  }
])

const textSettingsFields = computed<FormField<ExportSettingsForm>[]>(() => [
  {
    name: 'textOutputMode',
    label: '输出为',
    type: 'select',
    required: true,
    options: textOutputOptions
  },
  {
    name: 'textExtension',
    label: '文件后缀',
    type: 'select',
    required: true,
    options: textExtensionOptions
  }
])

const availableNotes = computed<Note[]>(() => {
  if (notesStore.currentFolderId) {
    return notesStore.getAllNotesInFolder(notesStore.currentFolderId)
  }

  if (notesStore.currentNote) {
    return [notesStore.currentNote]
  }

  return notesStore.notes
})

const selectedNotes = computed(() => {
  const selected = new Set(selectedNoteIds.value)
  return availableNotes.value.filter((note) => selected.has(note.id))
})

const noteListItems = computed(() =>
  availableNotes.value.map((note) => ({
    id: note.id,
    title: note.title || '未命名笔记',
    icon: Document,
    note
  }))
)

const previewNote = computed(() => selectedNotes.value[0] || availableNotes.value[0] || null)
const selectedCountText = computed(
  () => `${selectedNotes.value.length} / ${availableNotes.value.length}`
)
const hasSelectedNotes = computed(() => selectedNotes.value.length > 0)
const normalizedCustomCss = computed(() => customCss.value.trim())
const allSelected = computed(
  () =>
    availableNotes.value.length > 0 && selectedNotes.value.length === availableNotes.value.length
)
const cssPresets = computed(() => [...BUILTIN_CSS_PRESETS, ...customCssPresets.value])
const selectedCustomCssPreset = computed(
  () => customCssPresets.value.find((preset) => preset.id === selectedCssPresetId.value) || null
)
const cssPresetOptions = computed(() =>
  cssPresets.value.map((preset) => ({
    label: `${preset.builtin ? '内置' : '自定义'} · ${preset.name}`,
    value: preset.id
  }))
)

watch(
  customCssPresets,
  (presets) => {
    localStorage.setItem(CUSTOM_CSS_PRESETS_STORAGE_KEY, JSON.stringify(presets))
  },
  { deep: true }
)

watch(
  availableNotes,
  (notes) => {
    const availableIds = new Set(notes.map((note) => note.id))
    const preserved = selectedNoteIds.value.filter((id) => availableIds.has(id))
    selectedNoteIds.value = preserved.length > 0 ? preserved : notes.map((note) => note.id)
  },
  { immediate: true }
)

const setActiveFormat = (tab: { key: ExportFormat; label: string; disabled?: boolean }) => {
  if (tab.disabled) {
    messageApi.info(`${tab.label} 导出暂未实现`)
    return
  }
  activeFormat.value = tab.key
}

watch(activeFormat, () => {
  settingsFormActions.setFieldsValue({
    ...settingsFormActions.getData(),
    includeTitle: includeTitle.value,
    useEditorStyle: useEditorStyle.value,
    customCss: customCss.value,
    textOutputMode: textOutputMode.value,
    textExtension: textExtension.value,
    lineBreakMode: lineBreakMode.value
  })
})

const setCustomCssValue = (value: string) => {
  customCss.value = value
  settingsFormActions.setFieldsValue({
    ...settingsFormActions.getData(),
    customCss: value
  })
}

const getUniquePresetName = (baseName: string) => {
  const normalized = baseName.trim() || '自定义样式'
  const usedNames = new Set(cssPresets.value.map((preset) => preset.name))
  if (!usedNames.has(normalized)) return normalized

  let index = 2
  while (usedNames.has(`${normalized} ${index}`)) {
    index += 1
  }
  return `${normalized} ${index}`
}

const createCssPresetId = () =>
  `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const applyCssPreset = (presetId: string | number | undefined) => {
  if (!presetId) return
  const preset = cssPresets.value.find((item) => item.id === presetId)
  if (!preset) return

  cssPresetName.value = preset.builtin
    ? preset.id === 'builtin-default'
      ? ''
      : `${preset.name}副本`
    : preset.name
  setCustomCssValue(preset.css)
}

watch(selectedCssPresetId, applyCssPreset, { immediate: true })

const createBlankCssPreset = () => {
  selectedCssPresetId.value = ''
  cssPresetName.value = ''
  setCustomCssValue('')
}

const markCssPresetDraft = () => {
  if (selectedCssPresetId.value && !selectedCustomCssPreset.value) {
    selectedCssPresetId.value = ''
  }
}

const saveCssPreset = () => {
  const name = cssPresetName.value.trim()
  if (!name) {
    messageApi.warning('请输入预设名称')
    return
  }

  const selectedCustom = selectedCustomCssPreset.value
  if (selectedCustom) {
    customCssPresets.value = customCssPresets.value.map((preset) =>
      preset.id === selectedCustom.id
        ? { ...preset, name, css: customCss.value }
        : preset
    )
    messageApi.success('已更新 CSS 预设')
    return
  }

  const preset: CssPreset = {
    id: createCssPresetId(),
    name: getUniquePresetName(name),
    css: customCss.value
  }
  customCssPresets.value = [...customCssPresets.value, preset]
  selectedCssPresetId.value = preset.id
  cssPresetName.value = preset.name
  messageApi.success('已保存 CSS 预设')
}

const deleteCssPreset = () => {
  const selectedCustom = selectedCustomCssPreset.value
  if (!selectedCustom) return

  customCssPresets.value = customCssPresets.value.filter(
    (preset) => preset.id !== selectedCustom.id
  )
  selectedCssPresetId.value = BUILTIN_CSS_PRESETS[0]!.id
  messageApi.success('已删除 CSS 预设')
}

const openCssPresetManager = () => {
  const content = defineComponent({
    name: 'NoteExportCssPresetManager',
    setup() {
      const selectPreset = (presetId: string | number | undefined) => {
        selectedCssPresetId.value = String(presetId || '')
      }

      return () =>
        h('div', { class: 'css-preset-manager' }, [
          h('div', { class: 'css-preset-manager-grid' }, [
            h('div', { class: 'css-preset-manager-sidebar' }, [
              h('div', { class: 'css-preset-manager-label' }, '预设'),
              h(Select, {
                modelValue: selectedCssPresetId.value,
                'onUpdate:modelValue': selectPreset,
                options: cssPresetOptions.value,
                placeholder: '未选择预设',
                size: 'sm'
              }),
              h('div', { class: 'css-preset-manager-list' }, [
                ...cssPresets.value.map((preset) =>
                  h(
                    'button',
                    {
                      key: preset.id,
                      class: [
                        'css-preset-manager-item',
                        selectedCssPresetId.value === preset.id && 'active'
                      ],
                      type: 'button',
                      onClick: () => selectPreset(preset.id)
                    },
                    [
                      h('span', { class: 'css-preset-manager-item-name' }, preset.name),
                      h(
                        'span',
                        { class: ['css-preset-manager-badge', preset.builtin && 'builtin'] },
                        preset.builtin ? '内置' : '自定义'
                      )
                    ]
                  )
                )
              ])
            ]),
            h('div', { class: 'css-preset-manager-editor' }, [
              h('div', { class: 'css-preset-manager-label' }, '名称'),
              h(Input, {
                modelValue: cssPresetName.value,
                'onUpdate:modelValue': (value: string | number | undefined) => {
                  markCssPresetDraft()
                  cssPresetName.value = String(value || '')
                },
                placeholder: '预设名称',
                size: 'sm'
              }),
              h('div', { class: 'css-preset-manager-label css-preset-manager-css-label' }, 'CSS'),
              h(Textarea, {
                modelValue: customCss.value,
                'onUpdate:modelValue': (value: string | undefined) => {
                  markCssPresetDraft()
                  setCustomCssValue(String(value || ''))
                },
                class: 'css-preset-manager-textarea',
                rows: 16,
                placeholder: '.note-export-image-card {\n  padding: 48px;\n}'
              })
            ])
          ]),
          h('div', { class: 'css-preset-manager-actions' }, [
            h(
              Button,
              {
                size: 'sm',
                variant: 'secondary',
                onClick: createBlankCssPreset
              },
              () => '新建'
            ),
            h(
              Button,
              {
                size: 'sm',
                onClick: saveCssPreset
              },
              () => '保存'
            ),
            h(
              Button,
              {
                size: 'sm',
                variant: 'secondary',
                danger: true,
                disabled: !selectedCustomCssPreset.value,
                onClick: deleteCssPreset
              },
              () => '删除'
            )
          ])
        ])
    }
  })

  void cssPresetModal.confirm({
    title: 'CSS 预设',
    content,
    showFooter: false,
    width: '720px',
    modalBodyStyle: {
      padding: '14px',
      overflow: 'hidden'
    }
  })
}

const syncPreviewCustomCss = async () => {
  await nextTick()
  const article = previewArticleRef.value
  if (!article) return

  let style = article.querySelector<HTMLStyleElement>(':scope > style[data-note-export-custom-css]')
  if (!normalizedCustomCss.value) {
    style?.remove()
    return
  }

  if (!style) {
    style = document.createElement('style')
    style.dataset.noteExportCustomCss = 'true'
    article.prepend(style)
  }
  style.textContent = normalizedCustomCss.value
}

watch([normalizedCustomCss, activeFormat, previewNote], () => {
  void syncPreviewCustomCss()
}, { immediate: true })

const setAllNotesSelected = (checked: boolean) => {
  selectedNoteIds.value = checked ? availableNotes.value.map((note) => note.id) : []
}

const isNoteSelected = (noteId: string) => selectedNoteIds.value.includes(noteId)

const setNoteSelected = (noteId: string, checked: boolean) => {
  if (checked) {
    selectedNoteIds.value = [...new Set([...selectedNoteIds.value, noteId])]
    return
  }
  selectedNoteIds.value = selectedNoteIds.value.filter((id) => id !== noteId)
}

const toggleNoteSelection = (noteId: string) => {
  setNoteSelected(noteId, !isNoteSelected(noteId))
}

const getFolderPathText = (folderId: string | null) => {
  if (!folderId) return '根目录'
  return (
    notesStore
      .folderPath(folderId)
      .map((folder) => folder.name)
      .join(' / ') || '根目录'
  )
}

const sanitizeFileName = (value: string) => {
  const normalized = (value || '未命名笔记').trim().replace(/[\\/:*?"<>|]/g, '_')
  return normalized.replace(/\s+/g, ' ').slice(0, 80) || '未命名笔记'
}

const getDownloadsPath = () => {
  try {
    return window.api.getPath('downloads')
  } catch {
    return ''
  }
}

const ensureExtension = (filePath: string, extension: string) => {
  return filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`
}

const getUniquePath = (directory: string, baseName: string, extension: string) => {
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = window.api.path.join(directory, `${baseName}${suffix}.${extension}`)
    if (!window.api.fs.existsSync(candidate)) return candidate
    index += 1
  }
}

const getUniqueArchiveFileName = (usedNames: Set<string>, baseName: string, extension: string) => {
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = `${baseName}${suffix}.${extension}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
    index += 1
  }
}

const waitForImages = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        image.onload = () => resolve()
        image.onerror = () => resolve()
      })
    })
  )
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const createNoteImageElement = (note: Note, options: { capture?: boolean } = {}) => {
  const shell = document.createElement('article')
  shell.className = options.capture
    ? 'note-export-image-card note-export-image-card--capture'
    : 'note-export-image-card'
  shell.style.width = `${Math.max(320, Math.min(2000, imageWidth.value || 600))}px`

  if (normalizedCustomCss.value) {
    const style = document.createElement('style')
    style.textContent = normalizedCustomCss.value
    shell.appendChild(style)
  }

  if (includeTitle.value) {
    const title = document.createElement('h1')
    title.className = 'note-export-image-title'
    title.textContent = note.title || '未命名笔记'

    const meta = document.createElement('div')
    meta.className = 'note-export-image-meta'
    meta.textContent = `${getFolderPathText(note.folderId)} · ${formatTime(new Date(note.updatedAt || note.createdAt).getTime())}`

    const divider = document.createElement('div')
    divider.className = 'note-export-image-divider'
    shell.append(title, meta, divider)
  }

  const content = document.createElement('div')
  content.className = 'note-export-image-content'
  content.innerHTML = note.content || '<p>无内容</p>'
  shell.append(content)
  return shell
}

const createCombinedNoteImageElement = (notes: Note[]) => {
  const stack = document.createElement('div')
  stack.className = 'note-export-image-stack note-export-image-stack--capture'
  stack.style.width = `${Math.max(320, Math.min(2000, imageWidth.value || 600))}px`

  notes.forEach((note) => {
    stack.appendChild(createNoteImageElement(note))
  })

  return stack
}

const getTextFromHtml = (html: string) => {
  const root = document.createElement('div')
  root.innerHTML = html || ''

  const collect = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (!(node instanceof HTMLElement)) {
      return Array.from(node.childNodes).map(collect).join('')
    }

    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return '\n'
    if (tag === 'img') {
      const image = node as HTMLImageElement
      return image.alt ? `[图片：${image.alt}]` : '[图片]'
    }
    if (tag === 'li') return `- ${Array.from(node.childNodes).map(collect).join('').trim()}\n`
    if (tag === 'tr') {
      return `${Array.from(node.children)
        .map((child) => collect(child).trim())
        .join('\t')}\n`
    }
    if (tag === 'pre') return `${node.textContent || ''}\n\n`

    const content = Array.from(node.childNodes).map(collect).join('')
    if (['p', 'div', 'section', 'article', 'blockquote', 'ul', 'ol', 'table'].includes(tag)) {
      return `${content.trim()}\n\n`
    }
    if (/^h[1-6]$/.test(tag)) return `${content.trim()}\n\n`
    return content
  }

  return collect(root)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const buildNoteText = (note: Note) => {
  const parts: string[] = []
  if (includeTitle.value) {
    const title = note.title || '未命名笔记'
    parts.push(textExtension.value === 'md' ? `# ${title}` : title)
  }
  parts.push(getTextFromHtml(note.content) || '无内容')
  return parts.filter(Boolean).join('\n\n')
}

const textPreview = computed(() => {
  if (!previewNote.value) return ''
  return buildNoteText(previewNote.value)
})

const exportText = async () => {
  if (selectedNotes.value.length === 0) {
    messageApi.warning('请选择要导出的笔记')
    return
  }

  if (textOutputMode.value === 'multiple') {
    const firstNote = selectedNotes.value[0]!
    const defaultPath = window.api.path.join(
      getDownloadsPath(),
      `${sanitizeFileName(firstNote.title)}.zip`
    )
    const result = await window.api.showSaveDialog({
      title: '导出文本压缩包',
      defaultPath,
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePath) return

    const zip = new JSZip()
    const usedNames = new Set<string>()
    for (const note of selectedNotes.value) {
      const fileName = getUniqueArchiveFileName(
        usedNames,
        sanitizeFileName(note.title),
        textExtension.value
      )
      zip.file(fileName, buildNoteText(note))
    }

    const content = await zip.generateAsync({ type: 'uint8array' })
    window.api.fs.writeFileSync(ensureExtension(result.filePath, 'zip'), content)
    messageApi.success(`已导出 ${selectedNotes.value.length} 个文本文件到 ZIP`)
    props.onClose?.()
    return
  }

  const firstNote = selectedNotes.value[0]!
  const defaultPath = window.api.path.join(
    getDownloadsPath(),
    `${sanitizeFileName(firstNote.title)}.${textExtension.value}`
  )
  const result = await window.api.showSaveDialog({
    title: '导出文本',
    defaultPath,
    filters: [
      textExtension.value === 'md'
        ? { name: 'Markdown', extensions: ['md'] }
        : { name: 'Text', extensions: ['txt'] }
    ]
  })

  if (result.canceled || !result.filePath) return

  const content = selectedNotes.value.map(buildNoteText).join('\n\n---\n\n')
  window.api.fs.writeFileSync(
    ensureExtension(result.filePath, textExtension.value),
    content,
    'utf-8'
  )
  messageApi.success('已导出文本')
  props.onClose?.()
}

const exportOneImage = async (note: Note, filePath: string) => {
  const element = createNoteImageElement(note, { capture: true })
  document.body.appendChild(element)

  try {
    await document.fonts?.ready
    await waitForImages(element)
    return await saveElementImageToFile(element, filePath, {
      backgroundColor: '#ffffff',
      width: element.scrollWidth
    })
  } finally {
    element.remove()
  }
}

const handleCopyImageToClipboard = async () => {
  if (activeFormat.value !== 'image' || isCopyingImage.value) return
  if (selectedNotes.value.length === 0) {
    messageApi.warning('请选择要复制的笔记')
    return
  }

  isCopyingImage.value = true
  const closeLoading = messageApi.loading(
    selectedNotes.value.length > 1 ? '正在拼接并复制长图...' : '正在复制图片...'
  )
  const waitMs = Math.max(0, Number(imageWaitSeconds.value || 0)) * 1000
  const element = createCombinedNoteImageElement(selectedNotes.value)
  document.body.appendChild(element)

  try {
    if (waitMs > 0) await delay(waitMs)
    await document.fonts?.ready
    await waitForImages(element)

    const copied = await copyElementImageToClipboard(element, {
      backgroundColor: '#ffffff',
      width: element.scrollWidth
    })

    if (!copied) throw new Error('复制图片失败')
    messageApi.success(
      selectedNotes.value.length > 1
        ? `已复制 ${selectedNotes.value.length} 篇笔记拼接长图`
        : '已复制图片到剪贴板'
    )
  } catch (error) {
    console.error('复制图片到剪贴板失败:', error)
    messageApi.error((error as Error)?.message || '复制图片失败')
  } finally {
    element.remove()
    closeLoading()
    isCopyingImage.value = false
  }
}

const exportImages = async () => {
  if (selectedNotes.value.length === 0) {
    messageApi.warning('请选择要导出的笔记')
    return
  }

  const waitMs = Math.max(0, Number(imageWaitSeconds.value || 0)) * 1000

  if (selectedNotes.value.length === 1) {
    const note = selectedNotes.value[0]!
    const defaultPath = window.api.path.join(
      getDownloadsPath(),
      `${sanitizeFileName(note.title)}.png`
    )
    const result = await window.api.showSaveDialog({
      title: '导出图片',
      defaultPath,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })

    if (result.canceled || !result.filePath) return
    if (waitMs > 0) await delay(waitMs)

    const ok = await exportOneImage(note, ensureExtension(result.filePath, 'png'))
    if (!ok) throw new Error('导出图片失败')
    messageApi.success('已导出图片')
    props.onClose?.()
    return
  }

  const directoryResult = await window.api.showOpenDialog({
    title: '选择图片导出文件夹',
    properties: ['openDirectory', 'createDirectory']
  })

  if (directoryResult.canceled || !directoryResult.filePaths?.[0]) return
  if (waitMs > 0) await delay(waitMs)

  const directory = directoryResult.filePaths[0]
  for (const note of selectedNotes.value) {
    const filePath = getUniquePath(directory, sanitizeFileName(note.title), 'png')
    const ok = await exportOneImage(note, filePath)
    if (!ok) throw new Error(`导出图片失败：${note.title}`)
  }

  messageApi.success(`已导出 ${selectedNotes.value.length} 张图片`)
  props.onClose?.()
}

const handleExport = async () => {
  if (isExporting.value) return

  isExporting.value = true
  const closeLoading = messageApi.loading('正在导出...')

  try {
    if (activeFormat.value === 'image') {
      await exportImages()
      return
    }

    if (activeFormat.value === 'text') {
      await exportText()
    }
  } catch (error) {
    console.error('导出失败:', error)
    messageApi.error((error as Error)?.message || '导出失败')
  } finally {
    closeLoading()
    isExporting.value = false
  }
}
</script>

<template>
  <div class="note-export-dialog">
    <div class="export-tabs">
      <button
        v-for="tab in formatTabs"
        :key="tab.key"
        class="export-tab"
        :class="{ active: activeFormat === tab.key, disabled: tab.disabled }"
        type="button"
        @click="setActiveFormat(tab)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="export-main">
      <aside class="export-selection">
        <List
          :title="selectedCountText"
          :items="noteListItems"
          :is-selected="(item) => isNoteSelected(item.id)"
          key-field="id"
          main-field="title"
          logo-field="icon"
          empty-text="暂无可导出的笔记"
          @select="toggleNoteSelection"
        >
          <template #title-tool>
            <Checkbox
              :model-value="allSelected"
              :indeterminate="hasSelectedNotes && !allSelected"
              @update:model-value="setAllNotesSelected"
            />
          </template>

          <template #actions="{ item }">
            <Checkbox
              :model-value="isNoteSelected(item.id)"
              @update:model-value="(checked) => setNoteSelected(item.id, checked)"
            />
          </template>
        </List>
      </aside>

      <section class="export-settings">
        <div class="panel-heading">设置</div>
        <SettingsForm class="settings-form" :fields="baseSettingsFields" />

        <template v-if="activeFormat === 'image'">
          <FormItem label="宽度" size="sm">
            <div class="inline-input">
              <Input v-model="imageWidth" type="number" size="sm" />
              <span>像素</span>
            </div>
          </FormItem>

          <FormItem label="等待" size="sm">
            <div class="inline-input">
              <Input v-model="imageWaitSeconds" type="number" size="sm" />
              <span>秒</span>
            </div>
          </FormItem>

          <FormItem label="CSS 预设" size="sm">
            <div class="css-preset-controls">
              <Select
                v-model="selectedCssPresetId"
                :options="cssPresetOptions"
                placeholder="未选择预设"
                size="sm"
              />
              <Button
                size="sm"
                variant="icon"
                title="管理 CSS 预设"
                @click="openCssPresetManager"
              >
                <Settings />
              </Button>
            </div>
          </FormItem>
          <SettingsForm class="settings-form" :fields="imageStyleSettingsFields" />
        </template>

        <SettingsForm v-else class="settings-form" :fields="textSettingsFields" />
      </section>

      <section class="export-preview">
        <div class="panel-heading">预览（仅供参考）</div>

        <div v-if="!previewNote" class="preview-empty">
          <File />
          <span>请选择笔记</span>
        </div>

        <div v-else-if="activeFormat === 'image'" class="image-preview">
          <article
            ref="previewArticleRef"
            class="note-export-image-card"
            :style="{ width: `${Math.max(320, Math.min(2000, imageWidth || 600))}px` }"
          >
            <template v-if="includeTitle">
              <h1 class="note-export-image-title">{{ previewNote.title || '未命名笔记' }}</h1>
              <div class="note-export-image-meta">
                {{ getFolderPathText(previewNote.folderId) }} ·
                {{ formatTime(new Date(previewNote.updatedAt || previewNote.createdAt).getTime()) }}
              </div>
              <div class="note-export-image-divider"></div>
            </template>
            <div
              class="note-export-image-content"
              v-html="previewNote.content || '<p>无内容</p>'"
            ></div>
          </article>
        </div>

        <div v-else class="text-preview">
          <div class="text-preview-title">
            <Document />
            <span>{{ previewNote.title || '未命名笔记' }}</span>
          </div>
          <pre>{{ textPreview }}</pre>
        </div>
      </section>
    </div>

    <div class="export-footer">
      <Button
        v-if="activeFormat === 'image'"
        class="footer-copy-button"
        variant="secondary"
        :loading="isCopyingImage"
        :disabled="!previewNote"
        @click="handleCopyImageToClipboard"
      >
        <template #icon>
          <Copy />
        </template>
        复制图片到剪贴板
      </Button>
      <Button variant="secondary" @click="props.onClose?.()">取消</Button>
      <Button :loading="isExporting" :disabled="selectedNotes.length === 0" @click="handleExport">
        <template #icon>
          <Download />
        </template>
        导出
      </Button>
    </div>
  </div>
</template>

<style scoped>
.note-export-dialog {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-card);
}

.export-tabs {
  display: flex;
  justify-content: center;
  padding: 10px 16px 4px;
  border-bottom: 1px solid var(--border-color);
}

.export-tab {
  min-width: 64px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-left: 0;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.export-tab:first-child {
  border-left: 1px solid var(--border-color);
}

.export-tab.active {
  border-color: var(--accent-color);
  background: var(--accent-color);
  color: var(--accent-text);
}

.export-tab.disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.export-main {
  display: grid;
  grid-template-columns: 226px 224px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.export-selection,
.export-settings,
.export-preview {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--border-color);
}

.export-preview {
  border-right: 0;
}

.export-selection :deep(.list-container) {
  background: transparent;
}

.export-selection :deep(.list-title) {
  height: 34px;
  margin: 0;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  font-weight: 500;
}

.export-selection :deep(.list-scroll-area) {
  padding: 8px 8px 16px;
}

.export-selection :deep(.list-item) {
  height: 32px;
  margin-bottom: 2px;
  padding: 0 8px;
  gap: 8px;
}

.export-selection :deep(.item-media) {
  color: var(--text-tertiary);
}

.export-selection :deep(.item-actions) {
  padding-left: 4px;
}

.export-settings {
  padding: 0 10px;
  overflow: auto;
}

.settings-form {
  margin-top: 10px;
}

.panel-heading {
  height: 34px;
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  font-size: 13px;
  border-bottom: 1px solid var(--border-subtle);
}

.inline-input {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-weight: 400;
}

.inline-input :deep(.input-wrapper) {
  width: 72px;
}

.css-preset-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.css-preset-controls :deep(.select-wrapper) {
  flex: 1;
  min-width: 0;
}

.export-preview {
  display: flex;
  flex-direction: column;
  padding: 0 10px;
  overflow: hidden;
}

.preview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 13px;
}

:global(.css-preset-manager) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

:global(.css-preset-manager-grid) {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

:global(.css-preset-manager-sidebar),
:global(.css-preset-manager-editor) {
  min-width: 0;
}

:global(.css-preset-manager-label) {
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

:global(.css-preset-manager-css-label) {
  margin-top: 12px;
}

:global(.css-preset-manager-list) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 338px;
  margin-top: 10px;
  overflow: auto;
}

:global(.css-preset-manager-item) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

:global(.css-preset-manager-item:hover) {
  background: var(--bg-hover);
}

:global(.css-preset-manager-item.active) {
  background: var(--bg-active);
  color: var(--accent-color);
}

:global(.css-preset-manager-item-name) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.css-preset-manager-badge) {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-size: 11px;
}

:global(.css-preset-manager-badge.builtin) {
  color: var(--accent-color);
}

:global(.css-preset-manager-textarea) {
  min-height: 300px;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

:global(.css-preset-manager-actions) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}

.image-preview,
.text-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px 10px 32px;
  background: var(--bg-secondary);
}

.image-preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.image-preview .note-export-image-card {
  max-width: 100%;
  position: static;
  transform-origin: top center;
  box-shadow: none;
}

.text-preview-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.text-preview pre {
  min-height: 100%;
  margin: 0;
  padding: 18px;
  border: 1px solid var(--border-color);
  background: #ffffff;
  color: #111827;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 16px;
  line-height: 1.65;
}

.export-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 8px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.footer-copy-button {
  margin-right: auto;
}

:global(.note-export-image-card) {
  width: 600px;
  padding: 44px 52px;
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #e5e7eb;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.75;
  box-sizing: border-box;
}

:global(.note-export-image-card--capture) {
  position: fixed;
  left: -10000px;
  top: 0;
}

:global(.note-export-image-stack) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: #ffffff;
}

:global(.note-export-image-stack--capture) {
  position: fixed;
  left: -10000px;
  top: 0;
}

:global(.note-export-image-stack .note-export-image-card) {
  width: 100%;
  border-width: 0 0 1px;
  box-shadow: none;
}

:global(.note-export-image-stack .note-export-image-card:last-child) {
  border-bottom: 0;
}

:global(.note-export-image-title) {
  margin: 0;
  color: #111827;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

:global(.note-export-image-meta) {
  margin-top: 10px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.5;
}

:global(.note-export-image-divider) {
  height: 1px;
  margin: 26px 0 28px;
  background: #e5e7eb;
}

:global(.note-export-image-content) {
  color: #1f2937;
  font-size: 16px;
  overflow-wrap: anywhere;
}

:global(.note-export-image-content > :first-child) {
  margin-top: 0;
}

:global(.note-export-image-content > :last-child) {
  margin-bottom: 0;
}

:global(.note-export-image-content p) {
  margin: 0 0 16px;
  line-height: 1.85;
}

:global(.note-export-image-content h1),
:global(.note-export-image-content h2),
:global(.note-export-image-content h3) {
  margin: 28px 0 14px;
  color: #111827;
  line-height: 1.45;
  letter-spacing: 0;
}

:global(.note-export-image-content h1) {
  font-size: 26px;
}

:global(.note-export-image-content h2) {
  font-size: 23px;
}

:global(.note-export-image-content h3) {
  font-size: 20px;
}

:global(.note-export-image-content ul),
:global(.note-export-image-content ol) {
  margin: 0 0 16px;
  padding-left: 24px;
}

:global(.note-export-image-content li) {
  margin: 6px 0;
}

:global(.note-export-image-content blockquote) {
  margin: 18px 0;
  padding: 2px 0 2px 16px;
  color: #4b5563;
  border-left: 4px solid #cbd5e1;
}

:global(.note-export-image-content pre) {
  margin: 18px 0;
  padding: 16px;
  overflow: hidden;
  color: #e5e7eb;
  background: #111827;
  border-radius: 8px;
  white-space: pre-wrap;
}

:global(.note-export-image-content code) {
  padding: 2px 5px;
  color: #be123c;
  background: #fff1f2;
  border-radius: 4px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 0.92em;
}

:global(.note-export-image-content pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

:global(.note-export-image-content img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

:global(.note-export-image-content table) {
  width: 100%;
  margin: 18px 0;
  border-collapse: collapse;
}

:global(.note-export-image-content th),
:global(.note-export-image-content td) {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  text-align: left;
}

:global(.note-export-image-content th) {
  background: #f3f4f6;
  font-weight: 700;
}
</style>
