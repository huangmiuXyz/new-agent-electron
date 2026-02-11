<script setup lang="tsx">
import { FormItem } from '@renderer/composables/useForm'
import { getProviderTypes } from '@renderer/services/chatService/registry'
import providerData from '@renderer/assets/data/provider.json'

const { getAllProviders } = storeToRefs(useSettingsStore())
const visibleProviders = computed(() => getAllProviders.value.filter((p) => !p.hide))
const {
  updateProvider,
  addModelToProvider,
  deleteModelFromProvider,
  resetProviderBaseUrl,
  addApiKeyToProvider,
  deleteApiKeyFromProvider
} = useSettingsStore()

const { Refresh, Plus, Search, Edit, Delete, ChevronRight, ChevronDown, Active, Inactive, Box } = useIcon([
  'Refresh',
  'Plus',
  'Search',
  'Edit',
  'Delete',
  'ChevronRight',
  'ChevronDown',
  'Active',
  'Inactive',
  'Box'
])
const { confirm } = useModal()
const { triggerHook } = usePlugins()

const pluginFields = ref<FormField<Provider>[]>([])

onMounted(async () => {
  const results = await triggerHook('provider:form-fields')
  pluginFields.value = (results.flat() as FormField<Provider>[]).filter(Boolean)
})

const activeProviderId = useLocalStorage<string>('activeProviderId', 'OpenAI')

const activeProvider = computed(() => {
  return getAllProviders.value.find((p) => p.id === activeProviderId.value)
})

const [ApiKeyTable, apiKeyTableActions] = useTable<ApiKeyInfo>({
  columns: [
    {
      key: 'status',
      label: '状态',
      width: '60px',
      align: 'center',
      render: (row) =>
        activeProvider.value?.activeApiKeyId === row.id ? (
          <span class="text-green-500 flex items-center justify-center">{Active}</span>
        ) : (
          <span class="text-gray-400 flex items-center justify-center opacity-30">{Inactive}</span>
        )
    },
    { key: 'name', label: '密钥名称', width: '2fr' },
    {
      key: 'key',
      label: '密钥内容',
      width: '3fr',
      render: (row) => (
        <span class="font-mono text-xs">
          {row.key.slice(0, 8)}...{row.key.slice(-4)}
        </span>
      )
    },
    {
      key: 'actions',
      label: '操作',
      width: '60px',
      align: 'center',
      render: (row) => (
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            handleDeleteApiKey(row)
          }}
          title="删除"
          class="text-red-500"
        >
          {Delete}
        </Button>
      )
    }
  ],
  data: () => activeProvider.value?.apiKeys || [],
  onRowClick: (row) => handleSwitchApiKey(row)
})

// 监听 activeProvider 的变化，同步更新表格数据
watch(
  () => activeProvider.value?.apiKeys,
  (newApiKeys) => {
    apiKeyTableActions.setData(newApiKeys || [])
  },
  { immediate: true, deep: true }
)

// 2. 定义相关操作
const handleSwitchApiKey = (apiKey: ApiKeyInfo) => {
  if (!activeProvider.value) return
  // 直接更新表单数据，让表单的 onChange 自动同步到 store
  formActions.setFieldsValue({
    ...activeProvider.value,
    apiKey: apiKey.key,
    activeApiKeyId: apiKey.id
  } as Provider)
}

const [ApiKeyForm, apiKeyFormActions] = useForm({
  title: '添加 API 密钥',
  showHeader: false,
  fields: [
    { name: 'name', type: 'text', label: '密钥名称', required: true, placeholder: '例如：生产环境密钥', defaultValue: '默认密钥' },
    { name: 'key', type: 'password', label: 'API 密钥', required: true, placeholder: '输入您的 API Key' }
  ],
  onSubmit: (data) => {
    if (!activeProvider.value) return
    const newApiKey: ApiKeyInfo = {
      id: nanoid(),
      name: data.name!,
      key: data.key!
    }

    // 记录添加前的状态
    const wasEmpty = !activeProvider.value.apiKey

    addApiKeyToProvider(activeProviderId.value, newApiKey)

    // 触发表单更新以确保持久化
    const updatedApiKeys = activeProvider.value.apiKeys || []
    formActions.setFieldValue('apiKeys', [...updatedApiKeys])

    // 如果之前为空，则新添加的密钥会被自动选中，需要同步更新表单中的 apiKey 字段
    if (wasEmpty) {
      formActions.setFieldValue('apiKey', newApiKey.key)
      formActions.setFieldValue('activeApiKeyId', newApiKey.id)
    }
  }
})

