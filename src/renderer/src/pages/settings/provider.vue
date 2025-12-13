<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
import Input from '@renderer/components/Input.vue'
import Table from '@renderer/components/Table.vue'
import Switch from '@renderer/components/Switch.vue'
const { providers } = storeToRefs(useSettingsStore())
const { updateProvider, addModelToProvider } = useSettingsStore()

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

// Table列配置
const tableColumns = [
    { key: 'name', label: '模型名称', width: '2fr' },
    { key: 'id', label: '模型ID', width: '3fr' },
    { key: 'active', label: '启用', width: '1fr' }
]

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
            placeholder: '例：https://api.openai.com/v1'
        },
        {
            name: 'modelType',
            type: 'select',
            label: '模型类型',
            options: [
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'google', label: 'Google' },
                { value: 'xai', label: 'xAI' },
                { value: 'openai-compatible', label: 'OpenAI 兼容' }
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
    title: '添加自定义模型',
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
        }
    ],
    onSubmit: (data) => {
        handleAddCustomModel(data)
    }
})

const selectProvider = (providerId: string) => {
    setActiveProvider(providerId)
}

const { Refresh, Plus, Search } = useIcon(['Refresh', 'Plus', 'Search'])
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
            models: data.map(m => ({ ...m, name: m.id })),
        })
    } finally {
        loading.value = false
    }
}

// 显示添加自定义模型的模态框
const showAddCustomModelModal = async () => {
    if (!activeProvider.value) {
        return
    }
    customModelFormActions.reset()
    const result = await confirm({
        title: `添加自定义模型到 ${activeProvider.value.name}`,
        content: CustomModelForm,
    })
    if (result) {
        customModelFormActions.submit()
    }
}

// 处理添加自定义模型
const handleAddCustomModel = (data: any) => {
    if (!activeProvider.value) {
        return
    }
    const newModel: Model = {
        id: data.id,
        name: data.name,
        description: data.description,
        active: true,
        created: +new Date(),
        object: 'model',
        owned_by: activeProvider.value.name
    }
    addModelToProvider(activeProviderId.value, newModel)
}
const searchBtn = useTemplateRef('searchBtn')
const handleShowSearch = async () => {
    showSearch.value = true
    await nextTick()
    searchBtn.value?.focus()
}
</script>

<template>
    <List type="gap" title="提供商" :items="providers" :active-id="activeProviderId" @select="selectProvider" />

    <!-- 配置表单 -->
    <SettingFormContainer header-title="模型提供商">
        <template #content> <!-- 厂商列表 -->

            <ProviderForm>
                <template #footer>
                    <FormItem label="模型列表">
                        <Table :loading="loading" :columns="tableColumns" :data="filteredModels">
                            <template #name="{ row }">
                                {{ row.name }}
                            </template>
                            <template #id="{ row }">
                                {{ row.id }}
                            </template>
                            <template #active="{ row }">
                                <Switch v-model="row.active" />
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
                                    <Input ref="searchBtn" size="sm" v-model="searchKeyword" placeholder="搜索模型..."
                                        autofocus @blur="!searchKeyword && (showSearch = false)" />
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