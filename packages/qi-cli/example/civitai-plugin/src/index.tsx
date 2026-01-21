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
    const { vue, registerRegistry, registerProvider, useForm, useTable, useModal, localforage } =
      context

    const currentPage = vue.ref(1)
    const searchQuery = vue.ref('')
    const activeModelsMap = vue.ref({}) // { id: Model }
    const isLoading = vue.ref(false)
    const nextUrl = vue.ref(undefined)
    const historyUrls = vue.ref([])
    const currentUrl = vue.ref(undefined)

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
      onRowClick: async (row: any) => {
        let details = row
        if (row.versionId) {
          try {
            // 设置表格行加载状态（如果支持）
            const currentData = getData()
            setData(
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
            const currentData = getData()
            setData(
              currentData.map((item: any) =>
                item.versionId === row.versionId ? { ...item, loading: false } : item
              )
            )
          }
        }

        const showImageDetail = (image: any) => {
          const imageUrl = typeof image === 'string' ? image : image.url
          const meta = typeof image === 'string' ? null : image.meta

          imageDetailModal.confirm({
            title: '图片详情',
            width: '90%',
            showCancel: false,
            confirmText: '关闭',
            content: (
              <div style={{ display: 'flex', gap: '20px', height: '70vh' }}>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  <img
                    src={imageUrl}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                  {typeof image === 'object' && image.width && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        right: '12px',
                        background: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      {image.width} x {image.height}
                    </div>
                  )}
                </div>
                {meta && (
                  <div
                    style={{
                      width: '350px',
                      overflowY: 'auto',
                      padding: '16px',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: '14px' }}>生成参数</h4>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <context.components.Button
                          size="xs"
                          type="text"
                          onClick={async () => {
                            try {
                              const settingsStore = await context.getStore('settings')
                              if (!settingsStore) return

                              // 获取当前选择的模型版本 AIR
                              const currentModelAir = details.air

                              // 自动激活模型
                              if (currentModelAir && !activeModelsMap.value[currentModelAir]) {
                                const modelToActivate = {
                                  ...row,
                                  id: currentModelAir,
                                  active: true,
                                  loading: false
                                }
                                activeModelsMap.value[currentModelAir] = vue.toRaw(modelToActivate)

                                // 同步到本地存储并更新提供商
                                const saved: any = await localforage.getItem(STORAGE_KEY)
                                const newData = {
                                  ...saved,
                                  activeModelsMap: vue.toRaw(activeModelsMap.value)
                                }
                                await localforage.setItem(STORAGE_KEY, newData)
                                await updateProvider()

                                // 更新表格数据中的激活状态
                                const currentData = getData()
                                setData(
                                  currentData.map((item: any) =>
                                    item.versionId === row.versionId
                                      ? { ...item, active: true, id: currentModelAir }
                                      : item
                                  )
                                )
                              }

                              // 查找 Civitai 提供商和模型
                              const civitaiProvider = settingsStore.getAllProviders.find(
                                (p: any) => p.providerId === PROVIDER_ID
                              )
                              if (!civitaiProvider) return

                              // 映射调度器
                              const mapScheduler = (sampler: string) => {
                                if (!sampler) return 'EulerA'
                                // 移除空格和特殊字符进行匹配
                                const s = sampler.toLowerCase().replace(/[^a-z0-9+]/g, '')

                                if (s.includes('eulera')) return 'EulerA'
                                if (s.includes('euler')) return 'Euler'

                                // DPM++ 系列
                                if (s.includes('dpm++2sakarras') || s.includes('dpm2sakarras'))
                                  return 'DPM2SAKarras'
                                if (s.includes('dpm++2mkarras') || s.includes('dpm2mkarras'))
                                  return 'DPM2MKarras'
                                if (s.includes('dpm++sdekarras') || s.includes('dpmsdekarras'))
                                  return 'DPMSDEKarras'
                                if (s.includes('dpm++2sa') || s.includes('dpm2sa')) return 'DPM2SA'
                                if (s.includes('dpm++2m') || s.includes('dpm2m')) return 'DPM2M'
                                if (s.includes('dpm++sde') || s.includes('dpmsde')) return 'DPMSDE'

                                // DPM2 系列
                                if (s.includes('dpm2akarras')) return 'DPM2AKarras'
                                if (s.includes('dpm2a')) return 'DPM2A'
                                if (s.includes('dpm2karras')) return 'DPM2Karras'
                                if (s.includes('dpm2')) return 'DPM2'

                                // 其他
                                if (s.includes('lmskarras')) return 'LMSKarras'
                                if (s.includes('lms')) return 'LMS'
                                if (s.includes('heun')) return 'Heun'
                                if (s.includes('dpmfast')) return 'DPMFast'
                                if (s.includes('dpmadaptive')) return 'DPMAdaptive'
                                if (s.includes('ddim')) return 'DDIM'
                                if (s.includes('plms')) return 'PLMS'
                                if (s.includes('unipc')) return 'UniPC'
                                if (s.includes('lcm')) return 'LCM'
                                if (s.includes('ddpm')) return 'DDPM'
                                if (s.includes('deis')) return 'DEIS'

                                return 'EulerA'
                              }

                              // 解析尺寸
                              const parseSize = () => {
                                const rawSize = meta.Size || meta.size
                                if (rawSize && typeof rawSize === 'string') {
                                  // 处理 "512x768" 格式
                                  if (rawSize.includes('x')) return rawSize
                                  // 处理 "512, 768" 格式
                                  if (rawSize.includes(','))
                                    return rawSize.replace(/\s/g, '').replace(',', 'x')
                                }
                                // 处理独立的 width 和 height 字段
                                const w = meta.width || meta.Width || meta.ADetailer_inpaint_width
                                const h =
                                  meta.height || meta.Height || meta.ADetailer_inpaint_height
                                if (w && h) return `${w}x${h}`

                                return '1024x1024'
                              }

                              // 处理 additionalNetworks (Lora, Vae, Hypernetwork 等)
                              const additionalNetworks: any = {}
                              const typeMap: any = {
                                lora: 'Lora',
                                locon: 'LoCon',
                                vae: 'Vae',
                                hypernetwork: 'Hypernetwork',
                                textualinversion: 'TextualInversion',
                                lycoris: 'Lycoris',
                                checkpoint: 'Checkpoint'
                              }

                              if (meta.resources && Array.isArray(meta.resources)) {
                                meta.resources.forEach((res: any) => {
                                  const mappedType = typeMap[res.type?.toLowerCase()]
                                  if (mappedType) {
                                    // 优先使用 AIR，如果没有则尝试构造
                                    let air = res.air
                                    if (!air && res.id && res.versionId) {
                                      const base = (details.baseModel || '')
                                        .toLowerCase()
                                        .includes('sdxl')
                                        ? 'sdxl'
                                        : 'sd1'
                                      const type = res.type.toLowerCase()
                                      air = `urn:air:${base}:${type}:civitai:${res.id}@${res.versionId}`
                                    }
                                    if (air) {
                                      additionalNetworks[air] = {
                                        type: mappedType,
                                        strength: res.weight || 1
                                      }
                                    }
                                  }
                                })
                              }
                              // 填充表单
                              const formData = {
                                ...settingsStore.imageGenerationForm,
                                model: {
                                  modelId: currentModelAir || civitaiProvider.models[0]?.id,
                                  providerId: civitaiProvider.id
                                },
                                prompt: meta.prompt || meta.Prompt || meta['Positive prompt'] || '',
                                size: parseSize(),
                                n: 1,
                                seed: meta.seed || meta.Seed || meta.seed,
                                providerOptions: {
                                  ...settingsStore.imageGenerationForm?.providerOptions,
                                  civitai: {
                                    negativePrompt:
                                      meta.negativePrompt || meta['Negative prompt'] || '',
                                    cfgScale: meta.cfgScale || meta['CFG scale'] || meta.cfg_scale,
                                    steps: meta.steps || meta.Steps || meta.steps,
                                    scheduler: mapScheduler(
                                      meta.sampler || meta.Sampler || meta.scheduler
                                    ),
                                    clipSkip: meta.clipSkip || meta['Clip skip'] || meta.clip_skip,
                                    additionalNetworks:
                                      Object.keys(additionalNetworks).length > 0
                                        ? additionalNetworks
                                        : undefined
                                  }
                                }
                              }

                              settingsStore.updateImageGenerationForm(formData)

                              // 关闭弹窗
                              imageDetailModal.remove()
                              modal.remove()

                              // 跳转到图片生成页面
                              const router = context.router
                              if (router) {
                                router.push('/image')
                              }
                            } catch (e) {
                              console.error('Failed to generate with one-click:', e)
                            }
                          }}
                        >
                          一键生成
                        </context.components.Button>
                        <context.components.Button
                          size="xs"
                          type="text"
                          onClick={() => {
                            const text = Object.entries(meta)
                              .map(
                                ([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
                              )
                              .join('\n')
                            navigator.clipboard.writeText(text)
                          }}
                        >
                          复制全部
                        </context.components.Button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {Object.entries(meta).map(([key, value]: [string, any]) => (
                        <div key={key}>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-tertiary)',
                              marginBottom: '2px',
                              fontWeight: 'bold'
                            }}
                          >
                            {key.toUpperCase()}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-primary)',
                              wordBreak: 'break-all',
                              whiteSpace: 'pre-wrap',
                              background: 'var(--bg-secondary)',
                              padding: '8px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            {typeof value === 'object'
                              ? JSON.stringify(value, null, 2)
                              : String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        }

        modal.confirm({
          title: row.name,
          width: '80%',
          showCancel: false,
          confirmText: '关闭',
          content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}
              >
                {(details.images || row.images)?.map((img: any, index: number) => {
                  const url = typeof img === 'string' ? img : img.url
                  return (
                    <div key={url + index} style={{ position: 'relative', flexShrink: 0 }}>
                      <img
                        src={url}
                        onClick={() => showImageDetail(img)}
                        style={{
                          width: '180px',
                          height: '240px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          cursor: 'zoom-in',
                          transition: 'transform 0.2s'
                        }}
                        onMouseover={(e: any) => (e.currentTarget.style.transform = 'scale(1.02)')}
                        onMouseout={(e: any) => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                      {img.nsfw && img.nsfw !== 'None' && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'rgba(255,0,0,0.7)',
                            color: 'white',
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}
                        >
                          NSFW
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                <div
                  style={{
                    marginBottom: '12px',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <span
                    style={{
                      background: 'var(--bg-primary)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <strong>类型:</strong> {row.type}
                  </span>
                  <span
                    style={{
                      background: 'var(--bg-primary)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <strong>NSFW:</strong> {row.nsfw ? '是' : '否'}
                  </span>
                  <span
                    style={{
                      background: 'var(--bg-primary)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <strong>下载量:</strong> {row.stats?.downloadCount?.toLocaleString() || 0}
                  </span>
                  {details.baseModel && (
                    <span
                      style={{
                        background: 'var(--bg-primary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <strong>基础模型:</strong> {details.baseModel}
                    </span>
                  )}
                </div>
                <div
                  style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}
                >
                  {row.tags?.map((tag: string) => (
                    <span
                      key={tag}
                      style={{
                        background: 'var(--accent-color-soft)',
                        color: 'var(--accent-color)',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                {(details.description || row.description) && (
                  <div
                    innerHTML={details.description || row.description}
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
        {
          key: 'version',
          label: '版本',
          width: '1.5fr',
          render: (row: any) => (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            >
              <select
                disabled={row.loading}
                value={row.versionId}
                onChange={async (e) => {
                  const target = e.target as HTMLSelectElement
                  const newVersionId = Number(target.value)
                  const oldVersionId = row.versionId
                  const selectedVersion = row.versions.find((v: any) => v.id === newVersionId)
                  if (!selectedVersion) return

                  const currentData = getData()
                  const isCurrentlyActive = row.active

                  // 设置 loading 状态
                  setData(
                    currentData.map((item: any) =>
                      item.modelId === row.modelId ? { ...item, loading: true } : item
                    )
                  )

                  try {
                    // 如果当前是激活状态，需要先取消旧版本的激活，再激活新版本（或者保持激活但更新 ID）
                    let newId = String(row.modelId)

                    if (isCurrentlyActive) {
                      // 如果已激活，尝试获取新版本的 AIR
                      const saved: any = await localforage.getItem(STORAGE_KEY)
                      const provider = createCivitai({
                        apiKey: saved?.apiKey,
                        pluginPath: context.basePath
                      })
                      if (provider.getModelVersion) {
                        const versionInfo = await provider.getModelVersion(newVersionId)
                        if (versionInfo.air) {
                          newId = versionInfo.air
                        } else {
                          throw new Error('No AIR found for this version')
                        }
                      }
                    }

                    const updatedRow = {
                      ...row,
                      id: newId,
                      versionId: newVersionId,
                      images: selectedVersion.images || row.images,
                      description: selectedVersion.description || row.description,
                      loading: false
                    }

                    const updatedData = getData().map((item: any) =>
                      item.modelId === row.modelId ? updatedRow : item
                    )
                    setData(updatedData)

                    if (isCurrentlyActive) {
                      // 更新 activeModelsMap
                      const oldKeyToDelete = Object.keys(activeModelsMap.value).find(
                        (key) => activeModelsMap.value[key].modelId === row.modelId
                      )
                      if (oldKeyToDelete) {
                        delete activeModelsMap.value[oldKeyToDelete]
                      }
                      activeModelsMap.value[newId] = vue.toRaw(updatedRow)

                      localforage.getItem(STORAGE_KEY).then((saved: any) => {
                        const newData = {
                          ...saved,
                          activeModelsMap: vue.toRaw(activeModelsMap.value)
                        }
                        localforage.setItem(STORAGE_KEY, newData).then(() => {
                          updateProvider()
                        })
                      })
                    }
                  } catch (err) {
                    console.error('Failed to switch version:', err)
                    // 失败回滚：恢复原版本 ID 和 loading 状态
                    const rollbackData = getData().map((item: any) =>
                      item.modelId === row.modelId ? { ...row, loading: false } : item
                    )
                    setData(rollbackData)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  opacity: row.loading ? 0.6 : 1,
                  cursor: row.loading ? 'not-allowed' : 'pointer'
                }}
              >
                {row.versions?.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )
        },
        { key: 'owned_by', label: '作者', width: '1fr' },
        {
          key: 'active',
          label: '激活',
          width: '0.8fr',
          render: (row: any) => (
            <div onClick={(e) => e.stopPropagation()}>
              {context.components.Switch({
                modelValue: row.active,
                loading: row.loading,
                'onUpdate:modelValue': async (val: boolean) => {
                  const currentData = getData()
                  // 设置 loading 状态
                  setData(
                    currentData.map((item: any) =>
                      item.versionId === row.versionId ? { ...item, loading: true } : item
                    )
                  )

                  try {
                    let updatedRow = { ...row, active: val, loading: false }

                    if (val && row.versionId) {
                      const saved: any = await localforage.getItem(STORAGE_KEY)
                      const provider = createCivitai({
                        apiKey: saved?.apiKey,
                        pluginPath: context.basePath
                      })
                      if (provider.getModelVersion) {
                        const versionInfo = await provider.getModelVersion(row.versionId)
                        if (versionInfo.air) {
                          updatedRow.id = versionInfo.air
                        } else {
                          throw new Error('No AIR found for this version')
                        }
                      }
                    } else {
                      // 如果取消激活，还原 ID 为原始 ID
                      updatedRow.id = String(row.modelId)
                    }

                    const finalData = getData().map((item: any) =>
                      item.versionId === row.versionId ? updatedRow : item
                    )
                    setData(finalData)

                    if (val) {
                      activeModelsMap.value[updatedRow.id] = vue.toRaw(updatedRow)
                    } else {
                      // 查找并删除具有相同 versionId 的模型
                      const keyToDelete = Object.keys(activeModelsMap.value).find(
                        (key) => activeModelsMap.value[key].versionId === row.versionId
                      )
                      if (keyToDelete) {
                        delete activeModelsMap.value[keyToDelete]
                      }
                    }

                    localforage.getItem(STORAGE_KEY).then((saved: any) => {
                      const newData = {
                        ...saved,
                        activeModelsMap: vue.toRaw(activeModelsMap.value)
                      }
                      localforage.setItem(STORAGE_KEY, newData).then(() => {
                        updateProvider()
                      })
                    })
                  } catch (e) {
                    console.error('Failed to update activation state:', e)
                    // 失败回滚：恢复原状态并关闭 loading
                    const rollbackData = getData().map((item: any) =>
                      item.versionId === row.versionId
                        ? { ...row, active: !val, loading: false }
                        : item
                    )
                    setData(rollbackData)
                  }
                }
              })}
            </div>
          )
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
