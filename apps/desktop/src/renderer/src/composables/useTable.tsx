import {
  computed,
  defineComponent,
  shallowRef,
  MaybeRefOrGetter,
  toValue,
  VNode,
  watchEffect,
  isVNode,
  ref,
  h,
  Ref,
  onMounted,
  onUnmounted
} from 'vue'
import { useVirtualList, useElementBounding, useWindowSize } from '@vueuse/core'

export interface TableColumn<T = any> {
  key: string
  label: string
  width?: string | number // number => px
  align?: 'left' | 'center' | 'right'
  headerClass?: string
  renderType?: 'html'
  render?: (row: T, index: number) => VNode | string | number | null
}

export interface TableConfig<T extends Record<string, any>> {
  columns: MaybeRefOrGetter<TableColumn<T>[]>
  data?: MaybeRefOrGetter<T[]>
  loading?: MaybeRefOrGetter<boolean>
  onRowClick?: (row: T) => void
  expandRender?: (row: T) => VNode | string | number | null
  height?: string | number // 表格高度，虚拟滚动时可设置固定高度
  autoHeight?: {
    // 自动计算高度，基于视口
    enabled: boolean
    bottomOffset?: number // 距离视口底部的距离（默认 20px）
    minHeight?: number // 最小高度（默认 200px）
  }
  virtualScroll?: {
    enabled: boolean
    itemHeight: number
    overscan?: number
  }
}

export interface TableActions<T> {
  setData: (data: T[]) => void
  setLoading: (loading: boolean) => void
  setColumns: (columns: TableColumn<T>[]) => void
  getData: () => T[]
  getLoading: () => boolean
  toggleExpand: (id: string | number) => void
  isExpanded: (id: string | number) => boolean
}

