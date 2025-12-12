<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
import Input from '@renderer/components/Input.vue'
import Table from '@renderer/components/Table.vue'
const { knowledgeBases } = storeToRefs(useSettingsStore())
const { updateKnowledgeBase, addKnowledgeBase, deleteKnowledgeBase, addDocumentToKnowledgeBase, deleteDocumentFromKnowledgeBase } = useSettingsStore()

const { confirm } = useModal()
const { showContextMenu } = useContextMenu()

const setActiveKnowledgeBase = (knowledgeBaseId: string) => {
    activeKnowledgeBaseId.value = knowledgeBaseId;
    const knowledgeBase = knowledgeBases.value.find(kb => kb.id === knowledgeBaseId)
    formActions.setData(knowledgeBase!)
};
const activeKnowledgeBaseId = useLocalStorage<string>('activeKnowledgeBaseId', 'default-local');

const activeKnowledgeBase = computed(() => {
    return knowledgeBases.value.find(kb => kb.id === activeKnowledgeBaseId.value);
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

const [KnowledgeBaseForm, formActions] = useForm<Pick<KnowledgeBase, 'name' | 'description' | 'type' | 'path' | 'url' | 'apiKey' | 'embeddingModel' | 'chunkSize' | 'chunkOverlap'>>({
    showHeader: true,
    initialData: {
        name: '',
        description: '',
        type: 'local',
        path: '',
        url: '',
        apiKey: '',
        embeddingModel: 'text-embedding-ada-002',
        chunkSize: 1000,
        chunkOverlap: 200
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
            name: 'type',
            type: 'select',
            label: '知识库类型',
            options: [
                { value: 'local', label: '本地知识库' },
                { value: 'remote', label: '远程知识库' }
            ]
        },
        {
            name: 'path',
            type: 'text',
            label: '本地路径',
            placeholder: '例：/path/to/knowledge',
            ifShow: (data) => data.type === 'local'
        },
        {
            name: 'url',
            type: 'text',
            label: '远程 URL',
            placeholder: '例：https://api.example.com/knowledge',
            ifShow: (data) => data.type === 'remote'
        },
        {
            name: 'apiKey',
            type: 'password',
            label: 'API 密钥（可选）',
            ifShow: (data) => data.type === 'remote'
        },
        {
            name: 'embeddingModel',
            type: 'select',
            label: '嵌入模型',
            options: [
                { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
                { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
                { value: 'text-embedding-3-large', label: 'text-embedding-3-large' }
            ]
        },
        {
            name: 'chunkSize',
            type: 'number',
            label: '文档块大小',
            placeholder: '默认：1000'
        },
        {
            name: 'chunkOverlap',
            type: 'number',
            label: '文档块重叠',
            placeholder: '默认：200'
        }
    ],
    onSubmit: (data) => {
        if (activeKnowledgeBaseId.value && activeKnowledgeBase.value) {
            const updatedKnowledgeBase: KnowledgeBase = {
                ...activeKnowledgeBase.value,
                ...data
            }
            updateKnowledgeBase(activeKnowledgeBaseId.value, updatedKnowledgeBase)
        }
    }
})

// 创建知识库表单
const [CreateKnowledgeBaseForm, createFormActions] = useForm<Pick<KnowledgeBase, 'name' | 'description' | 'type' | 'path' | 'url' | 'apiKey' | 'embeddingModel' | 'chunkSize' | 'chunkOverlap'>>({
    showHeader: true,
    initialData: {
        name: '',
        description: '',
        type: 'local',
        path: '',
        url: '',
        apiKey: '',
        embeddingModel: 'text-embedding-ada-002',
        chunkSize: 1000,
        chunkOverlap: 200
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
            name: 'type',
            type: 'select',
            label: '知识库类型',
            options: [
                { value: 'local', label: '本地知识库' },
                { value: 'remote', label: '远程知识库' }
            ]
        },
        {
            name: 'path',
            type: 'text',
            label: '本地路径',
            placeholder: '例：/path/to/knowledge',
            ifShow: (data) => data.type === 'local'
        },
        {
            name: 'url',
            type: 'text',
            label: '远程 URL',
            placeholder: '例：https://api.example.com/knowledge',
            ifShow: (data) => data.type === 'remote'
        },
        {
            name: 'apiKey',
            type: 'password',
            label: 'API 密钥（可选）',
            ifShow: (data) => data.type === 'remote'
        },
        {
            name: 'embeddingModel',
            type: 'select',
            label: '嵌入模型',
            options: [
                { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
                { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
                { value: 'text-embedding-3-large', label: 'text-embedding-3-large' }
            ]
        },
        {
            name: 'chunkSize',
            type: 'number',
            label: '文档块大小',
            placeholder: '默认：1000'
        },
        {
            name: 'chunkOverlap',
            type: 'number',
            label: '文档块重叠',
            placeholder: '默认：200'
        }
    ],
    onSubmit: (data) => {
        const newKnowledgeBase: KnowledgeBase = {
            id: `kb_${Date.now()}`,
            ...data,
            active: false,
            created: Date.now(),
            documents: []
        }
        addKnowledgeBase(newKnowledgeBase)
        // 自动选中新创建的知识库
        setActiveKnowledgeBase(newKnowledgeBase.id)
    }
})

// 自定义文档表单
const [DocumentForm, documentFormActions] = useForm({
    title: '添加文档',
    showHeader: false,
    fields: [
        {
            name: 'name',
            type: 'text',
            label: '文档名称',
            required: true,
            placeholder: '例如：用户手册'
        },
        {
            name: 'path',
            type: 'text',
            label: '文档路径',
            required: true,
            placeholder: '例如：/path/to/document.pdf'
        },
        {
            name: 'type',
            type: 'select',
            label: '文档类型',
            options: [
                { value: 'pdf', label: 'PDF' },
                { value: 'txt', label: '文本文件' },
                { value: 'docx', label: 'Word 文档' },
                { value: 'md', label: 'Markdown' }
            ]
        }
    ],
    onSubmit: (data) => {
        handleAddDocument(data)
    }
})

const selectKnowledgeBase = (knowledgeBaseId: string) => {
    setActiveKnowledgeBase(knowledgeBaseId)
}

// 处理知识库右键菜单
const handleKnowledgeBaseContextMenu = (event: MouseEvent, knowledgeBase: KnowledgeBase) => {
    const { File, Trash } = useIcon(['File', 'Trash'])
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
            }
        }
    ])
}

