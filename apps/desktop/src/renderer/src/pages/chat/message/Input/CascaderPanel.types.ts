export interface CascaderPanelItem {
  key: string
  label: string
  description?: string
  icon?: 'split'
  children?: CascaderPanelItem[] | ((item: CascaderPanelItem, path: CascaderPanelItem[]) => CascaderPanelItem[])
  data?: unknown
}

export interface CascaderPanelSelectResult {
  handled: boolean
  requestClose?: boolean
  item?: CascaderPanelItem
  path?: CascaderPanelItem[]
}
