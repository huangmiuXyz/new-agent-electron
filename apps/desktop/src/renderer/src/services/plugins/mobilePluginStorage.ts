import localforage from 'localforage'

const storage = localforage.createInstance({
  name: 'agent-qi-mobile-plugins'
})

const INDEX_KEY = '__plugin_index__'

export interface StoredMobilePlugin {
  id: string
  info: PluginInfoData
  indexCode: string
  readme?: string
}

async function getIndex(): Promise<Record<string, PluginInfoData>> {
  return (await storage.getItem<Record<string, PluginInfoData>>(INDEX_KEY)) || {}
}

async function setIndex(index: Record<string, PluginInfoData>): Promise<void> {
  await storage.setItem(INDEX_KEY, index)
}

export async function saveMobilePluginPackage(plugin: StoredMobilePlugin): Promise<void> {
  const index = await getIndex()
  index[plugin.id] = {
    ...plugin.info,
    path: plugin.id,
    readme: plugin.readme || plugin.info.readme
  }

  await Promise.all([
    storage.setItem(`plugin:${plugin.id}:code`, plugin.indexCode),
    storage.setItem(`plugin:${plugin.id}:readme`, plugin.readme || ''),
    setIndex(index)
  ])
}

export async function getMobilePluginPackage(pluginId: string): Promise<StoredMobilePlugin | null> {
  const index = await getIndex()
  const info = index[pluginId]
  if (!info) return null

  const indexCode = await storage.getItem<string>(`plugin:${pluginId}:code`)
  if (!indexCode) return null

  const readme = await storage.getItem<string>(`plugin:${pluginId}:readme`)

  return {
    id: pluginId,
    info,
    indexCode,
    readme: readme || info.readme
  }
}

export async function removeMobilePluginPackage(pluginId: string): Promise<void> {
  const index = await getIndex()
  delete index[pluginId]

  await Promise.all([
    storage.removeItem(`plugin:${pluginId}:code`),
    storage.removeItem(`plugin:${pluginId}:readme`),
    setIndex(index)
  ])
}

export async function listMobilePluginPackages(): Promise<PluginInfoData[]> {
  const index = await getIndex()
  return Object.entries(index).map(([id, info]) => ({
    ...info,
    path: id
  }))
}
