<script setup lang="tsx">
import { FormItem } from '@renderer/composables/useForm'

const { getAllProviders, providers } = storeToRefs(useSettingsStore())
const { updateProvider, addModelToProvider, deleteModelFromProvider, resetProviderBaseUrl } =
  useSettingsStore()

const { Refresh, Plus, Search, Edit, Delete } = useIcon([
  'Refresh',
  'Plus',
  'Search',
  'Edit',
  'Delete'
])
const { confirm } = useModal()
const { triggerHook } = usePlugins()

const pluginFields = ref<FormField<Provider>[]>([])

onMounted(async () => {
  const results = await triggerHook('provider:form-fields')
  pluginFields.value = (results.flat() as FormField<Provider>[]).filter(Boolean)
})


const setActiveProvider = (providerId: string) => {
  activeProviderId.value = providerId
  const provider = getAllProviders.value.find((p) => p.id === providerId)
  if (provider?.pluginName) return
  formActions.setData(provider! as Provider)
}
const activeProviderId = useLocalStorage<string>('activeProviderId', 'OpenAI')

const activeProvider = computed(() => {
  return providers.value.find((p) => p.id === activeProviderId.value)
})

const searchKeyword = ref('')

const filteredModels = computed(() => {
  const models = activeProvider.value?.models || []
  if (!searchKeyword.value) return models
  const lower = searchKeyword.value.toLowerCase()
  return models.filter(
    (m) => m.name.toLowerCase().includes(lower) || m.id.toLowerCase().includes(lower)
  )
})
const aiSearchModels = ref<Model[]>([])
const setAISearchValue = (values: Model[]) => {
  aiSearchModels.value = values
}


const editingModelId = ref<string | null>(null)

const handleResetBaseUrl = async () => {
  if (!activeProvider.value) return

  const result = await confirm({
    title: '重置请求地址',
    content: `确定要将 ${activeProvider.value.name} 的请求地址重置为默认值吗？`
  })

  if (result) {
    resetProviderBaseUrl(activeProviderId.value)
    const updatedProvider = providers.value.find((p) => p.id === activeProviderId.value)
    if (updatedProvider) {
      formActions.setData({
        ...activeProvider.value,
        baseUrl: updatedProvider.baseUrl
      })
    }
  }
}

const { registeredProviders } = storeToRefs(useSettingsStore())
const registeredPlugin = computed(() => {
  return registeredProviders.value.find((p) => p.providerId === activeProviderId.value)
})

const [ProviderForm, formActions] = useForm({
  title: `${activeProvider.value?.name} 设置`,
  showHeader: false,
  fields: computed(() => [
    {
      name: 'apiKey',
      type: 'password',
      label: 'API 密钥'
    },
    {
      name: 'baseUrl',
      type: 'text',
      label: '基础 URL（可选）',
      placeholder: '例：https://api.openai.com/v1',
      rest: () => (
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={handleResetBaseUrl}
          title="重置为默认地址"
          class="ml-2"
        >
        <component is={Refresh} />
        </Button>
      )
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
        { value: 'ollama', label: 'Ollama' }
      ]
    },
    ...pluginFields.value,
    {
      name: 'models',
      type: 'custom'
    }
  ] as FormField<Provider>[]),
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
      ]
    }
  ],
  onSubmit: (data) => {
    handleSaveCustomModel(data)
  }
})

const loading = ref(false)
const refreshModels = async () => {
  loading.value = true
  try {
    const { data } = await chatService().list_models({
      apiKey: activeProvider.value!.apiKey!,
      baseURL: activeProvider.value!.baseUrl!,
      providerType: activeProvider.value!.providerType!
    })
    formActions.setFieldsValue({
      ...activeProvider.value!,
      models: data.map((m) => {
        const result = { ...m, name: m.id, category: 'text' }
        if (
          result.id.toLowerCase().includes('embed') ||
          result.name.toLowerCase().includes('embed')
        ) {
          result.category = 'embedding'
        }
        if (
          result.id.toLowerCase().includes('rerank') ||
          result.name.toLowerCase().includes('rerank')
        ) {
          result.category = 'rerank'
        }
        return result
      })
    })
  } finally {
    loading.value = false
  }
}

const handleSaveCustomModel = (data: Partial<Model>) => {
  if (!activeProvider.value) return

  if (editingModelId.value) {
    const models = [...activeProvider.value.models]
    const index = models.findIndex((m) => m.id === editingModelId.value)

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
      id: data.id!,
      name: data.name!,
      description: data.description!,
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
    content: CustomModelForm
  })
  if (result) {
    customModelFormActions.submit()
  }
}

