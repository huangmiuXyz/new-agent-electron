import { Plugin, PluginContext } from './types'
import { createCivitai } from './civitai/civitai-provider'

const STORAGE_KEY = 'civitai-config'
const PROVIDER_ID = 'civitai'

const CivitaiPlugin: Plugin = {
  name: 'civitai-plugin',
  version: '1.0.0',
  description: 'Civitai AI Provider Plugin',
  author: 'Agent-Qi',
  updatedAt: '2026-01-19 12:00:00',

  install: async (context: PluginContext) => {
    const { vue, registerRegistry, registerProvider, useForm, useTable, localforage } = context

    const currentPage = vue.ref(1)
    const searchQuery = vue.ref('')
    const activeModelsMap = vue.ref({}) // { id: Model }
    const isLoading = vue.ref(false)
    const nextUrl = vue.ref(undefined)
    const historyUrls = vue.ref([])
    const currentUrl = vue.ref(undefined)

    const updateProvider = () => {
      registerProvider(PROVIDER_ID, {
        name: 'Civitai',
        form: ConfigForm,
        models: Object.values(activeModelsMap.value)
      })
    }

    const fetchModels = async (useUrl?: string) => {
      isLoading.value = true
      currentUrl.value = useUrl
      try {
        const saved = await localforage.getItem(STORAGE_KEY)
        const provider = createCivitai({
          apiKey: saved?.apiKey,
          pluginPath: context.basePath
        })
        if (provider.listModels) {
          const result = await provider.listModels({
            query: searchQuery.value,
            page: currentPage.value,
            limit: 10,
            nextUrl: useUrl
          })

          const models = result.items
          nextUrl.value = result.nextPage

          const formattedModels = models.map((m: any) => ({
            ...m,
            active: !!activeModelsMap.value[m.id]
          }))

          setData(formattedModels)
        }
      } catch (error) {
        console.error('Failed to fetch models:', error)
      } finally {
        isLoading.value = false
      }
    }

    const [TableComponent, { setData, getData }] = useTable({
      data: [],
      columns: () => [
        { key: 'name', label: '模型名称', width: '2fr' },
        { key: 'id', label: '模型ID', width: '1.5fr' },
        { key: 'owned_by', label: '作者', width: '1fr' },
        {
          key: 'active',
          label: '激活',
          width: '0.8fr',
          render: (row: any) =>
            context.components.Switch({
              modelValue: row.active,
              'onUpdate:modelValue': (val: boolean) => {
                const currentData = getData()
                const updatedData = currentData.map((item: any) =>
                  item.id === row.id ? { ...item, active: val } : item
                )
                setData(updatedData)
                if (val) {
                  activeModelsMap.value[row.id] = vue.toRaw(row)
                } else {
                  delete activeModelsMap.value[row.id]
                }

                localforage.getItem(STORAGE_KEY).then((saved) => {
                  const newData = { ...saved, activeModelsMap: vue.toRaw(activeModelsMap.value) }
                  localforage.setItem(STORAGE_KEY, newData)
                  updateProvider()
                })
              }
            })
        }
      ]
    })

    const [ConfigForm, formActions] = useForm({
      fields: [
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'password',
          required: true,
          placeholder: 'Enter your Civitai API Key',
          hint: 'You can get your API Key from Civitai settings.'
        },
        {
          name: 'search',
          label: '搜索模型',
          type: 'text',
          placeholder: '输入关键词搜索模型...'
        },
        {
          name: 'models',
          type: 'custom',
          render: () => {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <TableComponent />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '16px',
                    marginTop: '8px'
                  }}
                >
                  <context.components.Button
                    size="sm"
                    disabled={currentPage.value <= 1 || isLoading.value}
                    onClick={() => {
                      if (currentPage.value > 1) {
                        currentPage.value--
                        const prevUrl = historyUrls.value.pop()
                        fetchModels(prevUrl)
                      }
                    }}
                  >
                    上一页
                  </context.components.Button>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    第 {currentPage.value} 页
                  </span>
                  <context.components.Button
                    size="sm"
                    disabled={!nextUrl.value || isLoading.value}
                    onClick={() => {
                      if (nextUrl.value) {
                        historyUrls.value.push(currentUrl.value as any)
                        currentPage.value++
                        fetchModels(nextUrl.value)
                      }
                    }}
                  >
                    下一页
                  </context.components.Button>
                </div>
              </div>
            )
          }
        }
      ],
      onChange: (field: string, value: any, data: any) => {
        if (field === 'search') {
          searchQuery.value = value
          currentPage.value = 1
          nextUrl.value = undefined
          historyUrls.value = []
          fetchModels()
        }
        localforage.setItem(STORAGE_KEY, vue.toRaw(data))
      }
    })

    // 加载保存的配置
    localforage.getItem(STORAGE_KEY).then(async (saved: any) => {
      if (saved) {
        formActions.setFieldsValue(saved)
        if (saved.activeModelsMap) {
          activeModelsMap.value = saved.activeModelsMap
        }
      }
      updateProvider()
      await fetchModels()
    })

    registerRegistry(PROVIDER_ID, (options: any) => {
      return createCivitai({
        apiKey: options.apiKey,
        pluginPath: context.basePath,
        ...options
      })
    })

    // 3. 注册提供商到 UI
    registerProvider(PROVIDER_ID, {
      name: 'Civitai',
      form: ConfigForm,
      models: [
        {
          id: 'civitai-image',
          name: 'Civitai Image Generation',
          category: 'image'
        }
      ]
    })

    console.log('Civitai Plugin installed')
  },

  uninstall: async (context: PluginContext) => {
    context.unregisterProvider(PROVIDER_ID)
    console.log('Civitai Plugin uninstalled')
  }
}

export default CivitaiPlugin
