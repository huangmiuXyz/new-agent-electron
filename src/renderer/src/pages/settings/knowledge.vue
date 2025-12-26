<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
const { knowledgeBases } = storeToRefs(useKnowledgeStore())
const {
  updateKnowledgeBase,
  addKnowledgeBase,
  deleteKnowledgeBase,
  addDocumentToKnowledgeBase,
  deleteDocumentFromKnowledgeBase
} = useKnowledgeStore()

const { Plus, Search, Trash, File, Refresh, Stop, Play, Settings } = useIcon([
  'Stop',
  'Plus',
  'Search',
  'Trash',
  'File',
  'Refresh',
  'Play',
  'Settings'
])
const { confirm } = useModal()
const { showContextMenu } = useContextMenu<KnowledgeBase>()
const { showKnowledgeForm } = useMobile()

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
const [BatchSettingsForm, batchSettingsActions] = useForm<{ batchSize: number }>({
  showHeader: false,
  initialData: {
    batchSize: 5
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
    }
  ],
  onSubmit: (data) => {
    batchSize.value = data.batchSize
    showBatchSettings.value = false
  }
})

batchSettingsActions.setData({ batchSize: batchSize.value })

watch(
  () => activeKnowledgeBaseId.value,
  (v) => {
    if (!v) {
      activeKnowledgeBaseId.value = knowledgeBases.value[0].id
    }
  }
)
const activeKnowledgeBase = computed<KnowledgeBase>(() => {
  return knowledgeBases.value.find((kb) => kb.id === activeKnowledgeBaseId.value)!
})

const showSearch = ref(false)
const searchKeyword = ref('')
const showBatchSettings = ref(false)