const showAddApiKeyModal = async () => {
  if (!activeProvider.value) return
  apiKeyFormActions.reset()
  const result = await confirm({
    title: `添加 API 密钥到 ${activeProvider.value.name}`,
    content: ApiKeyForm
  })
  if (result) apiKeyFormActions.submit()
}

const handleDeleteApiKey = async (apiKey: ApiKeyInfo) => {
  if (!activeProvider.value) return
  const result = await confirm({
    title: '删除 API 密钥',
    content: `确定要删除密钥 "${apiKey.name}" 吗？`
  })
  if (result) {
    deleteApiKeyFromProvider(activeProviderId.value, apiKey.id)

    // 触发表单更新以确保持久化
    const updatedProvider = getAllProviders.value.find((p) => p.id === activeProviderId.value)
    if (updatedProvider) {
      formActions.setFieldValue('apiKeys', [...(updatedProvider.apiKeys || [])])
      formActions.setFieldValue('apiKey', updatedProvider.apiKey || '')
      formActions.setFieldValue('activeApiKeyId', updatedProvider.activeApiKeyId || '')
    }
  }
}

const ApiKeyList = defineComponent({
  setup() {
    return () => (
      <FormItem label="密钥管理">
        {{
          label: () => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>密钥管理</span>
              <Button onClick={showAddApiKeyModal} size="sm" type="button" variant="text">
                {Plus}
              </Button>
            </div>
          ),
          default: () => (
            <div class="api-key-list-wrapper mt-2 border rounded-md overflow-hidden">
              <ApiKeyTable />
            </div>
          )
        }}
      </FormItem>
    )
  }
})

const setActiveProvider = (providerId: string) => {
  activeProviderId.value = providerId
  const provider = getAllProviders.value.find((p) => p.id === providerId)
  if (provider?.pluginName) return
  formActions.setData(provider! as Provider)
  // 显式设置表格数据，确保响应式更新
  nextTick(() => {
    apiKeyTableActions.setData(provider?.apiKeys || [])
  })
}

const providerOptions = computed(() => {
  return getProviderTypes().map((key) => ({
    value: key,
    label: key
  }))
})

// 添加自定义提供商相关逻辑
const { addCustomProvider, removeCustomProvider } = useSettingsStore()

const [CustomProviderForm, customProviderFormActions] = useForm({
  title: '添加自定义提供商',
  showHeader: false,
  fields: [
    { name: 'id', type: 'text', label: '提供商 ID', required: true, placeholder: '例如：my-custom-provider' },
    { name: 'name', type: 'text', label: '提供商名称', required: true, placeholder: '例如：我的自定义提供商' },
    { name: 'baseUrl', type: 'text', label: '基础 URL', required: true, placeholder: '例如：https://api.example.com/v1' },
    {
      name: 'providerType',
      type: 'select',
      label: '提供商类型',
      required: true,
      options: providerOptions.value,
      defaultValue: 'openai-compatible'
    }
  ],
  onSubmit: (data) => {
    const newProvider: Provider = {
      id: data.id!,
      name: data.name!,
      baseUrl: data.baseUrl!,
      providerType: data.providerType as Provider['providerType'],
      logo: '/images/providers/openai.png', // 使用默认图标
      models: [],
      apiKeys: [],
      apiKey: ''
    }
    addCustomProvider(newProvider)
    // 选中新添加的提供商
    nextTick(() => {
      setActiveProvider(newProvider.id)
    })
  }
})

