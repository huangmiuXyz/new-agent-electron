<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
import Input from '@renderer/components/Input.vue'
import Table from '@renderer/components/Table.vue'
const { knowledgeBases } = storeToRefs(useKnowledgeStore())
const { updateKnowledgeBase, addKnowledgeBase, deleteKnowledgeBase, addDocumentToKnowledgeBase, deleteDocumentFromKnowledgeBase } = useKnowledgeStore()

const { Plus, Search, Trash, File, Refresh } = useIcon(['Plus', 'Search', 'Trash', 'File', 'Refresh'])
const { confirm } = useModal()
const { showContextMenu } = useContextMenu<KnowledgeBase>()

const setActiveKnowledgeBase = (knowledgeBaseId: string) => {
    activeKnowledgeBaseId.value = knowledgeBaseId;
    const knowledgeBase = knowledgeBases.value.find(kb => kb.id === knowledgeBaseId)
    if (knowledgeBase) {
        formActions.setData(knowledgeBase)
    }
};
const activeKnowledgeBaseId = useLocalStorage<string>('activeKnowledgeBaseId', '');

watch(() => activeKnowledgeBaseId.value, (v) => {
    if (!v) {
        activeKnowledgeBaseId.value = knowledgeBases.value[0].id
    }
})
const activeKnowledgeBase = computed<KnowledgeBase>(() => {
    return knowledgeBases.value.find(kb => kb.id === activeKnowledgeBaseId.value)!;
});

const showSearch = ref(false)
const searchKeyword = ref('')

const filteredDocuments = computed(() => {
    const documents = activeKnowledgeBase.value?.documents || []
    if (!searchKeyword.value) return documents
    const lower = searchKeyword.value.toLowerCase()
    return documents.filter(doc =>
        doc.name.toLowerCase().includes(lower) ||
        doc.path.toLowerCase().includes(lower)
    )
})

