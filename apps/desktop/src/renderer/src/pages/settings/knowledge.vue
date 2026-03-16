<script setup lang="tsx">
import { h } from 'vue'
import { FormItem } from '@renderer/composables/useForm'
const { knowledgeBases } = storeToRefs(useKnowledgeStore())
const {
  updateKnowledgeBase,
  addKnowledgeBase,
  deleteKnowledgeBase,
  addDocumentsToKnowledgeBase,
  deleteDocumentsFromKnowledgeBase
} = useKnowledgeStore()

const { Plus, Search, Trash, File, Refresh, Stop, Play, Settings, Folder, ArrowLeft, ChevronRight } = useIcon([
  'Stop',
  'Plus',
  'Search',
  'Trash',
  'File',
  'Refresh',
  'Play',
  'Settings',
  'Folder',
  'ArrowLeft',
  'ChevronRight'
])
const { confirm } = useModal()
const { showContextMenu } = useContextMenu<KnowledgeBase>()

const setActiveKnowledgeBase = (knowledgeBaseId: string) => {
  activeKnowledgeBaseId.value = knowledgeBaseId
  const knowledgeBase = knowledgeBases.value.find((kb) => kb.id === knowledgeBaseId)
  if (knowledgeBase) {
    formActions.setData(knowledgeBase)
  }
}
const activeKnowledgeBaseId = useLocalStorage<string>('activeKnowledgeBaseId', '')
const isEditMode = ref(false)
const batchSize = useLocalStorage<number>('embeddingBatchSize', 5)
const concurrency = useLocalStorage<number>('embeddingConcurrency', 5)
const [BatchSettingsForm, batchSettingsActions] = useForm<{ batchSize: number; concurrency: number }>({
  showHeader: false,
  initialData: {
    batchSize: 5,
    concurrency: 5
  },
  fields: [
    {
      name: 'batchSize',
      type: 'slider',
      label: '批处理大小',
      min: 1,
      max: 100,
      step: 1,
      unlimited: true,
      hint: '设置文档嵌入处理的批处理大小'
    },
    {
      name: 'concurrency',
      type: 'slider',
      label: '并发限制',
      min: 1,
      max: 10,
      step: 1,
      hint: '设置同时进行的文档嵌入任务数量'
    }
  ],
  onSubmit: (data) => {
    batchSize.value = data.batchSize
    concurrency.value = data.concurrency
    showBatchSettings.value = false
  }
})

batchSettingsActions.setData({ batchSize: batchSize.value, concurrency: concurrency.value })

watch(
  () => activeKnowledgeBaseId.value,
  (v) => {
    if (!v) {
      activeKnowledgeBaseId.value = knowledgeBases.value[0].id
      return
    }
    currentFolderPath.value = ''
    searchKeyword.value = ''
  }
)
const activeKnowledgeBase = computed<KnowledgeBase>(() => {
  return knowledgeBases.value.find((kb) => kb.id === activeKnowledgeBaseId.value)!
})

const showSearch = ref(false)
const searchKeyword = ref('')
const showBatchSettings = ref(false)
const currentFolderPath = ref('')
const folderTaskStops = ref<Record<string, () => void>>({})

type KnowledgeFolderRow = {
  id: string
  rowType: 'folder'
  name: string
  path: string
  type: 'folder'
  size: number
  created: number
  itemCount: number
  processedCount: number
  processingCount: number
  errorCount: number
  abortedCount: number
}

type KnowledgeDocumentRow = KnowledgeDocument & {
  rowType: 'document'
}

type KnowledgeListRow = KnowledgeFolderRow | KnowledgeDocumentRow

