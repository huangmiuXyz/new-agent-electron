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
  Ref
} from 'vue'
import { useVirtualList, useElementBounding, useWindowSize } from '@vueuse/core'
import Checkbox from '@renderer/components/Checkbox.vue'
import { TableColumn, TableConfig, TableActions } from '@agent-qi/types'

export function useTable<T extends Record<string, unknown>>(config: TableConfig<T>) {
  const tableData = shallowRef<T[]>((toValue(config.data) || []) as T[])
  const tableLoading = shallowRef<boolean>(toValue(config.loading) || false)
  const tableColumns = shallowRef<TableColumn<T>[]>(toValue(config.columns) || [])
  const expandedRows = ref(new Set<string | number>())

  const virtualEnabled = config.virtualScroll?.enabled ?? false
  const itemHeight = config.virtualScroll?.itemHeight ?? 36
  const overscan = config.virtualScroll?.overscan ?? 5

  // 选择功能
  const selectionEnabled = config.selection?.enabled ?? false
  const selectionKey = config.selection?.key ?? 'id'
  const selectedKeys = ref(new Set<string | number>())

  const getRowKey = (row: T): string | number => {
    return (row as Record<string, unknown>)[selectionKey] as string | number
  }

  const toggleSelect = (key: string | number) => {
    if (selectedKeys.value.has(key)) {
      selectedKeys.value.delete(key)
    } else {
      selectedKeys.value.add(key)
    }
  }

  const isSelected = (key: string | number) => selectedKeys.value.has(key)

  const selectAll = () => {
    if (isAllSelected()) {
      selectedKeys.value.clear()
    } else {
      tableData.value.forEach((row) => {
        selectedKeys.value.add(getRowKey(row))
      })
    }
  }

  const isAllSelected = () => {
    return tableData.value.length > 0 && tableData.value.every((row) => isSelected(getRowKey(row)))
  }

  const isIndeterminate = () => {
    const selectedCount = selectedKeys.value.size
    return selectedCount > 0 && selectedCount < tableData.value.length
  }

  const clearSelection = () => {
    selectedKeys.value.clear()
  }

  const getSelectedKeys = () => Array.from(selectedKeys.value)

  const getSelectedRows = () => {
    return tableData.value.filter((row) => isSelected(getRowKey(row)))
  }

  const setSelectedKeys = (keys: (string | number)[]) => {
    selectedKeys.value = new Set(keys)
  }

  // 数据变化时清理无效的选择
  watchEffect(() => {
    const data = tableData.value
    const validKeys = new Set(data.map((row) => getRowKey(row)))
    selectedKeys.value.forEach((key) => {
      if (!validKeys.has(key)) {
        selectedKeys.value.delete(key)
      }
    })
  })

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

  const selectionWidth = computed(() => {
    if (!selectionEnabled) return ''
    const width = config.selection?.width ?? 40
    return typeof width === 'number' ? `${width}px` : width
  })

  const gridTemplate = computed(() => {
    const columnsWidth = tableColumns.value
      .map((col) => (typeof col.width === 'number' ? `${col.width}px` : col.width || '1fr'))
      .join(' ')
    if (selectionEnabled) {
      return `${selectionWidth.value} ${columnsWidth}`
    }
    return columnsWidth
  })

  const renderSelectionCell = (row: T) => {
    const rowKey = getRowKey(row)
    const checked = isSelected(rowKey)
    return (
      <div class="table-cell selection-cell" style={getAlignStyle('center')}>
        <Checkbox
          modelValue={checked}
          onUpdate:modelValue={() => toggleSelect(rowKey)}
        />
      </div>
    )
  }

  const renderRow = (row: T, rowIndex: number) => {
    const rowId = ((row as Record<string, unknown>).id as string | number) || rowIndex
    const colSpan = tableColumns.value.length + (selectionEnabled ? 1 : 0)
    return (
      <div key={rowId} class="table-row-container">
        <div class="table-row" onClick={() => config.onRowClick?.(row)}>
          {selectionEnabled && renderSelectionCell(row)}
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
          <div class="expand-row" style={{ gridColumn: `1 / span ${colSpan}` }}>
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
              {selectionEnabled && (
                <div class="header-cell selection-header-cell" style={getAlignStyle('center')}>
                  <Checkbox
                    modelValue={isAllSelected()}
                    indeterminate={isIndeterminate()}
                    onUpdate:modelValue={selectAll}
                  />
                </div>
              )}
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
    isExpanded,
    getSelectedKeys,
    getSelectedRows,
    setSelectedKeys,
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isIndeterminate
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

      .selection-header-cell,
      .selection-cell {
        width: 40px;
        min-width: 40px;
        max-width: 40px;
        justify-content: center;
        padding: 4px;
      }

      .table-row:hover .selection-cell {
        background: var(--bg-hover);
      }
    `
    document.head.appendChild(style)
  }

  return [TableComponent, actions] as const
}
