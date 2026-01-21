import { Plugin, PluginContext } from './types'
import { createCivitai } from './civitai/civitai-provider'
import { STORAGE_KEY, PROVIDER_ID } from './constants'
import { ImageDetail } from './components/ImageDetail'
import { ModelDetail } from './components/ModelDetail'
import { getFormFields, getFilterFormFields } from './config/form-fields'
import { getTableColumns } from './config/table-columns'
import { debounce } from './utils'

const CivitaiPlugin: Plugin = {
  name: 'civitai-plugin',
  version: '1.0.0',
  description: 'Civitai AI Provider Plugin',
  author: 'Agent-Qi',
  updatedAt: '2026-01-19 12:00:00',

  install: async (context: PluginContext) => {
    const { vue, registerRegistry, registerProvider, useForm, useTable, useModal, localforage } =
      context

    const currentPage = vue.ref(1)
    const activeModelsMap = vue.ref({}) // { id: Model }
    const isLoading = vue.ref(false)
    const nextUrl = vue.ref(undefined)
    const historyUrls = vue.ref([])
    const currentUrl = vue.ref(undefined)

    // 加载保存的配置
    const savedConfig: any = await localforage.getItem(STORAGE_KEY)

    // 筛选参数
    const filters = vue.ref({
      query: savedConfig?.query || '',
      types: savedConfig?.types || '',
      sort: savedConfig?.sort || 'Highest Rated',
      period: savedConfig?.period || 'AllTime',
      tag: savedConfig?.tag || '',
      username: savedConfig?.username || '',
      rating:
        savedConfig?.rating !== undefined && savedConfig?.rating !== ''
          ? Number(savedConfig?.rating)
          : '',
      favorites: savedConfig?.favorites === 'true' || savedConfig?.favorites === true,
      hidden: savedConfig?.hidden === 'true' || savedConfig?.hidden === true,
      primaryFileOnly: savedConfig?.primaryFileOnly === 'true' || savedConfig?.primaryFileOnly === true,
      allowNoCredit: savedConfig?.allowNoCredit === 'true' || savedConfig?.allowNoCredit === true,
      allowDerivatives: savedConfig?.allowDerivatives === 'true' || savedConfig?.allowDerivatives === true,
      allowDifferentLicenses:
        savedConfig?.allowDifferentLicenses === 'true' || savedConfig?.allowDifferentLicenses === true,
      supportsGeneration:
        savedConfig?.supportsGeneration === 'true' || savedConfig?.supportsGeneration === true
    })

    if (savedConfig?.activeModelsMap) {
      activeModelsMap.value = savedConfig.activeModelsMap
    }

    const modal = useModal()
    const imageDetailModal = useModal()

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

    const tableActions = {
      setData: (data: any[]) => {},
      getData: () => [] as any[]
    }

    const [TableComponent, actions] = useTable({
      data: [],
      onRowClick: async (row: any) => {
        let details = row
        if (row.versionId) {
          try {
            // 设置表格行加载状态
            const currentData = tableActions.getData()
            tableActions.setData(
              currentData.map((item: any) =>
                item.versionId === row.versionId ? { ...item, loading: true } : item
              )
            )

            const saved: any = await localforage.getItem(STORAGE_KEY)
            const provider = createCivitai({
              apiKey: saved?.apiKey,
              pluginPath: context.basePath
            })
            if (provider.getModelVersion) {
              details = await provider.getModelVersion(row.versionId)
            }
          } catch (e) {
            console.error('Failed to fetch model details:', e)
          } finally {
            const currentData = tableActions.getData()
            tableActions.setData(
              currentData.map((item: any) =>
                item.versionId === row.versionId ? { ...item, loading: false } : item
              )
            )
          }
        }

        const showImageDetail = (image: any) => {
          imageDetailModal.confirm({
            title: '图片详情',
            width: '90%',
            showCancel: false,
            confirmText: '关闭',
            content: (
              <ImageDetail
                context={context}
                image={image}
                details={details}
                row={row}
                activeModelsMap={activeModelsMap}
                updateProvider={updateProvider}
                setData={(data) => tableActions.setData(data)}
                getData={() => tableActions.getData()}
                imageDetailModal={imageDetailModal}
                modal={modal}
              />
            )
          })
        }

        modal.confirm({
          title: row.name,
          width: '80%',
          showCancel: false,
          confirmText: '关闭',
          content: (
            <ModelDetail
              context={context}
              row={row}
              details={details}
              onShowImageDetail={showImageDetail}
            />
          )
        })
      },
      columns: () =>
        getTableColumns({
          context,
          getData: () => tableActions.getData(),
          setData: (data) => tableActions.setData(data),
          activeModelsMap,
          updateProvider,
          STORAGE_KEY,
          PROVIDER_ID
        })
    })

    tableActions.setData = actions.setData
    tableActions.getData = actions.getData

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
          // 彻底转换布尔值为标准布尔类型，防止字符串残留
          const booleanFields = [
            'favorites',
            'hidden',
            'primaryFileOnly',
            'allowNoCredit',
            'allowDerivatives',
            'allowDifferentLicenses',
            'supportsGeneration'
          ]
          const cleanFilters: any = {}
          Object.entries(filters.value).forEach(([key, value]) => {
            if (booleanFields.includes(key)) {
              cleanFilters[key] = value === 'true' || value === true
            } else if (value !== '' && value !== undefined && value !== null) {
              cleanFilters[key] = value
            }
          })

          const result = await provider.listModels({
            ...cleanFilters,
            limit: 10,
            nextUrl: useUrl
          })

          const models = result.items
          nextUrl.value = result.nextPage

          const formattedModels = models.map((m: any) => {
            // 检查模型是否已激活。由于存储的 ID 可能是 AIR 格式，我们需要通过 versionId 来匹配
            const activeModel: any = Object.values(activeModelsMap.value).find(
              (am: any) => am.versionId === m.versionId
            )
            return {
              ...m,
              id: activeModel ? activeModel.id : m.id,
              active: !!activeModel,
              loading: false
            }
          })

          tableActions.setData(formattedModels)
        }
      } catch (error) {
        console.error('Failed to fetch models:', error)
      } finally {
        isLoading.value = false
      }
    }

    const [FilterForm, filterFormActions] = useForm({
      fields: getFilterFormFields(),
      initialData: vue.toRaw(filters.value)
    })

    const FilterButton = () => {
      console.log('Rendering FilterButton')
      const FilterIcon = context.useIcon('Filter')
      const filterModal = useModal()
      return (
        <div
          class="filter-button"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            transition: 'all 0.2s',
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            flexShrink: 0
          }}
          onClick={(e) => {
            console.log('FilterButton clicked')
            e.preventDefault()
            e.stopPropagation()
            // 每次打开弹窗前更新表单数据为当前 filters 的值
            filterFormActions.setFieldsValue(vue.toRaw(filters.value))
            filterModal.confirm({
              title: '高级筛选',
              width: '500px',
              showCancel: true,
              cancelText: '取消',
              confirmText: '确定',
              content: <FilterForm />,
              onOk: async () => {
                const data = filterFormActions.getData()
                const booleanFields = [
                  'favorites',
                  'hidden',
                  'primaryFileOnly',
                  'allowNoCredit',
                  'allowDerivatives',
                  'allowDifferentLicenses',
                  'supportsGeneration'
                ]

                const processedData = { ...data }
                booleanFields.forEach((f) => {
                  if (f in processedData) {
                    processedData[f] = processedData[f] === 'true' || processedData[f] === true
                  }
                })

                if (processedData.rating !== undefined && processedData.rating !== '') {
                  processedData.rating = Number(processedData.rating)
                }

                // 更新 filters
                filters.value = {
                  ...filters.value,
                  ...processedData
                }

                currentPage.value = 1
                nextUrl.value = undefined
                historyUrls.value = []

                // 保存到本地
                const saved: any = await localforage.getItem(STORAGE_KEY)
                const newData = {
                  ...saved,
                  ...processedData,
                  activeModelsMap: vue.toRaw(activeModelsMap.value)
                }
                await localforage.setItem(STORAGE_KEY, newData)
                await updateProvider()
                await fetchModels()

                // 关闭弹窗
                filterModal.remove()
              }
            })
          }}
        >
          {FilterIcon}
        </div>
      )
    }

    const [ConfigForm, formActions] = useForm({
      fields: [
        {
          name: 'apiKey',
          label: 'API Key',
          type: 'text',
          placeholder: '输入你的 Civitai API Key (可选)...',
          hint: '部分高级筛选功能需要 API Key 才能使用。你可以在 Civitai 设置中生成。'
        },
        {
          name: 'query',
          label: '搜索关键词',
          type: 'text',
          placeholder: '输入关键词搜索模型...',
          rest: () => <FilterButton />
        },
        {
          name: 'models',
          type: 'custom',
          render: () => (
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
      ],
      initialData: {
        ...filters.value,
        apiKey: savedConfig?.apiKey || ''
      },
      onChange: (field: string, value: any, data: any) => {
        if (field === 'query') {
          filters.value = {
            ...filters.value,
            query: value
          }
          currentPage.value = 1
          nextUrl.value = undefined
          historyUrls.value = []
          debouncedFetchModels()
        }

        if (field === 'apiKey') {
          // 处理 API Key 变更
          localforage.getItem(STORAGE_KEY).then((saved: any) => {
            const newData = {
              ...saved,
              apiKey: value
            }
            localforage.setItem(STORAGE_KEY, newData).then(() => {
              updateProvider()
              fetchModels() // 重新加载以应用 API Key
            })
          })
          return
        }

        localforage.getItem(STORAGE_KEY).then((saved: any) => {
          const newData = {
            ...saved,
            ...vue.toRaw(data),
            activeModelsMap: vue.toRaw(activeModelsMap.value)
          }
          localforage.setItem(STORAGE_KEY, newData).then(() => {
            updateProvider()
          })
        })
      }
    })

    const debouncedFetchModels = debounce(() => {
      fetchModels()
    }, 500)

    // 1. 注册提供商工厂
    registerRegistry(PROVIDER_ID, (options: any) => {
      return createCivitai({
        apiKey: options.apiKey,
        pluginPath: context.basePath,
        ...options
      })
    })

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