export function useTable<T extends Record<string, any>>(config: TableConfig<T>) {
  const tableData = shallowRef<T[]>((toValue(config.data) || []) as T[])
  const tableLoading = shallowRef<boolean>(toValue(config.loading) || false)
  const tableColumns = shallowRef<TableColumn<T>[]>(toValue(config.columns) || [])
  const expandedRows = ref(new Set<string | number>())
  const containerRef = ref<HTMLElement | null>(null)

  const virtualEnabled = config.virtualScroll?.enabled ?? false
  const itemHeight = config.virtualScroll?.itemHeight ?? 36
  const overscan = config.virtualScroll?.overscan ?? 5

  const { list: virtualList, containerProps, wrapperProps } = useVirtualList(
    tableData as Ref<T[]>,
    {
      itemHeight,
      overscan
    }
  )

  const toggleExpand = (id: string | number) => {
    if (expandedRows.value.has(id)) {
      expandedRows.value.delete(id)
    } else {
      expandedRows.value.add(id)
    }
  }

  const isExpanded = (id: string | number) => expandedRows.value.has(id)

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

  const getAlignStyle = (align?: 'left' | 'center' | 'right') => {
    if (!align) return {}
    return {
      justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
    }
  }

  const gridTemplate = computed(() =>
    tableColumns.value
      .map((col) => (typeof col.width === 'number' ? `${col.width}px` : col.width || '1fr'))
      .join(' ')
  )

  const renderRow = (row: T, rowIndex: number) => {
    const rowId = ((row as Record<string, unknown>).id as string | number) || rowIndex
    return (
      <div key={rowId} class="table-row-container">
        <div class="table-row" onClick={() => config.onRowClick?.(row)}>
          {tableColumns.value.map((col) => {
            const result = col.render?.(row, rowIndex) as any

            if (col.renderType === 'html') {
              const htmlContent = col.render
                ? col.render(row, rowIndex)
                : ((row as Record<string, unknown>)[col.key] as string | number)
              return (
                <div
                  key={col.key}
                  class="table-cell"
                  style={getAlignStyle(col.align)}
                  innerHTML={String(htmlContent || '')}
                ></div>
              )
            }

            if (!isVNode(result) && result?.setup) {
              return (
                <div key={col.key} class="table-cell" style={getAlignStyle(col.align)}>
                  {h(result)}
                </div>
              )
            }
            return (
              <div key={col.key} class="table-cell" style={getAlignStyle(col.align)}>
                {col.render
                  ? col.render(row, rowIndex)
                  : ((row as Record<string, unknown>)[col.key] as string | number)}
              </div>
            )
          })}
        </div>
        {config.expandRender && isExpanded(rowId) && (
          <div class="expand-row" style={{ gridColumn: `1 / span ${tableColumns.value.length}` }}>
            {config.expandRender(row)}
          </div>
        )}
      </div>
    )
  }

  const tableWrapperRef = ref<HTMLElement | null>(null)
  const { top } = useElementBounding(tableWrapperRef)
  const { height: windowHeight } = useWindowSize()

  const autoHeightEnabled = config.autoHeight?.enabled ?? false
  const bottomOffset = config.autoHeight?.bottomOffset ?? 20
  const minHeight = config.autoHeight?.minHeight ?? 200

  const computedHeight = computed(() => {
    if (config.height) {
      return typeof config.height === 'number' ? `${config.height}px` : config.height
    }
    if (autoHeightEnabled && top.value > 0) {
      const calculatedHeight = windowHeight.value - top.value - bottomOffset
      return `${Math.max(calculatedHeight, minHeight)}px`
    }
    return virtualEnabled ? '400px' : undefined
  })

  const TableComponent = defineComponent({
    setup() {
      return () => {
        const gridTemplateValue = gridTemplate.value
        const virtualStyles = virtualEnabled
          ? {
              '--virtual-item-height': `${itemHeight}px`,
              '--virtual-grid-template': gridTemplateValue
                .split(' ')
                .map((w) => (w === '1fr' ? 'minmax(0, 1fr)' : w))
                .join(' ')
            }
          : {}

        const wrapperStyle = virtualEnabled
          ? { height: computedHeight.value, ...virtualStyles }
          : { gridTemplateColumns: gridTemplateValue }

        return (
          <div
            ref={tableWrapperRef}
            class={['table-wrapper', { 'virtual-scroll': virtualEnabled }]}
            style={wrapperStyle}
          >
            {/* 表头行 */}
            <div class="table-header" style={{ gridTemplateColumns: gridTemplateValue }}>
              {tableColumns.value.map((col) => (
                <div
                  key={col.key}
                  class={['header-cell', col.headerClass]}
                  style={getAlignStyle(col.align)}
                >
                  {col.label}
                </div>
              ))}
            </div>

            {/* 表体 */}
            {virtualEnabled ? (
              <div class="table-body-virtual" {...containerProps}>
                <div class="table-body-inner" {...wrapperProps.value}>
                  {tableLoading.value ? (
                    <div class="state-row">Loading...</div>
                  ) : virtualList.value.length === 0 ? (
                    <div class="state-row">无数据</div>
                  ) : (
                    virtualList.value.map(({ data, index }) => renderRow(data, index))
                  )}
                </div>
              </div>
            ) : (
              <div class="table-body">
                {tableLoading.value ? (
                  <div class="state-row">Loading...</div>
                ) : !tableData.value || tableData.value.length === 0 ? (
                  <div class="state-row">无数据</div>
                ) : (
                  tableData.value.map((row, rowIndex) => renderRow(row, rowIndex))
                )}
              </div>
            )}
          </div>
        )
      }
    }
  })

  const actions: TableActions<T> = {
    setData,
    setLoading,
    setColumns,
    getData,
    getLoading,
    toggleExpand,
    isExpanded
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

      .table-wrapper.virtual-scroll {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .table-header,
      .table-row,
      .table-row-container {
        display: contents;
      }

      .table-body {
        display: contents;
      }

      .table-wrapper.virtual-scroll .table-header {
        display: grid;
        flex-shrink: 0;
      }

      .table-body-virtual {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .table-body-inner {
        display: flex;
        flex-direction: column;
      }

      .table-body-inner .table-row-container {
        display: block;
        height: var(--virtual-item-height, 36px);
      }

      .table-body-inner .table-row {
        display: grid;
        grid-template-columns: var(--virtual-grid-template);
        height: 100%;
      }

      .expand-row {
        background: var(--bg-hover);
        padding: 8px 16px;
      }

      .header-cell,
      .table-cell {
        box-sizing: border-box;
        padding: 4px 8px;
        min-height: 36px;
        display: flex;
        align-items: center;
        overflow: hidden;
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

      .table-body-inner .state-row {
        padding: 40px;
        text-align: center;
        color: var(--text-secondary);
      }
    `
    document.head.appendChild(style)
  }

  return [TableComponent, actions] as const
}
