<script setup lang="ts">
import { FormItem } from '@renderer/composables/useForm'
import Input from '@renderer/components/Input.vue'
const { providers } = storeToRefs(useSettingsStore())
const { updateProvider, addModelToProvider } = useSettingsStore()
const { list_models } = useLangChain()
const { confirm } = useModal()

const setActiveProvider = (providerId: string) => {
    activeProviderId.value = providerId;
    const provider = providers.value.find(p => p.id === providerId)
    formActions.setData(provider!)
};
const activeProviderId = ref('openai');

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

const refreshModels = async () => {
    const { data } = await list_models(activeProvider.value!.apiKey!, activeProvider.value!.baseUrl!)
    updateProvider(activeProviderId.value, {
        ...activeProvider.value!,
        models: data.map(m => ({ ...m, name: m.id })),
    })
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
                        <List type="ungap" v-if="activeProvider?.models?.length" :items="filteredModels"
                            :key-field="'id'" :main-field="'name'" :sub-field="'id'">
                            <template #actions="{ item }">
                                <Switch v-model="item.active" />
                            </template>
                        </List>
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