import {
  computed,
  defineComponent,
  shallowRef,
  MaybeRefOrGetter,
  toValue,
  VNode,
  watchEffect
} from 'vue'

export interface TableColumn<T = any> {
  key: string
  label: string
  width?: string | number // number => px
  headerClass?: string
  render?: (row: T, index: number) => VNode | string | number | null
}

export interface TableConfig<T extends Record<string, any>> {
  columns: MaybeRefOrGetter<TableColumn<T>[]>
  data?: MaybeRefOrGetter<T[]>
  loading?: MaybeRefOrGetter<boolean>
  onRowClick?: (row: T) => void
}

export interface TableActions<T> {
  setData: (data: T[]) => void
  setLoading: (loading: boolean) => void
  setColumns: (columns: TableColumn<T>[]) => void
  getData: () => T[]
  getLoading: () => boolean
}

export function useTable<T extends Record<string, any>>(config: TableConfig<T>) {
  const tableData = shallowRef<T[]>((toValue(config.data) || []) as T[])
  const tableLoading = shallowRef<boolean>(toValue(config.loading) || false)
  const tableColumns = shallowRef<TableColumn<T>[]>(toValue(config.columns) || [])

  watchEffect(() => {
    const data = toValue(config.data)
    if (data !== undefined) tableData.value = data
  })

  watchEffect(() => {
    const loading = toValue(config.loading)
    if (loading !== undefined) tableLoading.value = loading
  })

  watchEffect(() => {
    const columns = toValue(config.columns)
    if (columns !== undefined) tableColumns.value = columns
  })

  const setData = (data: T[]) => {
    tableData.value = data
  }

  const setLoading = (loading: boolean) => {
    tableLoading.value = loading
  }

  const setColumns = (columns: TableColumn<T>[]) => {
    tableColumns.value = columns
  }

  const getData = () => tableData.value
  const getLoading = () => tableLoading.value

  const gridTemplate = computed(() =>
    tableColumns.value
      .map((col) => (typeof col.width === 'number' ? `${col.width}px` : col.width || '1fr'))
      .join(' ')
  )

  const TableComponent = defineComponent({
    setup() {
      return () => (
        <div class="table-wrapper" style={{ gridTemplateColumns: gridTemplate.value }}>
          {/* 表头行 */}
          <div class="table-header">
            {tableColumns.value.map((col) => (
              <div key={col.key} class={['header-cell', col.headerClass]}>
                {col.label}
              </div>
            ))}
          </div>

          {/* 表体 */}
          <div class="table-body">
            {/* 加载中 */}
            {tableLoading.value ? (
              <div class="state-row">Loading...</div>
            ) : !tableData.value || tableData.value.length === 0 ? (
              <div class="state-row">无数据</div>
            ) : (
              tableData.value.map((row, rowIndex) => (
                <div
                  key={(row as Record<string, unknown>).id as string | number || rowIndex}
                  class="table-row"
                  onClick={() => config.onRowClick?.(row)}
                >
                  {tableColumns.value.map((col) => (
                    <div key={col.key} class="table-cell">
                      {col.render
                        ? col.render(row, rowIndex)
                        : (row as Record<string, unknown>)[col.key] as string | number}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )
    }
  })

  const actions: TableActions<T> = {
    setData,
    setLoading,
    setColumns,
    getData,
    getLoading
  }

  if (typeof document !== 'undefined' && !document.getElementById('use-table-styles')) {
    const style = document.createElement('style')
    style.id = 'use-table-styles'
    style.textContent = `
      .table-wrapper {
        display: grid;
        grid-auto-rows: auto;
        border: 1px solid var(--border-subtle);
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg-card);
        overflow-x: auto;
      }

      .table-header,
      .table-row {
        display: contents;
      }

      .table-body {
        display: contents;
      }

      .header-cell,
      .table-cell {
        box-sizing: border-box;
        padding: 0 8px;
        height: 36px;
        display: flex;
        align-items: center;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        border-bottom: 1px solid var(--border-subtle);
      }

      .header-cell {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        background: var(--bg-tertiary);
      }

      .table-cell {
        font-size: 13px;
        color: var(--text-primary);
      }

      .table-row:last-child .table-cell {
        border-bottom: none;
      }

      .table-row:hover .table-cell {
        background: var(--bg-hover);
      }

      .state-row {
        grid-column: 1 / -1;
        padding: 40px;
        text-align: center;
        color: var(--text-secondary);
      }
    `
    document.head.appendChild(style)
  }

  return [TableComponent, actions] as const
}
