import { PluginContext } from '../types'

interface ModelDetailProps {
  context: PluginContext
  row: any
  details: any
  onShowImageDetail: (image: any) => void
}

export const ModelDetail = ({ context, row, details, onShowImageDetail }: ModelDetailProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}>
        {(details.images || row.images)?.map((img: any, index: number) => {
          const url = typeof img === 'string' ? img : img.url
          return (
            <div key={url + index} style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={url}
                onClick={() => onShowImageDetail(img)}
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
        <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
}
