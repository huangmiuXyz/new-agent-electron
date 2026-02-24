import { PluginContext } from '../types'
import { createCivitai } from '../civitai/civitai-provider'

interface GetTableColumnsProps {
  context: PluginContext
  getData: () => any[]
  setData: (data: any[]) => void
  activeModelsMap: { value: any }
  updateProvider: () => Promise<void>
  STORAGE_KEY: string
  PROVIDER_ID: string
}

export const getTableColumns = ({
  context,
  getData,
  setData,
  activeModelsMap,
  updateProvider,
  STORAGE_KEY,
  PROVIDER_ID
}: GetTableColumnsProps) => {
  const {
    vue,
    localforage,
    components: { Select }
  } = context

  return [
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
          <Select
            disabled={row.loading}
            modelValue={row.versionId}
            options={row.versions?.map((v: any) => ({ label: v.name, value: v.id }))}
            size="sm"
            onUpdate:modelValue={async (val: any) => {
              const newVersionId = Number(val)
              const selectedVersion = row.versions.find((v: any) => v.id === newVersionId)
              if (!selectedVersion) return

              const currentData = getData()
              const isCurrentlyActive = row.active

              setData(
                currentData.map((item: any) =>
                  item.modelId === row.modelId ? { ...item, loading: true } : item
                )
              )

              try {
                let newId = String(row.modelId)

                if (isCurrentlyActive) {
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
                const rollbackData = getData().map((item: any) =>
                  item.modelId === row.modelId ? { ...row, loading: false } : item
                )
                setData(rollbackData)
              }
            }}
            style={{
              width: '100%'
            }}
          />
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
                      updatedRow.baseModel = versionInfo.baseModel
                    } else {
                      throw new Error('No AIR found for this version')
                    }
                  }
                } else {
                  updatedRow.id = String(row.modelId)
                }

                const finalData = getData().map((item: any) =>
                  item.versionId === row.versionId ? updatedRow : item
                )
                setData(finalData)

                if (val) {
                  activeModelsMap.value[updatedRow.id] = vue.toRaw(updatedRow)
                } else {
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
                const rollbackData = getData().map((item: any) =>
                  item.versionId === row.versionId ? { ...row, active: !val, loading: false } : item
                )
                setData(rollbackData)
              }
            }
          })}
        </div>
      )
    }
  ]
}
