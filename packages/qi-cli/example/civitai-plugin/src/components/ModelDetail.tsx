import { PluginContext } from '../types'
import { createCivitai } from '../civitai/civitai-provider'
import { STORAGE_KEY } from '../constants'

interface ModelDetailProps {
  context: PluginContext
  row: any
  details: any
  onShowImageDetail: (image: any, currentDetails: any) => void
}

export const ModelDetail = (props: ModelDetailProps) => {
  const { vue, localforage, components } = props.context
  const { defineComponent, ref } = vue
  const { Select } = components

  const Component = defineComponent({
    setup() {
      const currentDetails = ref(props.details)
      const selectedVersionId = ref(props.details.id)
      const isLoading = ref(false)

      const handleVersionChange = async (value: any) => {
        const versionId = Number(value)
        selectedVersionId.value = versionId
        isLoading.value = true

        try {
          const savedConfig: any = await localforage.getItem(STORAGE_KEY)
          const provider = createCivitai({
            apiKey: savedConfig?.apiKey,
            pluginPath: props.context.basePath
          })
          if (provider.getModelVersion) {
            const newDetails = await provider.getModelVersion(versionId)
            currentDetails.value = newDetails
          }
        } catch (e) {
          console.error('Failed to fetch version details:', e)
        } finally {
          isLoading.value = false
        }
      }

      const versionOptions = props.row.versions?.map((v: any) => ({
        label: `${v.name} ${v.baseModel ? `(${v.baseModel})` : ''}`,
        value: v.id
      })) || []

      return () => (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            opacity: isLoading.value ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {/* 版本切换器 */}
          {props.row.versions && props.row.versions.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'var(--bg-secondary)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            >
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>模型版本:</strong>
              <Select
                modelValue={selectedVersionId.value}
                onUpdate:modelValue={handleVersionChange}
                options={versionOptions}
                size="sm"
                style={{ flex: 1 }}
                disabled={isLoading.value}
              />
              {isLoading.value && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    class="animate-spin"
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid var(--accent-color)',
                      borderTopColor: 'transparent',
                      borderRadius: '50%'
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    加载中...
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}>
            {(currentDetails.value.images || props.row.images)?.map((img: any, index: number) => {
              const url = typeof img === 'string' ? img : img.url
              return (
                <div key={url + index} style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    src={url}
                    onClick={() => props.onShowImageDetail(img, currentDetails.value)}
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
                <strong>类型:</strong> {props.row.type}
              </span>
              <span
                style={{
                  background: 'var(--bg-primary)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <strong>NSFW:</strong> {props.row.nsfw ? '是' : '否'}
              </span>
              <span
                style={{
                  background: 'var(--bg-primary)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <strong>下载量:</strong> {props.row.stats?.downloadCount?.toLocaleString() || 0}
              </span>
              {currentDetails.value.baseModel && (
                <span
                  style={{
                    background: 'var(--bg-primary)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <strong>基础模型:</strong> {currentDetails.value.baseModel}
                </span>
              )}
            </div>
            <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {props.row.tags?.map((tag: string) => (
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
            {(currentDetails.value.description || props.row.description) && (
              <div
                innerHTML={currentDetails.value.description || props.row.description}
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
    }
  })

  return <Component />
}