const filteredDocuments = computed(() => {
  const documents = activeKnowledgeBase.value?.documents || []
  if (!searchKeyword.value) return documents
  const lower = searchKeyword.value.toLowerCase()
  return documents.filter(
    (doc) => doc.name.toLowerCase().includes(lower) || doc.path.toLowerCase().includes(lower)
  )
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

const selectKnowledgeBase = (knowledgeBaseId: string) => {
  setActiveKnowledgeBase(knowledgeBaseId)
  if (isMobile) {
    showKnowledgeForm.value = true
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
    content: KnowledgeBaseForm
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
    deleteDocumentFromKnowledgeBase(activeKnowledgeBaseId.value, document.id)
  }
}
const { triggerUpload, clearSeletedFiles } = useUpload({
  onFilesSelected: async (files) => {
    const docs: KnowledgeDocument[] = []
    files.forEach((f) => {
      const doc: KnowledgeDocument = {
        id: `doc_${nanoid()}`,
        name: f.filename!,
        path: f.path!,
        size: f.size!,
        type: f.mediaType,
        created: Date.now(),
        status: 'processing',
        url: !f.path ? f.url : undefined
      }
      docs.push(doc)
      addDocumentToKnowledgeBase(activeKnowledgeBaseId.value, doc)
    })
    clearSeletedFiles()
    await nextTick()
    for (const doc of docs) {
      const docInKnowledgeBase = activeKnowledgeBase.value?.documents?.find((d) => d.id === doc.id)
      if (docInKnowledgeBase) {
        if (!activeKnowledgeBase.value.embeddingModel.modelId) return
        await embedding(docInKnowledgeBase, activeKnowledgeBase.value, false, batchSize.value, {
          input_type: 'passage'
        })
      }
    }
  }
})
const addDocument = () => {
  triggerUpload(true)
}
const searchInputRef = useTemplateRef('searchInputRef')
const handleShowSearch = async () => {
  showSearch.value = true
  await nextTick()
  searchInputRef.value?.focus()
}
const { embedding } = useKnowledge()

const handleAbortDocument = (doc: KnowledgeDocument) => {
  doc.abortController?.abort()
}

const openFolder = (path: string) => {
  window.api.shell.openPath(window.api.url.fileURLToPath(path))
}
</script>

<template>
  <!-- 列表视图 -->
  <SettingsListContainer v-if="!isMobile || !showKnowledgeForm">
    <List
      title="知识库"
      :items="knowledgeBases"
      :active-id="activeKnowledgeBaseId"
      @select="selectKnowledgeBase"
      @contextmenu="
        (event, item) =>
          handleKnowledgeBaseContextMenu(event, knowledgeBases.find((kb) => kb.id === item)!)
      "
    >
      <template #title-tool>
        <Button @click="showAddKnowledgeBaseModal" size="sm" type="button" variant="primary">
          <template #icon>
            <Plus />
          </template>
          添加
        </Button>
      </template>
    </List>
  </SettingsListContainer>

  <!-- 表单视图 -->
  <SettingFormContainer v-if="!isMobile || showKnowledgeForm" header-title="知识库管理">
    <template #content>
      <FormItem label="文档列表">
        <Table
          :loading="loading"
          :data="filteredDocuments"
          :columns="[
            { key: 'name', label: '文档名称', width: '2fr' },
            { key: 'type', label: '类型', width: '1fr' },
            { key: 'size', label: '大小', width: '1fr' },
            { key: 'status', label: '状态', width: '1fr' },
            { key: 'actions', label: '操作', width: '1.1fr' }
          ]"
        >
          <template #name="{ row }">
            <div class="file-name-cell">
              <Button @click="openFolder(row.path)" variant="text" size="sm" class="name-text">
                <template #icon>
                  <component
                    :is="
                      useIcon(
                        getFileIcon({
                          name: row.name,
                          mediaType: row.type
                        })
                      )
                    "
                    class="file-icon"
                  />
                </template>
                {{ row.name }}
              </Button>
            </div>
          </template>
          <template #size="props">
            {{ formatFileSize(props.row.size) }}
          </template>
          <template #created="props">
            {{ formatTime(props.row.created) }}
          </template>
          <template #status="props">
            <div style="display: flex; flex-direction: column; gap: 4px">
              <Tags v-if="props.row.status === 'processed'" color="blue" :tags="['成功']" />
              <div v-else style="width: 100%; display: flex; align-items: center; gap: 8px">
                <div
                  style="
                    flex: 1;
                    height: 4px;
                    background-color: #f0f0f0;
                    border-radius: 2px;
                    overflow: hidden;
                  "
                >
                  <div
                    style="height: 100%; background-color: #8b5cf6; transition: width 0.3s ease"
                    :style="{
                      width: `${Math.round((props.row.currentChunk! / (props.row.chunks?.length || 0)) * 100)}%`
                    }"
                  ></div>
                </div>
                <span style="font-size: 12px; color: #666">
                  {{ props.row.currentChunk || 0 }}/{{ props.row.chunks?.length || 0 }}
                </span>
              </div>
            </div>
          </template>
          <template #chunks="props">
            {{ props.row.chunks?.length || 0 }}
          </template>
          <template #actions="props">
            <div style="display: flex; align-items: center; gap: 8px">
              <Tags
                v-if="!activeKnowledgeBase.embeddingModel.modelId"
                color="red"
                :tags="['未选择嵌入模型']"
              />
              <Button
                v-if="activeKnowledgeBase?.embeddingModel?.modelId"
                @click="
                  embedding(props.row, activeKnowledgeBase, false, batchSize, {
                    input_type: 'passage'
                  })
                "
                size="sm"
                type="button"
                variant="text"
              >
                <template #icon>
                  <Refresh />
                </template>
              </Button>
              <Button
                v-if="
                  activeKnowledgeBase?.embeddingModel?.modelId &&
                  !props.row.abortController?.abort &&
                  props.row.status !== 'processed'
                "
                @click="
                  embedding(props.row, activeKnowledgeBase, true, batchSize, {
                    input_type: 'passage'
                  })
                "
                size="sm"
                type="button"
                variant="text"
              >
                <template #icon>
                  <Play />
                </template>
              </Button>
              <Button
                v-if="props.row.status === 'processing' && props.row.abortController?.abort"
                @click="handleAbortDocument(props.row)"
                size="sm"
                type="button"
                variant="text"
              >
                <template #icon>
                  <Stop />
                </template>
              </Button>
              <Button
                @click="showDeleteDocumentModal(props.row)"
                size="sm"
                type="button"
                variant="text"
              >
                <template #icon>
                  <Trash />
                </template>
              </Button>
            </div>
          </template>
        </Table>
        <template #label>
          <div style="display: flex">
            <Button @click="addDocument" size="sm" type="button" variant="text">
              <template #icon>
                <Plus />
              </template>
              添加文档
            </Button>
            <div v-if="showSearch">
              <SearchInput
                ref="searchInputRef"
                v-model="searchKeyword"
                placeholder="搜索文档..."
                size="sm"
                variant="default"
                :show-icon="true"
                :debounce="0"
                @blur="!searchKeyword && (showSearch = false)"
                class="knowledge-search-input"
              />
            </div>
            <Button v-else type="button" variant="text" size="sm" @click="handleShowSearch">
              <template #icon>
                <Search />
              </template>
            </Button>
            <SelectorPopover v-model="showBatchSettings" width="240px" position="bottom">
              <template #trigger>
                <Button
                  :class="{ active: showBatchSettings }"
                  size="sm"
                  type="button"
                  variant="text"
                >
                  <template #icon>
                    <Settings />
                  </template>
                </Button>
              </template>
              <template #content>
                <div class="popover-header">批处理设置</div>
                <div class="popover-content">
                  <BatchSettingsForm />
                  <div style="display: flex; justify-content: flex-end; gap: 12px">
                    <Button size="sm" variant="text" @click="showBatchSettings = false"
                      >取消</Button
                    >
                    <Button size="sm" variant="primary" @click="batchSettingsActions.submit()"
                      >确定</Button
                    >
                  </div>
                </div>
              </template>
            </SelectorPopover>
          </div>
        </template>
      </FormItem>
    </template>
  </SettingFormContainer>
</template>

<style scoped>
.popover-header {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary, #333);
}
</style>
