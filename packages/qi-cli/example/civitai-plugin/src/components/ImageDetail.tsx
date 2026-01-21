import { PluginContext } from '../types'
import { mapScheduler, parseSize, parseAdditionalNetworks } from '../utils'
import { PROVIDER_ID, STORAGE_KEY } from '../constants'

interface ImageDetailProps {
  context: PluginContext
  image: any
  details: any
  row: any
  activeModelsMap: any
  updateProvider: () => Promise<void>
  setData: (data: any) => void
  getData: () => any
  imageDetailModal: any
  modal: any
}

export const ImageDetail = ({
  context,
  image,
  details,
  row,
  activeModelsMap,
  updateProvider,
  setData,
  getData,
  imageDetailModal,
  modal
}: ImageDetailProps) => {
  const { vue, localforage } = context
  const imageUrl = typeof image === 'string' ? image : image.url
  const meta = typeof image === 'string' ? null : image.meta

  const handleOneClickGenerate = async () => {
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
            item.versionId === row.versionId ? { ...item, active: true, id: currentModelAir } : item
          )
        )
      }

      // 查找 Civitai 提供商和模型
      const civitaiProvider = settingsStore.getAllProviders.find(
        (p: any) => p.providerId === PROVIDER_ID
      )
      if (!civitaiProvider) return

      const additionalNetworks = parseAdditionalNetworks(meta, details)

      // 填充表单
      const formData = {
        ...settingsStore.imageGenerationForm,
        model: {
          modelId: currentModelAir || civitaiProvider.models[0]?.id,
          providerId: civitaiProvider.id
        },
        prompt: meta.prompt || meta.Prompt || meta['Positive prompt'] || '',
        size: parseSize(meta),
        n: 1,
        seed: meta.seed || meta.Seed || meta.seed,
        providerOptions: {
          ...settingsStore.imageGenerationForm?.providerOptions,
          civitai: {
            negativePrompt: meta.negativePrompt || meta['Negative prompt'] || '',
            cfgScale: meta.cfgScale || meta['CFG scale'] || meta.cfg_scale,
            steps: meta.steps || meta.Steps || meta.steps,
            scheduler: mapScheduler(meta.sampler || meta.Sampler || meta.scheduler),
            clipSkip: meta.clipSkip || meta['Clip skip'] || meta.clip_skip,
            additionalNetworks:
              Object.keys(additionalNetworks).length > 0 ? additionalNetworks : undefined
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
  }

  const handleCopyAll = () => {
    const text = Object.entries(meta)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n')
    navigator.clipboard.writeText(text)
  }

  return (
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
        <img src={imageUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
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
              <context.components.Button size="xs" type="text" onClick={handleOneClickGenerate}>
                一键生成
              </context.components.Button>
              <context.components.Button size="xs" type="text" onClick={handleCopyAll}>
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
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
