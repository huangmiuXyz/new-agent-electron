<script setup lang="tsx">
import { FormItem } from '@renderer/composables/useForm'
const { providers } = storeToRefs(useSettingsStore())
const { updateProvider, addModelToProvider, deleteModelFromProvider, resetProviderBaseUrl } = useSettingsStore()

const { Refresh, Plus, Search, Edit, Delete }: any = useIcon(['Refresh', 'Plus', 'Search', 'Edit', 'Delete'])
const { confirm } = useModal()

const setActiveProvider = (providerId: string) => {
    activeProviderId.value = providerId;
    const provider = providers.value.find(p => p.id === providerId)
    formActions.setData(provider!)
};
const activeProviderId = useLocalStorage<string>('activeProviderId', 'OpenAI');

const activeProvider = computed(() => {
    return providers.value.find(p => p.id === activeProviderId.value);
});

const showSearch = ref(false)
const searchKeyword = ref('')

const filteredModels = computed(() => {
    const models = activeProvider.value?.models || []
    if (!searchKeyword.value) return models
    const lower = searchKeyword.value.toLowerCase()
    return models.filter(m =>
        m.name.toLowerCase().includes(lower) ||
        m.id.toLowerCase().includes(lower)
    )
})
const aiSearchModels = ref<Model[]>([])
const setAISearchValue = (values: Model[]) => {
    aiSearchModels.value = values
}
const tableColumns = [
    { key: 'name', label: '模型名称', width: '2fr' },
    { key: 'id', label: '模型ID', width: '2fr' },
    { key: 'category', label: '模型类型', width: '1fr' },
    { key: 'active', label: '启用', width: '1fr' },
    { key: 'actions', label: '操作', width: '1fr' }
]

const editingModelId = ref<string | null>(null)

// 重置请求地址
const handleResetBaseUrl = async () => {
    if (!activeProvider.value) return

    const result = await confirm({
        title: '重置请求地址',
        content: `确定要将 ${activeProvider.value.name} 的请求地址重置为默认值吗？`,
    })

    if (result) {
        resetProviderBaseUrl(activeProviderId.value)
        const updatedProvider = providers.value.find(p => p.id === activeProviderId.value)
        if (updatedProvider) {
            formActions.setData({
                ...activeProvider.value,
                baseUrl: updatedProvider.baseUrl
            })
        }
    }
}
const [ProviderForm, formActions] = useForm({
    title: `${activeProvider.value?.name} 设置`,
    showHeader: false,
    fields: [
        {
            name: 'apiKey',
            type: 'password',
            label: 'API 密钥',
        },
        {
            name: 'baseUrl',
            type: 'text',
            label: '基础 URL（可选）',
            placeholder: '例：https://api.openai.com/v1',
            rest: () =>
                <Button type="button" variant="text" size="sm" onClick={handleResetBaseUrl} title="重置为默认地址"
                    class="ml-2">
                    <Refresh />
                </Button>
        },
        {
            name: 'providerType',
            type: 'select',
            label: '模型类型',
            options: [
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'google', label: 'Google' },
                { value: 'xai', label: 'xAI' },
                { value: 'openai-compatible', label: 'OpenAI 兼容' },
                { value: 'ollama', label: 'Ollama' },
            ]
        }
    ],
    initialData: activeProvider.value,
    onChange: (_field, _value, data) => {
        if (activeProviderId.value) {
            updateProvider(activeProviderId.value, data)
        }
    }
})

// 自定义模型表单
const [CustomModelForm, customModelFormActions] = useForm({
    title: editingModelId.value ? '编辑模型' : '添加自定义模型',
    showHeader: false,
    fields: [
        {
            name: 'id',
            type: 'text',
            label: '模型 ID',
            required: true,
            placeholder: '例如：gpt-4-custom'
        },
        {
            name: 'name',
            type: 'text',
            label: '模型名称',
            placeholder: '例如：自定义 GPT-4 模型'
        },
        {
            name: 'description',
            type: 'text',
            label: '模型描述（可选）',
            placeholder: '描述此模型的特点和用途'
        },
        {
            name: 'category',
            type: 'select',
            label: '模型类型',
            options: [
                { value: 'text', label: '文本' },
                { value: 'embedding', label: '嵌入式' },
                { value: 'image', label: '图像' },
                { value: 'rerank', label: '重排' }
            ],
        }
    ],
    onSubmit: (data) => {
        handleSaveCustomModel(data)
    }
})

const selectProvider = (providerId: string) => {
    setActiveProvider(providerId)
}

const loading = ref(false)
const refreshModels = async () => {
    loading.value = true
    try {
        const { data } = await chatService().list_models({
            apiKey: activeProvider.value!.apiKey!,
            baseURL: activeProvider.value!.baseUrl!,
        })
        formActions.setFieldsValue({
            ...activeProvider.value!,
            models: data.map(m => {
                const result = { ...m, name: m.id, category: 'text' }
                if (result.id.toLowerCase().includes('embed') || result.name.toLowerCase().includes('embed')) {
                    result.category = 'embedding'
                }
                if (result.id.toLowerCase().includes('rerank') || result.name.toLowerCase().includes('rerank')) {
                    result.category = 'rerank'
                }
                return result
            }),
        })
    } finally {
        loading.value = false
    }
}

