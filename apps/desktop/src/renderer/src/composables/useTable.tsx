import {
  computed,
  defineComponent,
  shallowRef,
  triggerRef,
  toValue,
  watchEffect,
  isVNode,
  ref,
  h,
  DefineComponent,
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch
} from 'vue'
import { useVirtualList, useElementBounding, useWindowSize } from '@vueuse/core'
import Checkbox from '@renderer/components/Checkbox.vue'

const HEADER_FONT = '600 11px sans-serif'
const BODY_FONT = '400 13px sans-serif'
const CELL_HORIZONTAL_PADDING = 16
const CELL_EXTRA_WIDTH = 8
const DEFAULT_MIN_COLUMN_WIDTH = 48
const DEFAULT_CUSTOM_HEADER_WIDTH = 72
const DEFAULT_CUSTOM_CELL_WIDTH = 88

export function useTable<T extends Record<string, any>>(config: TableConfig<T>) {
  const tableData = shallowRef<T[]>((toValue(config.data) || []) as T[])
  const tableLoading = shallowRef<boolean>(toValue(config.loading) || false)
  const tableColumns = shallowRef<TableColumn<T>[]>(toValue(config.columns) || [])
  const expandedRows = ref(new Set<string | number>())
  const measuredColumnWidths = ref<number[]>([])
  const tableWrapperRef = ref<HTMLElement>()
  const tableContentRef = ref<HTMLElement>()
  const wrapperWidth = ref(0)

  const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : undefined
  const measureContext = measureCanvas?.getContext('2d')

  const virtualEnabled = config.virtualScroll?.enabled ?? false
  const itemHeight = config.virtualScroll?.itemHeight ?? 36
  const overscan = config.virtualScroll?.overscan ?? 5

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

  watchEffect(() => {
    const data = tableData.value
    const validKeys = new Set(data.map((row) => getRowKey(row)))
    selectedKeys.value.forEach((key) => {
      if (!validKeys.has(key)) {
        selectedKeys.value.delete(key)
      }
    })
  })

  const {
    list: virtualList,
    containerProps,
    wrapperProps
  } = useVirtualList(tableData, {
    itemHeight,
    overscan
  })

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
    if (data !== undefined) {
      tableData.value = data
      triggerRef(tableData)
    }
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

  const stringifyMeasureValue = (value: unknown): string => {
    if (value === null || value === undefined || typeof value === 'boolean') return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value)
    if (Array.isArray(value)) return value.map((item) => stringifyMeasureValue(item)).filter(Boolean).join(' ')
    if (isVNode(value)) {
      const children = value.children
      if (typeof children === 'string') return children
      if (Array.isArray(children)) return children.map((child) => stringifyMeasureValue(child)).filter(Boolean).join(' ')
      return ''
    }
    return ''
  }

  const hasRenderableNode = (value: unknown) => {
    if (value === null || value === undefined || typeof value === 'boolean') return false
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return false
    if (Array.isArray(value)) return value.some((item) => hasRenderableNode(item))
    if (isVNode(value)) return true
    return typeof value === 'object'
  }

  const measureTextWidth = (text: string, font: string) => {
    if (!text) return 0
    if (!measureContext) return text.length * 8
    measureContext.font = font
    return Math.ceil(measureContext.measureText(text).width)
  }

  const getConfiguredPixelWidth = (col: TableColumn<T>) => {
    if (typeof col.width === 'number') return col.width
    if (typeof col.width !== 'string') return 0
    const match = col.width.trim().match(/^(\d+(?:\.\d+)?)px$/)
    return match ? Number(match[1]) : 0
  }

  const getConfiguredMinPixelWidth = (col: TableColumn<T>) => {
    if (typeof col.minWidth === 'number') return col.minWidth
    if (typeof col.minWidth !== 'string') return 0
    const match = col.minWidth.trim().match(/^(\d+(?:\.\d+)?)px$/)
    return match ? Number(match[1]) : 0
  }

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

  const recalculateColumnWidths = async () => {
    await nextTick()

    measuredColumnWidths.value = tableColumns.value.map((col) => {
      const headerContent = col.headerRender ? col.headerRender() : col.label
      const headerText = stringifyMeasureValue(headerContent)
      let maxWidth = Math.max(
        DEFAULT_MIN_COLUMN_WIDTH,
        measureTextWidth(headerText, HEADER_FONT) + CELL_HORIZONTAL_PADDING + CELL_EXTRA_WIDTH,
        getConfiguredPixelWidth(col),
        getConfiguredMinPixelWidth(col)
      )

      if (hasRenderableNode(headerContent)) {
        maxWidth = Math.max(maxWidth, DEFAULT_CUSTOM_HEADER_WIDTH)
      }

      tableData.value.forEach((row, rowIndex) => {
        const content = col.render ? col.render(row, rowIndex) : (row[col.key] as unknown)
        const text = stringifyMeasureValue(content)
        maxWidth = Math.max(
          maxWidth,
          measureTextWidth(text, BODY_FONT) + CELL_HORIZONTAL_PADDING + CELL_EXTRA_WIDTH
        )

        if (hasRenderableNode(content)) {
          maxWidth = Math.max(maxWidth, DEFAULT_CUSTOM_CELL_WIDTH)
        }
      })

      return Math.ceil(maxWidth)
    })
  }

  const gridTemplate = computed(() => {
    const rawColumnWidths = tableColumns.value.map((col, index) => {
      const measuredWidth = measuredColumnWidths.value[index]
      if (measuredWidth) return measuredWidth
      const configuredWidth = getConfiguredPixelWidth(col)
      return configuredWidth || DEFAULT_MIN_COLUMN_WIDTH
    })

    const baseSelectionWidth = selectionEnabled ? Number.parseFloat(selectionWidth.value) || 40 : 0
    const rawColumnsWidth = rawColumnWidths.reduce((sum, width) => sum + width, 0)
    const availableColumnsWidth =
      wrapperWidth.value > 0
        ? Math.max(rawColumnsWidth, wrapperWidth.value - baseSelectionWidth)
        : rawColumnsWidth
    const scale = rawColumnsWidth > 0 ? availableColumnsWidth / rawColumnsWidth : 1
    const columnsWidth = rawColumnWidths
      .map((width) => `${Math.max(width, Math.round(width * scale))}px`)
      .join(' ')

    if (selectionEnabled) {
      return `${selectionWidth.value} ${columnsWidth}`
    }

    return columnsWidth
  })

  const tableMinWidth = computed(() => {
    const baseSelectionWidth = selectionEnabled ? Number.parseFloat(selectionWidth.value) || 40 : 0
    const columnsWidth = measuredColumnWidths.value.reduce((sum, width) => sum + width, 0)
    return `${Math.max(baseSelectionWidth + columnsWidth, wrapperWidth.value)}px`
  })

  const renderSelectionCell = (row: T) => {
    const rowKey = getRowKey(row)
    const checked = isSelected(rowKey)
    return (
      <div class="table-cell selection-cell" style={getAlignStyle('center')}>
        <Checkbox modelValue={checked} onUpdate:modelValue={() => toggleSelect(rowKey)} />
      </div>
    )
  }

  const renderRow = (row: T, rowIndex: number) => {
    const rowId = ((row as Record<string, unknown>).id as string | number) || rowIndex

    return (
      <div key={rowId} class="table-row-container">
        <div class="table-row" style={{ gridTemplateColumns: gridTemplate.value }} onClick={() => config.onRowClick?.(row)}>
          {selectionEnabled && renderSelectionCell(row)}
          {tableColumns.value.map((col, columnIndex) => {
            const result = col.render?.(row, rowIndex) as any

            if (col.renderType === 'html') {
              const htmlContent = col.render
                ? col.render(row, rowIndex)
                : ((row as Record<string, unknown>)[col.key] as string | number)

              return (
                <div
                  key={col.key}
                  class="table-cell"
                  data-col-index={columnIndex}
                  style={getAlignStyle(col.align)}
                  innerHTML={String(htmlContent || '')}
                ></div>
              )
            }

            if (!isVNode(result) && result?.setup) {
              return (
                <div key={col.key} class="table-cell" data-col-index={columnIndex} style={getAlignStyle(col.align)}>
                  {h(result)}
                </div>
              )
            }

            return (
              <div key={col.key} class="table-cell" data-col-index={columnIndex} style={getAlignStyle(col.align)}>
                {col.render
                  ? col.render(row, rowIndex)
                  : ((row as Record<string, unknown>)[col.key] as string | number)}
              </div>
            )
          })}
        </div>
        {config.expandRender && isExpanded(rowId) && (
          <div class="expand-row">
            {config.expandRender(row)}
          </div>
        )}
      </div>
    )
  }

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
      let resizeObserver: ResizeObserver | undefined
      let mutationObserver: MutationObserver | undefined

      onMounted(() => {
        void recalculateColumnWidths()
        wrapperWidth.value = tableWrapperRef.value?.clientWidth || 0

        if (typeof ResizeObserver !== 'undefined' && tableContentRef.value) {
          resizeObserver = new ResizeObserver(() => {
            wrapperWidth.value = tableWrapperRef.value?.clientWidth || 0
            void recalculateColumnWidths()
          })
          resizeObserver.observe(tableContentRef.value)
          if (tableWrapperRef.value) {
            resizeObserver.observe(tableWrapperRef.value)
          }
        }

        if (typeof MutationObserver !== 'undefined' && tableContentRef.value) {
          mutationObserver = new MutationObserver(() => {
            void recalculateColumnWidths()
          })
          mutationObserver.observe(tableContentRef.value, {
            subtree: true,
            childList: true,
            characterData: true
          })
        }
      })

      onBeforeUnmount(() => {
        resizeObserver?.disconnect()
        mutationObserver?.disconnect()
      })

      return () => {
        const gridTemplateValue = gridTemplate.value
        const virtualStyles = virtualEnabled
          ? {
              '--virtual-item-height': `${itemHeight}px`,
              '--virtual-grid-template': gridTemplateValue
            }
          : {}

        const wrapperStyle = virtualEnabled
          ? { height: computedHeight.value, ...virtualStyles }
          : undefined

        return (
          <div
            ref={tableWrapperRef}
            class={['table-wrapper', { 'virtual-scroll': virtualEnabled }]}
            style={wrapperStyle}
          >
            <div ref={tableContentRef} class="table-content" style={{ minWidth: tableMinWidth.value }}>
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
                {tableColumns.value.map((col, columnIndex) => (
                  <div
                    key={col.key}
                    class={['header-cell', col.headerClass]}
                    data-col-index={columnIndex}
                    style={getAlignStyle(col.align)}
                  >
                    {col.headerRender ? col.headerRender() : col.label}
                  </div>
                ))}
              </div>

              {virtualEnabled ? (
                <div class="table-body-virtual" {...containerProps}>
                  <div class="table-body-inner" {...wrapperProps.value}>
                    {tableLoading.value ? (
                      <div class="state-row">Loading...</div>
                    ) : virtualList.value.length === 0 ? (
                      <div class="state-row">No data</div>
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
                    <div class="state-row">No data</div>
                  ) : (
                    tableData.value.map((row, rowIndex) => renderRow(row, rowIndex))
                  )}
                </div>
              )}
            </div>
          </div>
        )
      }
    }
  })

  watch([tableData, tableColumns, tableLoading], () => {
    void recalculateColumnWidths()
  }, { deep: true, immediate: true })

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
        display: block;
        border: 1px solid var(--border-subtle);
        border-radius: 10px;
        overflow-x: auto;
        overflow-y: hidden;
        background: var(--bg-card);
      }

      .table-wrapper.virtual-scroll {
        display: flex;
        flex-direction: column;
        overflow-x: auto;
        overflow-y: hidden;
      }

      .table-content {
        width: max-content;
      }

      .table-header,
      .table-row {
        display: grid;
      }

      .table-body {
        display: block;
      }

      .table-row-container {
        display: block;
      }

      .table-wrapper.virtual-scroll .table-header {
        display: grid;
        flex-shrink: 0;
      }

      .table-body-virtual {
        flex: 1;
        overflow-y: auto;
        overflow-x: visible;
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
        border-bottom: 1px solid var(--border-subtle);
      }

      .header-cell,
      .table-cell {
        box-sizing: border-box;
        padding: 4px 8px;
        min-height: 36px;
        display: flex;
        align-items: center;
        overflow: visible;
        white-space: nowrap;
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
        display: block;
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

  return [TableComponent, actions] as [DefineComponent, TableActions<T>]
}
