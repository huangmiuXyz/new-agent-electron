export interface CascaderPanelItem {
  key: string
  label: string
  description?: string
  icon?: 'split'
  children?: CascaderPanelItem[] | ((item: CascaderPanelItem, path: CascaderPanelItem[]) => CascaderPanelItem[])
  onKeydown?: (context: CascaderPanelItemKeydownContext) => CascaderPanelItemKeydownResult | void
  data?: unknown
}

export interface CascaderPanelItemKeydownContext {
  event: KeyboardEvent
  item: CascaderPanelItem
  path: CascaderPanelItem[]
  depth: number
  index: number
  hasChildren: boolean
}

export interface CascaderPanelItemKeydownResult {
  action: 'select' | 'open' | 'close' | 'stay'
  requestClose?: boolean
}

export interface CascaderPanelSelectResult {
  handled: boolean
  requestClose?: boolean
  item?: CascaderPanelItem
  path?: CascaderPanelItem[]
}