const handleSaveCustomModel = (data: any) => {
    if (!activeProvider.value) return

    if (editingModelId.value) {
        const models = [...activeProvider.value.models]
        const index = models.findIndex(m => m.id === editingModelId.value)

        if (index > -1) {
            models[index] = {
                ...models[index],
                ...data,
                active: models[index].active
            }
            updateProvider(activeProviderId.value, { ...activeProvider.value, models })
        }
    } else {
        const newModel: Model = {
            id: data.id,
            name: data.name,
            description: data.description,
            category: data.category || 'text',
            active: true,
            created: +new Date(),
            object: 'model',
            owned_by: activeProvider.value.name
        }
        addModelToProvider(activeProviderId.value, newModel)
    }
}

const showAddCustomModelModal = async () => {
    if (!activeProvider.value) return

    editingModelId.value = null
    customModelFormActions.reset()

    customModelFormActions.setFieldsValue({
        id: '',
        name: '',
        description: '',
        category: 'text'
    })
    const result = await confirm({
        title: `添加自定义模型到 ${activeProvider.value.name}`,
        content: CustomModelForm,
    })
    if (result) {
        customModelFormActions.submit()
    }
}

const showEditModelModal = async (row: any) => {
    if (!activeProvider.value) return

    editingModelId.value = row.id
    customModelFormActions.setFieldsValue({
        id: row.id,
        name: row.name,
        description: row.description || '',
        category: row.category || 'text'
    })

    const result = await confirm({
        title: '编辑模型',
        content: CustomModelForm,
    })

    if (result) {
        customModelFormActions.submit()
    }
}

const isCustomModel = (model: any) => {
    return model.created && model.owned_by === activeProvider.value?.name
}

const handleDeleteModel = async (row: any) => {
    if (!activeProvider.value) return

    if (!isCustomModel(row)) {
        messageApi.error('只能删除自定义模型')
        return
    }

    const result = await confirm({
        title: '删除模型',
        content: `确定要删除模型 "${row.name}" 吗？此操作不可撤销。`,
    })

    if (result) {
        deleteModelFromProvider(activeProviderId.value, row.id)
    }
}

const searchInputRef = useTemplateRef('searchInputRef')
const handleShowSearch = async () => {
    showSearch.value = true
    await nextTick()
    searchInputRef.value?.focus()
}

</script>

<template>
    <SettingsListContainer>
        <List title="提供商" :items="providers" :active-id="activeProviderId" @select="selectProvider" />
    </SettingsListContainer>
    <SettingFormContainer header-title="模型提供商">
        <template #content>
            <ProviderForm>
                <template #footer>
                    <FormItem label="模型列表">
                        <Table :loading="loading" :columns="tableColumns"
                            :data="aiSearchModels.length ? aiSearchModels : filteredModels">
                            <template #category="{ row }">
                                <Tags :tags="[row.category === 'text' ? '文本' :
                                    row.category === 'embedding' ? '嵌入式' :
                                        row.category === 'image' ? '图像' :
                                            row.category === 'rerank' ? '重排' : '文本']" :color="row.category === 'text' ? 'blue' :
                                                row.category === 'embedding' ? 'green' :
                                                    row.category === 'image' ? 'orange' :
                                                        row.category === 'rerank' ? 'purple' : 'blue'" />
                            </template>
                            <template #active="{ row }">
                                <Switch v-model="row.active" />
                            </template>

                            <template #actions="{ row }">
                                <Button type="button" variant="text" size="sm" @click="showEditModelModal(row)"
                                    title="编辑模型">
                                    <template #icon>
                                        <Edit />
                                    </template>
                                </Button>
                                <Button v-if="isCustomModel(row)" type="button" variant="text" size="sm"
                                    @click="handleDeleteModel(row)" title="删除模型"
                                    class="text-red-500 hover:text-red-700">
                                    <template #icon>
                                        <Delete />
                                    </template>
                                </Button>
                            </template>
                        </Table>
                        <template #tool>
                            <Button @click="refreshModels" size="sm" type="button" variant="text">
                                <template #icon>
                                    <Refresh />
                                </template>
                                刷新模型列表
                            </Button>
                        </template>
                        <template #label>
                            <div style="display: flex;">
                                <Button @click="showAddCustomModelModal" size="sm" type="button" variant="text">
                                    <template #icon>
                                        <Plus />
                                    </template>
                                    模型列表
                                </Button>
                                <div v-if="showSearch">
                                    <SearchInput searchKey="id" :search-data="activeProvider!.models"
                                        @ai-search="setAISearchValue" ref="searchInputRef" v-model="searchKeyword"
                                        @update:model-value="aiSearchModels = []" placeholder="搜索模型..." size="sm"
                                        variant="default" :show-icon="true" :debounce="0"
                                        @blur="!searchKeyword && (showSearch = false)" class="provider-search-input" />
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
            </ProviderForm>
        </template>
    </SettingFormContainer>
</template>
<style scoped></style>