const { Plus, Search, Trash } = useIcon(['Plus', 'Search', 'Trash'])
const loading = ref(false)

// 显示添加文档的模态框
const showAddDocumentModal = async () => {
    if (!activeKnowledgeBase.value) {
        return
    }
    documentFormActions.reset()
    const result = await confirm({
        title: `添加文档到 ${activeKnowledgeBase.value.name}`,
        content: DocumentForm,
    })
    if (result) {
        documentFormActions.submit()
    }
}

// 处理添加文档
const handleAddDocument = (data: any) => {
    if (!activeKnowledgeBase.value) {
        return
    }
    const newDocument: KnowledgeDocument = {
        id: `doc_${Date.now()}`,
        name: data.name,
        path: data.path,
        type: data.type,
        size: Math.floor(Math.random() * 1000000), // 模拟文件大小
        created: +new Date(),
        processed: false
    }
    addDocumentToKnowledgeBase(activeKnowledgeBaseId.value, newDocument)
}

// 显示添加知识库模态框
const showAddKnowledgeBaseModal = async () => {
    createFormActions.reset()
    const result = await confirm({
        title: '添加知识库',
        content: CreateKnowledgeBaseForm,
        width: '50%'
    })
    if (result) {
        createFormActions.submit()
    }
}

// 显示编辑知识库模态框
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

// 显示删除知识库确认对话框
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
        // 切换到第一个可用的知识库
        if (knowledgeBases.value.length > 0) {
            setActiveKnowledgeBase(knowledgeBases.value[0].id)
        }
    }
}

// 显示删除文档确认对话框
const showDeleteDocumentModal = async (document: KnowledgeDocument) => {
    const result = await confirm({
        title: '删除文档',
        content: `确定要删除文档 "${document.name}" 吗？此操作不可撤销。`,
    })
    if (result) {
        deleteDocumentFromKnowledgeBase(activeKnowledgeBaseId.value, document.id)
    }
}

const searchBtn = useTemplateRef('searchBtn')
const handleShowSearch = async () => {
    showSearch.value = true
    await nextTick()
    searchBtn.value?.focus()
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化日期
const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}
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
                添加知识库
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
                    { key: 'actions', label: '操作', width: '1fr' }
                ]">
                    <template #type="props">
                        <span style="text-transform: uppercase;">{{ (props.row as KnowledgeDocument).type
                        }}</span>
                    </template>
                    <template #size="props">
                        {{ formatFileSize((props.row as KnowledgeDocument).size) }}
                    </template>
                    <template #created="props">
                        {{ formatDate((props.row as KnowledgeDocument).created) }}
                    </template>
                    <template #actions="props">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <Switch v-model="(props.row as KnowledgeDocument).processed" size="sm" />
                            <Button @click="showDeleteDocumentModal(props.row as KnowledgeDocument)" size="sm"
                                type="button" variant="text">
                                <template #icon>
                                    <Trash />
                                </template>
                            </Button>
                        </div>
                    </template>
                </Table>
                <template #label>
                    <div style="display: flex;">
                        <Button @click="showAddDocumentModal" size="sm" type="button" variant="text">
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
/* 为settings页面的List组件添加特殊样式 */
:deep(.mode-ungap) {
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    /* 设置自定义的选中项背景颜色 */
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