const normalizeRelativePath = (path?: string) => (path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

const getDocumentRelativePath = (doc: KnowledgeDocument) =>
  normalizeRelativePath(doc.metadata?.relativePath || doc.name)

const getDocumentFolderPath = (doc: KnowledgeDocument) => {
  if (!doc.metadata?.relativePath) return ''
  const segments = getDocumentRelativePath(doc).split('/').filter(Boolean)
  return segments.slice(0, -1).join('/')
}

const isDocumentInFolder = (doc: KnowledgeDocument, folderPath: string) => getDocumentFolderPath(doc) === folderPath

const isDocumentUnderFolder = (doc: KnowledgeDocument, folderPath: string) => {
  const docFolderPath = getDocumentFolderPath(doc)
  if (!folderPath) return true
  return docFolderPath === folderPath || docFolderPath.startsWith(`${folderPath}/`)
}

const getDocumentsInFolder = (folderPath: string) => {
  const documents = activeKnowledgeBase.value?.documents || []
  return documents.filter((doc) => isDocumentUnderFolder(doc, folderPath))
}

const getKnowledgeDocumentById = (documentId: string) => {
  return activeKnowledgeBase.value?.documents?.find((doc) => doc.id === documentId)
}

const matchedDocuments = computed(() => {
  const documents = activeKnowledgeBase.value?.documents || []
  if (!searchKeyword.value) return documents
  const lower = searchKeyword.value.toLowerCase()
  return documents.filter(
    (doc) =>
      doc.name.toLowerCase().includes(lower) ||
      doc.path.toLowerCase().includes(lower) ||
      getDocumentRelativePath(doc).toLowerCase().includes(lower)
  )
})

const currentFolderSegments = computed(() =>
  currentFolderPath.value.split('/').filter(Boolean)
)

const breadcrumbItems = computed(() => {
  const items = [{ label: '全部文件', path: '' }]
  let cumulativePath = ''
  for (const segment of currentFolderSegments.value) {
    cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment
    items.push({
      label: segment,
      path: cumulativePath
    })
  }
  return items
})

const currentFolderRows = computed<KnowledgeListRow[]>(() => {
  const documents = matchedDocuments.value.filter((doc) => isDocumentUnderFolder(doc, currentFolderPath.value))
  const folderMap = new Map<string, KnowledgeFolderRow>()

  for (const doc of documents) {
    const docFolderPath = getDocumentFolderPath(doc)
    const relativeFolderPath = currentFolderPath.value
      ? docFolderPath.slice(currentFolderPath.value.length).replace(/^\/+/, '')
      : docFolderPath

    const nextSegment = relativeFolderPath.split('/').filter(Boolean)[0]
    if (nextSegment) {
      const folderPath = currentFolderPath.value ? `${currentFolderPath.value}/${nextSegment}` : nextSegment
      const existing = folderMap.get(folderPath)
      if (existing) {
        existing.itemCount += 1
      } else {
        folderMap.set(folderPath, {
          id: `folder:${folderPath}`,
          rowType: 'folder',
          name: nextSegment,
          path: folderPath,
          type: 'folder',
          size: 0,
          created: 0,
          itemCount: 1,
          processedCount: 0,
          processingCount: 0,
          errorCount: 0,
          abortedCount: 0
        })
      }

      const targetFolder = folderMap.get(folderPath)
      if (targetFolder) {
        if (doc.status === 'processed') {
          targetFolder.processedCount += 1
        } else if (doc.status === 'processing') {
          targetFolder.processingCount += 1
        } else if (doc.status === 'error') {
          targetFolder.errorCount += 1
        } else if (doc.status === 'aborted') {
          targetFolder.abortedCount += 1
        }
      }
    }
  }

  const folderRows = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  const documentRows = documents
    .filter((doc) => isDocumentInFolder(doc, currentFolderPath.value))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((doc) => ({
      ...doc,
      rowType: 'document' as const
    }))

  return [...folderRows, ...documentRows]
})

const [KnowledgeBaseForm, formActions] = useForm<
  Pick<
    KnowledgeBase,
    'name' | 'description' | 'embeddingModel' | 'retrieveConfig' | 'rerankModel' | 'embeddingConfig'
  >
>({
  showHeader: true,
  initialData: {
    name: '',
    description: '',
    embeddingModel: {
      modelId: '',
      providerId: ''
    },
    rerankModel: {
      modelId: '',
      providerId: ''
    },
    retrieveConfig: {
      similarityThreshold: 0.2,
      topK: 5,
      rerankScoreThreshold: 0.3
    },
    embeddingConfig: {
      chunkSize: 1000,
      chunkOverlap: 200
    }
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: '知识库名称',
      required: true
    },
    {
      name: 'description',
      type: 'textarea',
      label: '描述（可选）',
      placeholder: '描述此知识库的用途和内容'
    },
    {
      name: 'embeddingModel',
      type: 'modelSelector',
      label: '嵌入模型',
      modelCategory: 'embedding'
    },
    {
      name: 'embeddingConfig.chunkSize',
      type: 'slider',
      label: '文档快大小',
      min: 1,
      max: 1000,
      step: 1,
      hint: '设置文档块的大小'
    },
    {
      name: 'embeddingConfig.chunkOverlap',
      type: 'slider',
      label: 'Chunk Overlap',
      min: 0,
      max: 1000,
      step: 1,
      hint: '设置文档块的重叠大小'
    },
    {
      name: 'rerankModel',
      type: 'modelSelector',
      label: '重排模型（可选）',
      modelCategory: 'rerank'
    },
    {
      name: 'retrieveConfig.similarityThreshold',
      type: 'slider',
      label: '相似度阈值',
      min: 0,
      max: 1,
      step: 0.1,
      hint: '设置检索时的最小相似度阈值，高于此值的文档块会被返回'
    },
    {
      name: 'retrieveConfig.topK',
      type: 'slider',
      label: 'Top K',
      min: 1,
      max: 20,
      step: 1,
      hint: '设置返回的最相关文档块数量'
    },
    {
      name: 'retrieveConfig.rerankScoreThreshold',
      type: 'slider',
      label: '重排得分阈值',
      min: 0,
      max: 1,
      step: 0.1,
      hint: '设置重排后的最小得分阈值',
      ifShow: (data) => !!data.rerankModel?.modelId
    }
  ],
  onSubmit: (data) => {
    if (isEditMode.value && activeKnowledgeBaseId.value && activeKnowledgeBase.value) {
      const updatedKnowledgeBase: KnowledgeBase = {
        ...activeKnowledgeBase.value,
        ...data
      }
      updateKnowledgeBase(activeKnowledgeBaseId.value, updatedKnowledgeBase)
    } else {
      const newKnowledgeBase: KnowledgeBase = {
        ...data,
        id: `kb_${nanoid()}`,
        active: false,
        created: Date.now(),
        documents: []
      }
      addKnowledgeBase(newKnowledgeBase)
      setActiveKnowledgeBase(newKnowledgeBase.id)
    }
  }
})

