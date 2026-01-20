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
    const { vue, registerRegistry, registerProvider, useForm, useTable, useModal, localforage } = context

    const currentPage = vue.ref(1)
    const searchQuery = vue.ref('')
    const activeModelsMap = vue.ref({}) // { id: Model }
    const isLoading = vue.ref(false)
    const nextUrl = vue.ref(undefined)
    const historyUrls = vue.ref([])
    const currentUrl = vue.ref(undefined)

    const modal = useModal()

    const updateProvider = async () => {
      const saved: any = await localforage.getItem(STORAGE_KEY)
      console.log('Updating Civitai provider with config:', saved)
      const provider = createCivitai({
        apiKey: saved?.apiKey,
        pluginPath: context.basePath
      })

      const models = Object.values(activeModelsMap.value).map((m: any) => ({
        ...m,
        active: true
      }))
      console.log('Registering models:', models)

      // 使用 getStore 更新 settingsStore 中的 API Key
      try {
        const settingsStore = await context.getStore('settings')
        if (settingsStore) {
          // 查找是否已经注册过这个提供商
          const existing = settingsStore.registeredProviders.find(
            (p: any) => p.providerId === PROVIDER_ID
          )
          if (existing) {
            // 如果已存在，更新它的 apiKey
            // 注意：registeredProviders 是一个 ref 数组，我们需要更新它
            const index = settingsStore.registeredProviders.findIndex(
              (p: any) => p.providerId === PROVIDER_ID
            )
            if (index !== -1) {
              const updatedProviders = [...settingsStore.registeredProviders]
              updatedProviders[index] = {
                ...updatedProviders[index],
                apiKey: saved?.apiKey,
                models: models
              }
              settingsStore.registeredProviders = updatedProviders
              console.log('Updated settingsStore with new API Key and models')
            }
          }
        }
      } catch (e) {
        console.error('Failed to update settingsStore:', e)
      }

      registerProvider(PROVIDER_ID, {
        ...provider,
        name: 'Civitai',
        form: ConfigForm,
        models
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
      onRowClick: (row: any) => {
        modal.confirm({
          title: row.name,
          width: '80%',
          showCancel: false,
          confirmText: '关闭',
          content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                {row.images?.map((url: string) => (
                  <img
                    key={url}
                    src={url}
                    style={{
                      width: '180px',
                      height: '240px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      flexShrink: 0
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                <div style={{ marginBottom: '12px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ background: 'var(--bg-primary)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <strong>类型:</strong> {row.type}
                  </span>
                  <span style={{ background: 'var(--bg-primary)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <strong>NSFW:</strong> {row.nsfw ? '是' : '否'}
                  </span>
                  <span style={{ background: 'var(--bg-primary)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <strong>下载量:</strong> {row.stats?.downloadCount?.toLocaleString() || 0}
                  </span>
                </div>
                <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {row.tags?.map((tag: string) => (
                    <span key={tag} style={{ background: 'var(--accent-color-soft)', color: 'var(--accent-color)', padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '500' }}>
                      {tag}
                    </span>
                  ))}
                </div>
                {row.description && (
                  <div
                    innerHTML={row.description}
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '16px',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      lineHeight: '1.6',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)'
                    }}
                  />
                )}
              </div>
            </div>
          )
        })
      },
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

                localforage.getItem(STORAGE_KEY).then((saved: any) => {
                  const newData = { ...saved, activeModelsMap: vue.toRaw(activeModelsMap.value) }
                  localforage.setItem(STORAGE_KEY, newData).then(() => {
                    updateProvider()
                  })
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
        localforage.getItem(STORAGE_KEY).then((saved: any) => {
          const newData = { ...saved, ...vue.toRaw(data), activeModelsMap: vue.toRaw(activeModelsMap.value) }
          localforage.setItem(STORAGE_KEY, newData).then(() => {
            updateProvider()
          })
        })
      }
    })

    // 1. 注册提供商
    registerRegistry(PROVIDER_ID, (options: any) => {
      return createCivitai({
        apiKey: options.apiKey,
        pluginPath: context.basePath,
        ...options
      })
    })

    // 加载保存的配置
    const saved: any = await localforage.getItem(STORAGE_KEY)
    if (saved) {
      formActions.setFieldsValue(saved)
      if (saved.activeModelsMap) {
        activeModelsMap.value = saved.activeModelsMap
      }
    }

    // 注册提供商到 UI
    await updateProvider()

    // 初始加载模型列表
    fetchModels()

    console.log('Civitai Plugin installed')
  },

  uninstall: async (context: PluginContext) => {
    context.unregisterProvider(PROVIDER_ID)
    console.log('Civitai Plugin uninstalled')
  }
}

export default CivitaiPlugin
