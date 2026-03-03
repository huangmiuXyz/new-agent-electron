export const MODELSCOPE_BASE_URL = 'https://www.modelscope.cn'
const MODELSCOPE_OPENAPI_BASE_URL = 'https://modelscope.cn/openapi/v1'
const MODELSCOPE_ORG_ALIAS: Record<string, string> = {
  qwen: 'Qwen',
  deepseek: 'deepseek-ai',
  llama: 'LLM-Research',
  baichuan: 'baichuan-inc'
}

interface OpenAPIModel {
  id?: string
  display_name?: string
  description?: string
  downloads?: number
  likes?: number
  last_modified?: string
  readme?: string
}

interface OpenAPIModelListResponse {
  success?: boolean
  data?: {
    models?: OpenAPIModel[]
    total_count?: number
    page_number?: number
    page_size?: number
  }
}

interface OpenAPIModelDetailResponse {
  success?: boolean
  data?: OpenAPIModel
}

interface ModelScopeRepoFilesResponse {
  Code?: number
  Data?: {
    Files?: Array<{
      Name?: string
      Path?: string
      Size?: number
      Type?: string
    }>
  }
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

const mapRemoteModel = (item: OpenAPIModel, fallbackAvatar: string): RemoteModelCard | null => {
  const id = String(item.id || '').trim()
  if (!id) return null
  const [org = ''] = id.split('/')
  const lastModified = String(item.last_modified || '').trim()
  const updatedAt = lastModified ? Math.floor(new Date(lastModified).getTime() / 1000) : 0
  const avatar = fallbackAvatar
  return {
    id,
    name: String(item.display_name || id).trim() || id,
    org: String(org).trim(),
    description: String(item.description || '').trim(),
    avatar,
    downloads: Number(item.downloads || 0),
    stars: Number(item.likes || 0),
    updatedAt,
    readme: String(item.readme || '').trim()
  }
}

const fetchModelScopeModelsByOrg = async (
  params: { search?: string; pageNumber?: number; pageSize?: number },
  fallbackAvatar: string,
): Promise<{ items: RemoteModelCard[]; total: number }> => {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  query.set('sort', 'downloads')
  query.set('page_number', String(params.pageNumber || 1))
  query.set('page_size', String(params.pageSize || 20))
  const res = await fetch(`${MODELSCOPE_OPENAPI_BASE_URL}/models?${query.toString()}`, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) return { items: [], total: 0 }
  const json = await res.json() as OpenAPIModelListResponse
  const list = Array.isArray(json?.data?.models) ? json.data.models : []
  const items = list.map((item) => mapRemoteModel(item, fallbackAvatar)).filter((item): item is RemoteModelCard => Boolean(item))
  const total = Number(json?.data?.total_count || 0)
  return { items, total }
}

export interface RemoteModelSearchResult {
  items: RemoteModelCard[]
  total: number
  page: number
  pageSize: number
}

export const searchModelScopeModels = async (
  queryRaw: string,
  fallbackAvatar: string,
  page = 1,
  pageSize = 20
): Promise<RemoteModelSearchResult> => {
  const query = String(queryRaw || '').trim()
  const queryLower = query.toLowerCase()
  const hasExplicitOrg = query.includes('/')

  const searchText = hasExplicitOrg
    ? String(query.split('/').slice(1).join('/')).trim() || String(query.split('/')[0] || '').trim()
    : (MODELSCOPE_ORG_ALIAS[queryLower] || query)

  const { items, total } = await fetchModelScopeModelsByOrg({
    search: searchText || undefined,
    pageNumber: page,
    pageSize
  }, fallbackAvatar)
  const filtered = items.filter((row) => {
    const searchable = `${row.id} ${row.name} ${row.description}`.toLowerCase()
    return !queryLower || searchable.includes(queryLower)
  })
  return {
    items: filtered.sort((a, b) => (b.downloads - a.downloads) || (b.stars - a.stars) || (b.updatedAt - a.updatedAt)),
    total,
    page,
    pageSize
  }
}

export const fetchModelScopeModelDetail = async (
  modelId: string,
  fallbackAvatar: string
): Promise<RemoteModelCard | null> => {
  const [org, name] = String(modelId || '').split('/')
  if (!org || !name) return null
  const res = await fetch(
    `${MODELSCOPE_OPENAPI_BASE_URL}/models/${encodeURIComponent(org)}/${encodeURIComponent(name)}`,
    {
      headers: { Accept: 'application/json' }
    }
  )
  if (!res.ok) return null
  const json = await res.json() as OpenAPIModelDetailResponse
  return mapRemoteModel(json?.data || {}, fallbackAvatar)
}

export interface ModelScopeRepoFile {
  name: string
  path: string
  size: number
  type: string
}

export const fetchModelScopeRepoFiles = async (modelId: string): Promise<ModelScopeRepoFile[]> => {
  const [org, name] = String(modelId || '').split('/')
  if (!org || !name) return []
  const res = await fetch(
    `${MODELSCOPE_BASE_URL}/api/v1/models/${encodeURIComponent(org)}/${encodeURIComponent(name)}/repo/files?Revision=master`,
    {
      headers: { Accept: 'application/json' }
    }
  )
  if (!res.ok) return []
  const json = await res.json() as ModelScopeRepoFilesResponse
  const files = Array.isArray(json?.Data?.Files) ? json.Data.Files : []
  return files
    .map((f) => ({
      name: String(f?.Name || '').trim(),
      path: String(f?.Path || '').trim(),
      size: Number(f?.Size || 0),
      type: String(f?.Type || '').trim()
    }))
    .filter((f) => f.path)
}

export const buildModelScopeFileDownloadUrl = (modelId: string, filePath: string): string => {
  const [org, name] = String(modelId || '').split('/')
  if (!org || !name || !filePath) return ''
  return `${MODELSCOPE_BASE_URL}/api/v1/models/${encodeURIComponent(org)}/${encodeURIComponent(name)}/repo?Revision=master&FilePath=${encodeURIComponent(filePath)}`
}