import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()

const isDetailResult = computed(() => {
  return !!route.params.id
})

const selectKnowledgeBase = (knowledgeBaseId: string) => {
  setActiveKnowledgeBase(knowledgeBaseId)
  if (isMobile.value) {
    router.push(`/mobile/settings/knowledge/${knowledgeBaseId}`)
  }
}
const handleKnowledgeBaseContextMenu = (event: MouseEvent, knowledgeBase: KnowledgeBase) => {
  showContextMenu(event, [
    {
      label: '编辑知识库',
      icon: File,
      onClick: () => {
        setActiveKnowledgeBase(knowledgeBase.id)
        showEditKnowledgeBaseModal()
      }
    },
    {
      label: '删除知识库',
      danger: true,
      icon: Trash,
      onClick: () => {
        setActiveKnowledgeBase(knowledgeBase.id)
        showDeleteKnowledgeBaseModal()
      },
      ifShow: () => {
        return knowledgeBase.id !== 'default-local'
      }
    }
  ])
}

const loading = ref(false)

const abortKnowledgeDocument = (doc: KnowledgeDocument) => {
  doc.cancelRequested = true
  doc.status = 'aborted'
  doc.abortController?.abort()
}

const stopFolderTasksForDocuments = (documents: KnowledgeDocument[]) => {
  const folderPaths = new Set(
    documents
      .map((doc) => getDocumentFolderPath(doc))
      .filter((folderPath) => Boolean(folderPath) && Boolean(folderTaskStops.value[folderPath]))
  )

  if (!folderPaths.size) return

  const nextStops = { ...folderTaskStops.value }
  for (const folderPath of folderPaths) {
    nextStops[folderPath]?.()
    delete nextStops[folderPath]
  }
  folderTaskStops.value = nextStops
  if (Object.keys(folderTaskStops.value).length === 0) {
    loading.value = false
  }
}

