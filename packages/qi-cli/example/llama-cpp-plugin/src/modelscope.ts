export const MODELSCOPE_BASE_URL = 'https://www.modelscope.cn'
const MODELSCOPE_FALLBACK_ORGS = ['Qwen', 'LLM-Research', 'deepseek-ai', 'baichuan-inc']

interface ModelScopeListItem {
  Name?: string
  Path?: string
  ChineseName?: string
  Description?: string
  Avatar?: string
  CoverImages?: string[]
  Downloads?: number
  Stars?: number
  LastUpdatedTime?: number
  ReadMeContent?: string
}

interface ModelScopeListResponse {
  Success?: boolean
  Data?: {
    Models?: ModelScopeListItem[]
    TotalCount?: number
  }
}

interface ModelScopeDetailResponse {
  Success?: boolean
  Data?: ModelScopeListItem
}

export interface RemoteModelCard {
  id: string
  name: string
  org: string
  description: string
  avatar: string
  downloads: number
  stars: number
  updatedAt: number
  readme: string
}

const toRemoteModelId = (item: ModelScopeListItem): string => {
  const org = String(item.Path || '').trim()
  const name = String(item.Name || '').trim()
  if (!org || !name) return ''
  return `${org}/${name}`
}

const mapRemoteModel = (item: ModelScopeListItem, fallbackAvatar: string): RemoteModelCard | null => {
  const id = toRemoteModelId(item)
  if (!id) return null
  const avatar = String(item.Avatar || item.CoverImages?.[0] || fallbackAvatar).trim() || fallbackAvatar
  return {
    id,
    name: String(item.ChineseName || item.Name || id).trim() || id,
    org: String(item.Path || '').trim(),
    description: String(item.Description || '').trim(),
    avatar,
    downloads: Number(item.Downloads || 0),
    stars: Number(item.Stars || 0),
    updatedAt: Number(item.LastUpdatedTime || 0),
    readme: String(item.ReadMeContent || '').trim()
  }
}

const fetchModelScopeModelsByOrg = async (
  org: string,
  fallbackAvatar: string,
  pageNumber = 1,
  pageSize = 24
): Promise<RemoteModelCard[]> => {
  const res = await fetch(`${MODELSCOPE_BASE_URL}/api/v1/models/`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      Path: org,
      PageNumber: pageNumber,
      PageSize: pageSize
    })
  })
  if (!res.ok) return []
  const json = await res.json() as ModelScopeListResponse
  const list = Array.isArray(json?.Data?.Models) ? json.Data.Models : []
  return list.map((item) => mapRemoteModel(item, fallbackAvatar)).filter((item): item is RemoteModelCard => Boolean(item))
}

export const searchModelScopeModels = async (
  queryRaw: string,
  fallbackAvatar: string
): Promise<RemoteModelCard[]> => {
  const query = String(queryRaw || '').trim()
  const queryLower = query.toLowerCase()
  const preferredOrg = (query.includes('/') ? query.split('/')[0] : query) || MODELSCOPE_FALLBACK_ORGS[0]
  const orgs = [preferredOrg, ...MODELSCOPE_FALLBACK_ORGS.filter((org) => org !== preferredOrg)].slice(0, 4)
  const unique = new Map<string, RemoteModelCard>()

  for (const org of orgs) {
    const rows = await fetchModelScopeModelsByOrg(org, fallbackAvatar, 1, 20).catch(() => [])
    for (const row of rows) {
      const searchable = `${row.id} ${row.name} ${row.description}`.toLowerCase()
      if (queryLower && !searchable.includes(queryLower)) continue
      if (!unique.has(row.id)) {
        unique.set(row.id, row)
      }
    }
    if (unique.size >= 30) break
  }

  return [...unique.values()]
    .sort((a, b) => (b.downloads - a.downloads) || (b.stars - a.stars) || (b.updatedAt - a.updatedAt))
    .slice(0, 30)
}

export const fetchModelScopeModelDetail = async (
  modelId: string,
  fallbackAvatar: string
): Promise<RemoteModelCard | null> => {
  const [org, name] = String(modelId || '').split('/')
  if (!org || !name) return null
  const res = await fetch(
    `${MODELSCOPE_BASE_URL}/api/v1/models/${encodeURIComponent(org)}/${encodeURIComponent(name)}`,
    {
      headers: { Accept: 'application/json' }
    }
  )
  if (!res.ok) return null
  const json = await res.json() as ModelScopeDetailResponse
  return mapRemoteModel(json?.Data || {}, fallbackAvatar)
}