const [KnowledgeBaseForm, formActions] = useForm<Pick<KnowledgeBase, 'name' | 'description' | 'embeddingModel'>>({
    showHeader: true,
    initialData: {
        name: '',
        description: '',
        embeddingModel: {
            modelId: '',
            providerId: ''
        },
    },
    fields: [
        {
            name: 'name',
            type: 'text',
            label: '知识库名称',
            required: true,
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
        }
    ],
    onSubmit: (data) => {
        if (activeKnowledgeBaseId.value && activeKnowledgeBase.value) {
            const updatedKnowledgeBase: KnowledgeBase = {
                ...activeKnowledgeBase.value,
                ...data
            }
            updateKnowledgeBase(activeKnowledgeBaseId.value, updatedKnowledgeBase)
        } else {
            // 创建模式
            const newKnowledgeBase: KnowledgeBase = {
                id: `kb_${nanoid()}`,
                ...data,
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
    activeKnowledgeBaseId.value = ''
    const result = await confirm({
        title: '添加知识库',
        content: KnowledgeBaseForm,
        width: '50%'
    })
    if (result) {
        formActions.submit()
    }
}

const showEditKnowledgeBaseModal = async () => {
    if (!activeKnowledgeBase.value) {
        return
    }
    formActions.setData(activeKnowledgeBase.value)
    const result = await confirm({
        title: '编辑知识库',
        content: KnowledgeBaseForm,
        width: '50%'
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
        content: `确定要删除知识库 "${activeKnowledgeBase.value.name}" 吗？此操作不可撤销。`,
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
        files.forEach(f => {
            const doc: KnowledgeDocument = {
                id: `doc_${nanoid()}`,
                name: f.filename!,
                path: f.path!,
                size: f.size,
                type: f.mediaType,
                created: Date.now(),
                status: 'processing'
            }
            docs.push(doc)
            addDocumentToKnowledgeBase(activeKnowledgeBaseId.value, doc)
        })
        clearSeletedFiles()
        docs.forEach(doc => {
            embedding(doc, activeKnowledgeBase.value)
        })
    }
})
const addDocument = () => {
    triggerUpload(true)
}
const searchBtn = useTemplateRef('searchBtn')
const handleShowSearch = async () => {
    showSearch.value = true
    await nextTick()
    searchBtn.value?.focus()
}
const { embedding } = useKnowledge()

</script>

<template>
    <List type="gap" title="知识库" :items="knowledgeBases" :active-id="activeKnowledgeBaseId"
        @select="selectKnowledgeBase"
        @contextmenu="(event, item) => handleKnowledgeBaseContextMenu(event, knowledgeBases.find(kb => kb.id === item)!)">
        <template #title-tool>
            <Button @click="showAddKnowledgeBaseModal" size="sm" type="button" variant="primary">
                <template #icon>
                    <Plus />
                </template>
                添加
            </Button>
        </template>
    </List>

    <!-- 配置表单 -->
    <SettingFormContainer header-title="知识库管理">
        <template #content>
            <FormItem label="文档列表">
                <Table :loading="loading" :data="filteredDocuments" :columns="[
                    { key: 'name', label: '文档名称', width: '2fr' },
                    { key: 'path', label: '路径', width: '3fr' },
                    { key: 'type', label: '类型', width: '1fr' },
                    { key: 'size', label: '大小', width: '1fr' },
                    { key: 'created', label: '创建时间', width: '1.5fr' },
                    { key: 'status', label: '状态', width: '1.5fr' },
                    { key: 'actions', label: '操作', width: '1fr' }
                ]">
                    <template #type="props">
                        <span style="text-transform: uppercase;">{{ props.row.type
                            }}</span>
                    </template>
                    <template #size="props">
                        {{ formatFileSize(props.row.size) }}
                    </template>
                    <template #created="props">
                        {{ formatTime(props.row.created) }}
                    </template>
                    <template #status="props">
                        <Tags
                            :color="props.row.status === 'processing' ? 'purple' : props.row.status === 'error' ? 'red' : 'blue'"
                            :tags="[props.row.status]" />
                    </template>
                    <template #actions="props">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <Button @click="embedding(props.row, activeKnowledgeBase)" size="sm" type="button"
                                variant="text">
                                <template #icon>
                                    <Refresh />
                                </template>
                            </Button>
                            <Button @click="showDeleteDocumentModal(props.row)" size="sm" type="button" variant="text">
                                <template #icon>
                                    <Trash />
                                </template>
                            </Button>
                        </div>
                    </template>
                </Table>
                <template #label>
                    <div style="display: flex;">
                        <Button @click="addDocument" size="sm" type="button" variant="text">
                            <template #icon>
                                <Plus />
                            </template>
                            添加文档
                        </Button>
                        <div v-if="showSearch">
                            <Input ref="searchBtn" size="sm" v-model="searchKeyword" placeholder="搜索文档..." autofocus
                                @blur="!searchKeyword && (showSearch = false)" />
                        </div>
                        <Button v-else type="button" variant="text" size="sm" @click="handleShowSearch">
                            <template #icon>
                                <Search />
                            </template>
                        </Button>
                    </div>
                </template>
            </FormItem>
        </template>
    </SettingFormContainer>
</template>

<style scoped>
:deep(.mode-ungap) {
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    --bg-active: #f0f0f0;
}

:deep(.group-header) {
    background: #fafafa;
    border-bottom: 1px solid #f5f5f5;
}

:deep(.list-item) {
    padding: 10px 14px;
    padding-right: 10px;
    border-bottom: 1px solid #f5f5f5;
    background-color: #ffffff;
}

:deep(.list-item:last-child) {
    border-bottom: none;
}

:deep(.list-item:hover) {
    background-color: #fafafa;
}

/* 确保Switch组件正确对齐 */
:deep(.item-actions) {
    margin-left: 10px;
}
</style>