const showAddKnowledgeBaseModal = async () => {
  formActions.reset()
  isEditMode.value = false
  const result = await confirm({
    title: '添加知识库',
    content: KnowledgeBaseForm
  })
  if (result) {
    formActions.submit()
  }
}

const showEditKnowledgeBaseModal = async () => {
  if (!activeKnowledgeBase.value) {
    return
  }
  // 确保retrieveConfig有默认值
  const knowledgeBaseData = {
    ...activeKnowledgeBase.value,
    rerankModel: activeKnowledgeBase.value.rerankModel || { modelId: '', providerId: '' },
    retrieveConfig: {
      similarityThreshold: 0.2,
      topK: 5,
      rerankScoreThreshold: 0.3,
      ...activeKnowledgeBase.value.retrieveConfig
    }
  }
  formActions.setData(knowledgeBaseData)
  isEditMode.value = true
  const result = await confirm({
    title: '编辑知识库',
    content: KnowledgeBaseForm,
    width: '800px'
  })
  if (result) {
    formActions.submit()
  }
}

const showDeleteKnowledgeBaseModal = async () => {
  if (!activeKnowledgeBase.value) {
    return
  }
  const result = await confirm({
    title: '删除知识库',
    confirmProps: {
      danger: true
    },
    content: `确定要删除知识库 "${activeKnowledgeBase.value.name}" 吗？此操作不可撤销。`
  })
  if (result) {
    Object.values(folderTaskStops.value).forEach((stop) => stop())
    folderTaskStops.value = {}
    deleteKnowledgeBase(activeKnowledgeBaseId.value)
    if (knowledgeBases.value.length > 0) {
      setActiveKnowledgeBase(knowledgeBases.value[0].id)
    }
  }
}

const showDeleteDocumentModal = async (document: KnowledgeDocument) => {
  const result = await confirm({
    title: '删除文档',
    content: `确定要删除文档 "${document.name}" 吗？`,
    confirmProps: {
      danger: true
    }
  })
  if (result) {
    stopFolderTasksForDocuments([document])
    deleteDocumentsFromKnowledgeBase(activeKnowledgeBaseId.value, [document.id])
  }
}

const showDeleteFolderModal = async (folder: KnowledgeFolderRow) => {
  const folderDocuments = getDocumentsInFolder(folder.path)
  if (folderDocuments.length === 0) return

  const result = await confirm({
    title: '删除文件夹',
    content: `确定要删除文件夹 "${folder.name}" 及其下 ${folderDocuments.length} 个文档吗？`,
    confirmProps: {
      danger: true
    }
  })

  if (result) {
    stopFolderTasksForDocuments(folderDocuments)
    deleteDocumentsFromKnowledgeBase(
      activeKnowledgeBaseId.value,
      folderDocuments.map((doc) => doc.id)
    )

    if (currentFolderPath.value === folder.path) {
      navigateUpFolder()
    }
  }
}