const showEditModelModal = async (row: Model) => {
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
    content: CustomModelForm
  })

  if (result) {
    customModelFormActions.submit()
  }
}

const isCustomModel = (model: Model) => {
  return model.created && model.owned_by === activeProvider.value?.name
}

const handleDeleteModel = async (row: Model) => {
  if (!activeProvider.value) return

  if (!isCustomModel(row)) {
    messageApi.error('只能删除自定义模型')
    return
  }

  const result = await confirm({
    title: '删除模型',
    content: `确定要删除模型 "${row.name}" 吗？此操作不可撤销。`
  })

  if (result) {
    deleteModelFromProvider(activeProviderId.value, row.id)
  }
}

const searchInputRef = useTemplateRef('searchInputRef')


import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()

const isDetailResult = computed(() => {
  return !!route.params.id
})

const selectProvider = (providerId: string) => {
  setActiveProvider(providerId)
  if (isMobile.value) {
    router.push(`/mobile/settings/models/${providerId}`)
  }
}

// Mobile/Desktop View Logic
const showList = computed(() => !isMobile.value || !isDetailResult.value)
const showForm = computed(() => !isMobile.value || isDetailResult.value)
const [ModelTable] = useTable<Model>({
  loading: () => loading.value,
  columns: [
    { key: 'name', label: '模型名称', width: '2fr' },
    { key: 'id', label: '模型ID', width: '2fr' },
    {
      key: 'category',
      label: '模型类型',
      width: '1fr',
      render: (row) => (
        <Tags
          tags={[getCategoryLabel(row.category)]}
          color={
            row.category === 'text'
              ? 'blue'
              : row.category === 'embedding'
                ? 'green'
                : row.category === 'image'
                  ? 'orange'
                  : row.category === 'rerank'
                    ? 'purple'
                    : 'blue'
          }
        />
      )
    },
    {
      key: 'active',
      label: '启用',
      width: '1fr',
      render: (row) => <Switch v-model={row.active} />
    },
    {
      key: 'actions',
      label: '操作',
      width: '1fr',
      render: (row) => (
        <>
          <Button
            type="button"
            variant="text"
            size="sm"
            onClick={() => showEditModelModal(row)}
            title="编辑模型"
          >
            <component is={Edit} />
          </Button>
          {isCustomModel(row) && (
            <Button
              type="button"
              variant="text"
              size="sm"
              onClick={() => handleDeleteModel(row)}
              title="删除模型"
              class="text-red-500 hover:text-red-700"
            >
              <component is={Delete} />
            </Button>
          )}
        </>
      )
    }
  ],
  data: () => (aiSearchModels.value.length ? aiSearchModels.value : filteredModels.value)
})

const ModelList = () => {
  const showSearch = ref(false)
  const handleShowSearch = async () => {
    showSearch.value = true
    await nextTick()
    searchInputRef.value?.focus()
  }
  return (
    <FormItem label="模型列表">
      {{
        label: () => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>模型列表</span>
            <Button onClick={showAddCustomModelModal} size="sm" type="button" variant="text">
              <component is={Plus} />
            </Button>
            {showSearch.value ? (
              <div>
                <SearchInput
                  searchKey="id"
                  search-data={activeProvider.value!.models}
                  onAi-search={setAISearchValue}
                  ref={searchInputRef}
                  v-model={searchKeyword.value}
                  onUpdate:modelValue={() => {
                    aiSearchModels.value = []
                  }}
                  placeholder="搜索模型..."
                  size="sm"
                  variant="default"
                  show-icon={true}
                  debounce={0}
                  onBlur={() => !searchKeyword.value && (showSearch.value = false)}
                  class="provider-search-input"
                />
              </div>
            ) : (
              <Button type="button" variant="text" size="sm" onClick={handleShowSearch}>
                <component is={Search} />
              </Button>
            )}
          </div>
        ),
        tool: () => (
          <Button onClick={refreshModels} size="sm" type="button" variant="text">
            <component is={Refresh} />
            刷新模型列表
          </Button>
        ),
        default: () => <ModelTable />
      }}
    </FormItem>
  )
}
</script>

<template>
  <!-- 列表视图 -->
  <ListContainer v-if="showList">
    <List title="提供商" :items="getAllProviders" :active-id="activeProviderId" @select="selectProvider" />
  </ListContainer>

  <!-- 表单视图 -->
  <FormContainer v-if="showForm" header-title="模型提供商">
    <template #content>
      <div v-if="registeredPlugin?.form" class="p-4">
        <component :is="registeredPlugin.form" />
      </div>
      <ProviderForm v-else>
        <template #models>
          <ModelList />
        </template>
      </ProviderForm>
    </template>
  </FormContainer>
</template>
<style scoped></style>