const showAddCustomProviderModal = async () => {
  customProviderFormActions.reset()
  customProviderFormActions.setFieldsValue({ id: '', name: '', baseUrl: '', providerType: 'openai-compatible' })
  const result = await confirm({ title: '添加自定义提供商', content: CustomProviderForm })
  if (result) customProviderFormActions.submit()
}

const handleDeleteCustomProvider = async (provider: Provider) => {
  const result = await confirm({
    title: '删除自定义提供商',
    content: `确定要删除自定义提供商 "${provider.name}" 吗？此操作不可恢复。`
  })
  if (result) {
    removeCustomProvider(provider.id)
    // 如果删除的是当前选中的提供商，切换到第一个可用提供商
    if (activeProviderId.value === provider.id) {
      const firstProvider = visibleProviders.value[0]
      if (firstProvider) {
        setActiveProvider(firstProvider.id)
      }
    }
  }
}

const isCustomProvider = (provider: Provider) => {
  // 自定义提供商没有 pluginName 且不在默认的 provider.json 中
  return !provider.pluginName && !providerData.find(p => p.id === provider.id)
}

const searchKeyword = ref('')
const filteredModels = computed(() => {
  const models = activeProvider.value?.models || []
  if (!searchKeyword.value) return models
  const lower = searchKeyword.value.toLowerCase()
  return models.filter(m => m.name.toLowerCase().includes(lower) || m.id.toLowerCase().includes(lower))
})

const aiSearchModels = ref<Model[]>([])
const setAISearchValue = (values: Model[]) => { aiSearchModels.value = values }
const editingModelId = ref<string | null>(null)

const handleResetBaseUrl = async () => {
  if (!activeProvider.value) return
  const result = await confirm({
    title: '重置请求地址',
    content: `确定要将 ${activeProvider.value.name} 的请求地址重置为默认值吗？`
  })
  if (result) {
    resetProviderBaseUrl(activeProviderId.value)
    const updatedProvider = getAllProviders.value.find((p) => p.id === activeProviderId.value)
    if (updatedProvider) {
      formActions.setData({ ...activeProvider.value, baseUrl: updatedProvider.baseUrl })
    }
  }
}

const { registeredProviders } = storeToRefs(useSettingsStore())
const registeredPlugin = computed(() => registeredProviders.value.find(p => p.providerId === activeProviderId.value))

const ModelList = defineComponent({
  setup() {
    const showSearch = ref(false)
    const searchInputRef = useTemplateRef<HTMLInputElement>('searchInputRef')
    const handleShowSearch = async () => {
      showSearch.value = true
      await nextTick()
      searchInputRef.value?.focus()
    }
    return () => (
      <FormItem label="模型列表">
        {{
          label: () => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWrap: 'nowrap', height: '20px' }}>
              <span style={{ textWrap: 'nowrap' }}>模型列表</span>
              <Button onClick={showAddCustomModelModal} size="sm" type="button" variant="text">
                {Plus}
              </Button>
              {showSearch.value ? (
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
              ) : (
                <Button type="button" variant="text" size="sm" onClick={handleShowSearch}>
                  {Search}
                </Button>
              )}
            </div>
          ),
          tool: () => (
            <Button onClick={refreshModels} size="sm" type="button" variant="text">
              {Refresh} 刷新模型列表
            </Button>
          ),
          default: () => <ModelTable />
        }}
      </FormItem>
    )
  }
})

const [ProviderForm, formActions] = useForm({
  title: `${activeProvider.value?.name} 设置`,
  showHeader: false,
  fields: computed(() => [
    // { name: 'apiKey', type: 'password', label: 'API 密钥' },
    { name: 'apiKeys', render: () => <ApiKeyList />, type: 'custom' },
    {
      name: 'baseUrl',
      type: 'text',
      label: '基础 URL（可选）',
      placeholder: '例：https://api.openai.com/v1',
      rest: () => (
        <Button type="button" variant="text" size="sm" onClick={handleResetBaseUrl} title="重置为默认地址" class="ml-2">
          {Refresh}
        </Button>
      )
    },
    {
      name: 'providerType',
      type: 'select',
      label: '提供商类型',
      options: providerOptions.value
    },
    ...pluginFields.value,
    { name: 'models', render: () => <ModelList />, type: 'custom' }
  ] as FormField<Provider>[]),
  initialData: activeProvider.value,
  onChange: (_field, _value, data) => {
    if (activeProviderId.value) updateProvider(activeProviderId.value, data)
  }
})