const runFolderEmbedding = async (folder: KnowledgeFolderRow, continueFlag: boolean) => {
  folderTaskStops.value[folder.path]?.()

  const folderDocuments = getDocumentsInFolder(folder.path).filter((doc) =>
    continueFlag ? doc.status !== 'processed' : true
  )

  if (folderDocuments.length === 0) return

  const docChunks = chunk(folderDocuments, 20)
  const { start, stop, done } = useIdleChunkAsync(docChunks, async (docChunk) => {
    await Promise.all(
      docChunk.map(async (doc) => {
        await embedding(doc, activeKnowledgeBase.value, continueFlag, batchSize.value, {
          input_type: 'passage'
        })
      })
    )
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  folderTaskStops.value = {
    ...folderTaskStops.value,
    [folder.path]: () => {
      stop()
      getDocumentsInFolder(folder.path).forEach((doc) => {
        abortKnowledgeDocument(doc)
      })
    }
  }

  watch(done, (v) => {
    if (v) {
      const nextStops = { ...folderTaskStops.value }
      delete nextStops[folder.path]
      folderTaskStops.value = nextStops
    }
  }, { once: true })

  start()
}

const stopFolderEmbedding = (folder: KnowledgeFolderRow) => {
  folderTaskStops.value[folder.path]?.()
  const nextStops = { ...folderTaskStops.value }
  delete nextStops[folder.path]
  folderTaskStops.value = nextStops
  getDocumentsInFolder(folder.path).forEach((doc) => {
    abortKnowledgeDocument(doc)
  })
}

const selectedDocumentIds = computed(() => {
  const selectedKeys = new Set(docTableActions.getSelectedKeys())
  return currentFolderRows.value
    .filter((row): row is KnowledgeDocumentRow => row.rowType === 'document' && selectedKeys.has(row.id))
    .map((row) => row.id)
})

const selectedDocCount = computed(() => selectedDocumentIds.value.length)

const showBatchDeleteModal = async () => {
  const selectedKeys = selectedDocumentIds.value
  if (selectedKeys.length === 0) return

  const result = await confirm({
    title: '批量删除文档',
    content: `确定要删除选中的 ${selectedKeys.length} 个文档吗？此操作不可撤销。`,
    confirmProps: {
      danger: true
    }
  })
  if (result) {
    const selectedDocuments = currentFolderRows.value.filter(
      (row): row is KnowledgeDocumentRow => row.rowType === 'document' && selectedKeys.includes(row.id)
    )
    stopFolderTasksForDocuments(selectedDocuments)
    loading.value = true
    const idChunks = chunk(selectedKeys as string[], 50)
    const { start, done } = useIdleChunkAsync(idChunks, async (idChunk) => {
      deleteDocumentsFromKnowledgeBase(activeKnowledgeBaseId.value, idChunk)
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    watch(done, (v) => {
      if (v) {
        docTableActions.clearSelection()
        loading.value = false
      }
    })

    start()
  }
}
const { triggerUpload, triggerFolderUpload, clearSeletedFiles, uploadLoading } = useUpload({
  onlyText: true,
  onFilesSelected: async (files) => {
    const fileChunks = chunk(files, 50)
    const { start, done } = useIdleChunkAsync(fileChunks, async (fileChunk) => {
      const docs: KnowledgeDocument[] = []
      fileChunk.forEach((f) => {
        const doc: KnowledgeDocument = {
          id: `doc_${nanoid()}`,
          name: f.filename!,
          path: f.path!,
          size: f.size!,
          type: f.mediaType,
          created: Date.now(),
          status: 'pending',
          url: !f.path ? f.url : undefined,
          metadata: {
            modelId: activeKnowledgeBase.value.embeddingModel.modelId,
            providerId: activeKnowledgeBase.value.embeddingModel.providerId,
            chunkSize: activeKnowledgeBase.value.embeddingConfig?.chunkSize,
            chunkOverlap: activeKnowledgeBase.value.embeddingConfig?.chunkOverlap,
            relativePath: f.relativePath
          }
        }
        docs.push(doc)
      })

      addDocumentsToKnowledgeBase(activeKnowledgeBaseId.value, docs)
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    watch(done, (v) => {
      if (v) {
        clearSeletedFiles()
      }
    })

    start()
  }
})
const addDocument = () => {
  triggerUpload(true)
}
const addFolder = () => {
  triggerFolderUpload()
}
const searchInputRef = useTemplateRef('searchInputRef')
const handleShowSearch = async () => {
  showSearch.value = true
  await nextTick()
  searchInputRef.value?.focus()
}
const { embedding } = useKnowledge()

const handleAbortDocument = (doc: KnowledgeDocument) => {
  abortKnowledgeDocument(doc)
}

const isFolderEmbeddingRunning = (folderPath: string) =>
  Boolean(folderTaskStops.value[folderPath]) ||
  getDocumentsInFolder(folderPath).some((doc) => Boolean(doc.abortController))

const openFolder = (path: string) => {
  window.api.shell.openPath(window.api.url.fileURLToPath(path))
}

const showList = computed(() => !isMobile.value || !isDetailResult.value)
const showForm = computed(() => !isMobile.value || isDetailResult.value)
const openFolderView = (folderPath: string) => {
  currentFolderPath.value = folderPath
}

const navigateToBreadcrumb = (folderPath: string) => {
  currentFolderPath.value = folderPath
}

const navigateUpFolder = () => {
  if (!currentFolderPath.value) return
  const segments = currentFolderSegments.value
  currentFolderPath.value = segments.slice(0, -1).join('/')
}

const [DocTable, docTableActions] = useTable<KnowledgeListRow>({
  loading: () => loading.value,
  data: () => currentFolderRows.value,
  autoHeight: {
    enabled: true,
    bottomOffset: 40, // 距离底部 40px
    minHeight: 300
  },
  virtualScroll: {
    enabled: true,
    itemHeight: 36,
    overscan: 5
  },
  selection: {
    enabled: true,
    key: 'id',
    width: 40
  },
  columns: [
    {
      key: 'name',
      label: '文档名称',
      width: '2fr',
      render: (row) => (
        <div class="file-name-cell">
          <Button
            onClick={() => (row.rowType === 'folder' ? openFolderView(row.path) : openFolder(row.path))}
            variant="text"
            size="sm"
            class="name-text"
          >
            {row.name}
            {row.rowType === 'folder' &&
              h((ChevronRight as any), {
                style: {
                  marginLeft: '4px',
                  opacity: 0.6
                }
              })}
          </Button>
        </div>
      )
    },
    {
      key: 'type',
      label: '类型',
      width: '1fr',
      render: (row) => (row.rowType === 'folder' ? '文件夹' : row.type)
    },
    {
      key: 'size',
      label: '大小',
      width: '1fr',
      render: (row) => (row.rowType === 'folder' ? '-' : formatFileSize(row.size))
    },
    {
      key: 'status',
      label: '状态',
      width: '1fr',
      render: (row) => (
        <div style="display: flex; flex-direction: column; gap: 4px">
          {row.rowType === 'folder'
            ? (
              row.processedCount === row.itemCount && row.itemCount > 0
                ? <Tags color="blue" tags={['成功']} />
                : row.processingCount > 0 || row.processedCount > 0
                  ? <span style="font-size: 12px; color: var(--text-secondary)">{row.processedCount}/{row.itemCount}</span>
                  : row.errorCount > 0
                    ? <Tags color="red" tags={['失败']} />
                    : row.abortedCount > 0
                      ? <Tags color="gray" tags={['已暂停']} />
                      : <Tags color="gray" tags={['未开始']} />
            )
            : row.status === 'processed'
              ? <Tags color="blue" tags={['成功']} />
              : !row.currentChunk && !row.chunks?.length
                ? <Tags color="gray" tags={['未开始']} />
                : (
                  <div style="width: 100%; display: flex; align-items: center; gap: 8px">
                    <div
                      style="
                        flex: 1;
                        height: 4px;
                        background-color: var(--border-color-light);
                        border-radius: 2px;
                        overflow: hidden;
                      "
                    >
                      <div
                        style={{
                          height: '100%',
                          backgroundColor: 'var(--accent-color)',
                          transition: 'width 0.3s ease',
                          width: `${Math.round((row.currentChunk! / (row.chunks?.length || 1)) * 100)}%`
                        }}
                      ></div>
                    </div>
                    <span style="font-size: 12px; color: var(--text-secondary)">
                      {row.currentChunk || 0}/{row.chunks?.length || 0}
                    </span>
                  </div>
                )}
        </div>
      )
    },
    {
      key: 'actions',
      label: '操作',
      width: '1.1fr',
      render: (row) => (
        <div style="display: flex; align-items: center; gap: 8px">
          {row.rowType === 'folder'
            ? (
              <>
                <Button
                  onClick={() => runFolderEmbedding(row, false)}
                  size="sm"
                  type="button"
                  variant="text"
                  title="刷新整个文件夹"
                >
                  {{ icon: () => Refresh }}
                </Button>
                <Button
                  onClick={() => (isFolderEmbeddingRunning(row.path) ? stopFolderEmbedding(row) : runFolderEmbedding(row, true))}
                  size="sm"
                  type="button"
                  variant="text"
                  title={isFolderEmbeddingRunning(row.path) ? '暂停整个文件夹' : '继续处理整个文件夹'}
                >
                  {{ icon: () => (isFolderEmbeddingRunning(row.path) ? Stop : Play) }}
                </Button>
                <Button
                  onClick={() => showDeleteFolderModal(row)}
                  size="sm"
                  type="button"
                  variant="text"
                  title="删除整个文件夹"
                >
                  {{ icon: () => Trash }}
                </Button>
                <Button onClick={() => openFolderView(row.path)} size="sm" type="button" variant="text">
                  {{ icon: () => Folder }}
                </Button>
              </>
            )
            : (
              <>
                {!activeKnowledgeBase.value.embeddingModel.modelId && (
                  <Tags color="red" tags={['未选择嵌入模型']} />
                )}
                {activeKnowledgeBase.value?.embeddingModel?.modelId && (
                  <Button
                    onClick={() => {
                      const doc = getKnowledgeDocumentById(row.id)
                      if (!doc) return
                      embedding(doc, activeKnowledgeBase.value, false, batchSize.value, {
                        input_type: 'passage'
                      })
                    }}
                    size="sm"
                    type="button"
                    variant="text"
                  >
                    {{ icon: () => Refresh }}
                  </Button>
                )}
                {activeKnowledgeBase.value?.embeddingModel?.modelId &&
                  !row.abortController?.abort && row.status !== 'processed' && (
                    <Button
                      onClick={() => {
                        const doc = getKnowledgeDocumentById(row.id)
                        if (!doc) return
                        embedding(doc, activeKnowledgeBase.value, true, batchSize.value, {
                          input_type: 'passage'
                        })
                      }}
                      size="sm"
                      type="button"
                      variant="text"
                    >
                      {{ icon: () => Play }}
                    </Button>
                  )}
                {row.abortController?.abort && (
                  <Button
                    onClick={() => {
                      const doc = getKnowledgeDocumentById(row.id)
                      if (!doc) return
                      handleAbortDocument(doc)
                    }}
                    size="sm"
                    type="button"
                    variant="text"
                  >
                    {{ icon: () => Stop }}
                  </Button>
                )}
                <Button
                  onClick={() => {
                    const doc = getKnowledgeDocumentById(row.id)
                    if (!doc) return
                    showDeleteDocumentModal(doc)
                  }}
                  size="sm"
                  type="button"
                  variant="text"
                >
                  {{ icon: () => Trash }}
                </Button>
              </>
            )}
        </div>
      )
    }
  ]
})
</script>

<template>
  <!-- 列表视图 -->
  <ListContainer v-if="showList" @contextmenu="
    (event, item) =>
      handleKnowledgeBaseContextMenu(event, knowledgeBases.find((kb) => kb.id === item)!)
  ">
    <List title="知识库" :items="knowledgeBases.map((kb) => ({ id: kb.id, name: kb.name }))"
      :active-id="activeKnowledgeBaseId" @select="selectKnowledgeBase" @contextmenu="
        (event, item) =>
          handleKnowledgeBaseContextMenu(event, knowledgeBases.find((kb) => kb.id === item)!)
      ">
      <template #title-tool>
        <Button @click="showAddKnowledgeBaseModal" size="sm" type="button" variant="text">
          <template #icon>
            <component :is="Plus" />
          </template>
        </Button>
      </template>
    </List>
  </ListContainer>

  <!-- 表单视图 -->
  <FormContainer v-if="showForm" header-title="知识库管理">
    <template #content>
      <FormItem label="文档列表">
        <div class="knowledge-folder-toolbar">
          <Button v-if="currentFolderPath" size="sm" type="button" variant="text" @click="navigateUpFolder">
            <template #icon>
              <ArrowLeft />
            </template>
            返回上级
          </Button>
          <div class="knowledge-breadcrumbs">
            <button v-for="item in breadcrumbItems" :key="item.path || 'root'" type="button" class="breadcrumb-button"
              :class="{ active: item.path === currentFolderPath }" @click="navigateToBreadcrumb(item.path)">
              <span>{{ item.label }}</span>
              <ChevronRight v-if="item.path !== currentFolderPath" class="breadcrumb-separator" />
            </button>
          </div>
        </div>
        <DocTable />
        <template #label>
          <div style="display: flex; gap: 4px; align-items: center;">
            <Button :loading="uploadLoading" @click="addDocument" size="sm" type="button" variant="text">
              <template #icon>
                <Plus />
              </template>
              添加文档
            </Button>
            <Button :loading="uploadLoading" @click="addFolder" size="sm" type="button" variant="text">
              <template #icon>
                <Folder />
              </template>
              添加文件夹
            </Button>
            <Button v-if="selectedDocCount > 0" @click="showBatchDeleteModal" size="sm" type="button" variant="text"
              danger>
              <template #icon>
                <Trash />
              </template>
              删除选中({{ selectedDocCount }})
            </Button>
            <div v-if="showSearch">
              <SearchInput ref="searchInputRef" v-model="searchKeyword" placeholder="搜索文档..." size="sm"
                variant="default" :show-icon="true" :debounce="0" @blur="!searchKeyword && (showSearch = false)"
                class="knowledge-search-input" />
            </div>
            <Button v-else type="button" variant="text" size="sm" @click="handleShowSearch">
              <template #icon>
                <Search />
              </template>
            </Button>
            <SelectorPopover @ok="batchSettingsActions.submit()" v-model:visible="showBatchSettings" title="知识库设置"
              width="240px" position="bottom">
              <template #trigger>
                <Button :class="{ active: showBatchSettings }" size="sm" type="button" variant="text">
                  <template #icon>
                    <Settings />
                  </template>
                </Button>
              </template>
              <template #content>
                <div class="popover-header">批处理设置</div>
                <div class="popover-content">
                  <BatchSettingsForm />
                  <div v-if="!isMobile" style="display: flex; justify-content: flex-end; gap: 12px">
                    <Button size="sm" variant="text" @click="showBatchSettings = false">取消</Button>
                    <Button size="sm" variant="primary" @click="batchSettingsActions.submit()">确定</Button>
                  </div>
                </div>
              </template>
            </SelectorPopover>
          </div>
        </template>
      </FormItem>
    </template>
  </FormContainer>
</template>

<style scoped>
.knowledge-folder-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  min-height: 32px;
}

.knowledge-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}

.breadcrumb-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 4px 6px;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
}

.breadcrumb-button.active {
  color: var(--text-primary);
  background: var(--hover-color);
}

.breadcrumb-separator {
  opacity: 0.6;
}

.knowledge-row-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.knowledge-row-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  line-height: 24px;
}

.folder-chevron {
  opacity: 0.6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
}

.popover-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}
</style>