const [CustomModelForm, customModelFormActions] = useForm({
  title: editingModelId.value ? '编辑模型' : '添加自定义模型',
  showHeader: false,
  fields: [
    { name: 'id', type: 'text', label: '模型 ID', required: true, placeholder: '例如：gpt-4-custom' },
    { name: 'name', type: 'text', label: '模型名称', placeholder: '例如：自定义 GPT-4 模型' },
    { name: 'description', type: 'text', label: '模型描述（可选）', placeholder: '描述此模型的特点和用途' },
    {
      name: 'category',
      type: 'select',
      label: '模型类型',
      options: [
        { value: 'text', label: '文本' },
        { value: 'embedding', label: '嵌入式' },
        { value: 'image', label: '图像' },
        { value: 'rerank', label: '重排' },
        { value: 'tts', label: '语音' },
        { value: 'video', label: '视频' }
      ]
    }
  ],
  onSubmit: (data) => handleSaveCustomModel(data)
})

const loading = ref(false)
const refreshModels = async () => {
  loading.value = true
  try {
    const models = await chatService().list_models({
      apiKey: activeProvider.value?.apiKey!,
      baseURL: activeProvider.value?.baseUrl!,
      providerType: activeProvider.value?.providerType!,
      name: activeProvider.value?.name
    })
    formActions.setFieldsValue({
      ...activeProvider.value!,
      models: models.map((m) => {
        const result = { category: 'text', ...m, name: m.id }
        if (result.id.toLowerCase().includes('embed') || result.name.toLowerCase().includes('embed')) result.category = 'embedding'
        if (result.id.toLowerCase().includes('rerank') || result.name.toLowerCase().includes('rerank')) result.category = 'rerank'
        if (result.id.toLowerCase().includes('tts') || result.id.toLowerCase().includes('speech') || result.name.toLowerCase().includes('tts') || result.name.toLowerCase().includes('speech')) result.category = 'tts'
        return result as Model
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
      models[index] = { ...models[index], ...data, active: models[index].active }
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
  customModelFormActions.setFieldsValue({ id: '', name: '', description: '', category: 'text' })
  const result = await confirm({ title: `添加自定义模型到 ${activeProvider.value.name}`, content: CustomModelForm })
  if (result) customModelFormActions.submit()
}

const showEditModelModal = async (row: Model) => {
  if (!activeProvider.value) return
  editingModelId.value = row.id
  customModelFormActions.setFieldsValue({ id: row.id, name: row.name, description: row.description || '', category: row.category || 'text' })
  const result = await confirm({ title: '编辑模型', content: CustomModelForm })
  if (result) customModelFormActions.submit()
}

const isCustomModel = (model: Model) => model.created && model.owned_by === activeProvider.value?.name

const handleDeleteModel = async (row: Model) => {
  if (!activeProvider.value) return
  if (!isCustomModel(row)) {
    messageApi.error('只能删除自定义模型')
    return
  }
  const result = await confirm({ title: '删除模型', content: `确定要删除模型 "${row.name}" 吗？此操作不可撤销。` })
  if (result) deleteModelFromProvider(activeProviderId.value, row.id)
}

const router = useRouter()
const route = useRoute()
const isDetailResult = computed(() => !!route.params.id)
const selectProvider = (providerId: string) => {
  setActiveProvider(providerId)
  if (isMobile.value) router.push(`/mobile/settings/models/${providerId}`)
}
const showList = computed(() => !isMobile.value || !isDetailResult.value)
const showForm = computed(() => !isMobile.value || isDetailResult.value)

const [ModelTable, modelTableActions] = useTable<Model>({
  loading: () => loading.value,
  columns: [
    {
      key: 'expand',
      label: '',
      width: '32px',
      render: (row) => row.voices && row.voices.length > 0 ? (
        <Button type="button" variant="text" size="sm" onClick={(e) => { e.stopPropagation(); modelTableActions.toggleExpand(row.id) }} style={{ padding: 0, width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {modelTableActions.isExpanded(row.id) ? ChevronDown : ChevronRight}
        </Button>
      ) : null
    },
    { key: 'name', label: '模型名称', width: '2fr' },
    { key: 'id', label: '模型ID', width: '2fr' },
    {
      key: 'category',
      label: '模型类型',
      width: '1fr',
      render: (row) => <Tags tags={[getCategoryLabel(row.category || 'text')]} color={row.category === 'text' ? 'blue' : row.category === 'embedding' ? 'green' : row.category === 'image' ? 'orange' : row.category === 'rerank' ? 'purple' : 'blue'} />
    },
    { key: 'active', label: '启用', width: '1fr', render: (row) => <Switch v-model={row.active} /> },
    {
      key: 'actions',
      label: '操作',
      width: '1fr',
      render: (row) => (
        <>
          <Button type="button" variant="text" size="sm" onClick={() => showEditModelModal(row)} title="编辑模型">{Edit}</Button>
          {isCustomModel(row) ? (
            <Button type="button" variant="text" size="sm" onClick={() => handleDeleteModel(row)} title="删除模型" class="text-red-500 hover:text-red-700">{Delete}</Button>
          ) : null}
        </>
      )
    }
  ],
  data: () => (aiSearchModels.value.length ? aiSearchModels.value : filteredModels.value),
  expandRender: (row) => <VoiceTable voices={row.voices} />
})

const VoiceTable = defineComponent({
  props: { voices: { type: Array as PropType<any[]>, default: () => [] } },
  setup(props) {
    const [Table] = useTable({
      columns: [
        { key: 'name', label: '声音名称', width: '2fr' },
        { key: 'id', label: '声音ID', width: '2fr', render: (row) => <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{row.id}</span> },
        { key: 'type', label: '类型', width: '1fr', render: () => <Tags tags={['语音']} color="purple" style={{ transform: 'scale(0.85)', transformOrigin: 'left' }} /> }
      ],
      data: () => props.voices
    })
    return () => <div class="voice-table-wrapper" style={{ padding: 0 }}><Table /></div>
  }
})
</script>

<template>
  <ListContainer v-if="showList">
    <List :defaultIcon="Box" title="提供商" :items="visibleProviders" :active-id="activeProviderId" @select="selectProvider">
      <template #title-tool>
        <Button type="button" variant="text" size="sm" @click="showAddCustomProviderModal" title="添加自定义提供商">
          <component :is="Plus" />
        </Button>
      </template>
      <template #actions="{ item }">
        <Button
          v-if="isCustomProvider(item)"
          type="button"
          variant="text"
          size="sm"
          class="text-red-500 hover:text-red-700"
          @click.stop="handleDeleteCustomProvider(item)"
          title="删除"
        >
          <component :is="Delete" />
        </Button>
      </template>
    </List>
  </ListContainer>

  <FormContainer v-if="showForm" header-title="模型提供商">
    <template #content>
      <div v-if="registeredPlugin?.form" class="p-4">
        <component :is="registeredPlugin.form" />
      </div>
      <ProviderForm v-else>
      </ProviderForm>
    </template>
  </FormContainer>
</template>

<style scoped>
.font-mono {
  font-family: var(--font-mono, monospace);
}

.text-xs {
  font-size: 12px;
}

.flex {
  display: flex;
}

.justify-end {
  justify-content: flex-end;
}

.gap-1 {
  gap: 4px;
}

.text-green-500 {
  color: #10b981;
}

.text-red-500 {
  color: #ef4444;
}

.items-center {
  align-items: center;
}

.voice-table-container {
  background: var(--bg-tertiary);
}

:deep(.expand-row) {
  padding: 0 !important;
}

:deep(.voice-table-wrapper .table-wrapper) {
  border: none !important;
  border-radius: 0 !important;
}

:deep(.voice-table-wrapper .table-cell),
:deep(.voice-table-wrapper .header-cell) {
  border-bottom: none !important;
}
</style>
