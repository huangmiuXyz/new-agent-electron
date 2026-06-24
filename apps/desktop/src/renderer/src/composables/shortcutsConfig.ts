export interface ShortcutConfig {
    /** 快捷键ID */
    id: string
    /** 快捷键名称 */
    name: string
    /** 快捷键描述 */
    description?: string
    /** 默认按键组合 */
    defaultKey: string
    /** 当前按键组合（用户自定义） */
    currentKey?: string
    /** 是否启用 */
    enabled: boolean
    /** 是否可修改 */
    editable?: boolean
    /** 触发范围: 'global'=全局, 'chat'=聊天页面, 'notes'=笔记页面 */
    scope: 'global' | 'chat' | 'notes' | 'image' | 'settings'
    /** 是否允许在输入框中使用 */
    allowedInInput?: boolean
}

// 内置快捷键定义
export const BUILTIN_SHORTCUTS: ShortcutConfig[] = [
    {
        id: 'global.search',
        name: '全局搜索',
        description: '打开全局搜索框，搜索聊天记录',
        defaultKey: 'CmdOrCtrl+K',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'global.newChat',
        name: '新建对话',
        description: '创建一个新的聊天对话',
        defaultKey: 'CmdOrCtrl+N',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'chat.clearContext',
        name: '清空上下文',
        description: '清空当前对话的上下文',
        defaultKey: 'CmdOrCtrl+Shift+K',
        enabled: true,
        editable: true,
        scope: 'chat',
        allowedInInput: true
    },
    {
        id: 'navigation.switchToChat',
        name: '切换到对话',
        description: '切换到对话页面',
        defaultKey: 'CmdOrCtrl+1',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'navigation.switchToNotes',
        name: '切换到笔记',
        description: '切换到笔记页面',
        defaultKey: 'CmdOrCtrl+2',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'navigation.switchToImage',
        name: '切换到生图',
        description: '切换到图像生成页面',
        defaultKey: 'CmdOrCtrl+3',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'navigation.switchToSettings',
        name: '切换到设置',
        description: '切换到设置页面',
        defaultKey: 'CmdOrCtrl+4',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'global.toggleSidebar',
        name: '切换侧边栏',
        description: '显示/隐藏侧边栏',
        defaultKey: 'CmdOrCtrl+B',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'global.toggleRightPanelAlt',
        name: '切换右侧面板 (U)',
        description: '展开/收起右侧面板，快捷键 Ctrl+U',
        defaultKey: 'CmdOrCtrl+U',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'global.toggleRightPanel',
        name: '切换右侧面板',
        description: '显示/隐藏右侧面板',
        defaultKey: 'CmdOrCtrl+Shift+B',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'global.focusInput',
        name: '聚焦输入框',
        description: '将焦点设置到主输入框',
        defaultKey: 'CmdOrCtrl+L',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'chat.toggleTerminal',
        name: '切换终端',
        description: '显示/隐藏终端面板',
        defaultKey: 'CmdOrCtrl+J',
        enabled: true,
        editable: true,
        scope: 'global',
        allowedInInput: true
    },
    {
        id: 'chat.switchAgent',
        name: '切换助手',
        description: '切换到下一个助手',
        defaultKey: 'CmdOrCtrl+Shift+A',
        enabled: true,
        editable: true,
        scope: 'chat',
        allowedInInput: true
    },
    {
        id: 'chat.switchModel',
        name: '切换模型',
        description: '切换到下一个模型',
        defaultKey: 'CmdOrCtrl+Shift+M',
        enabled: true,
        editable: true,
        scope: 'chat',
        allowedInInput: true
    },
    {
        id: 'chat.toggleManualInputAudio',
        name: '手动录入开关',
        description: '一键开启/关闭手动音频录入',
        defaultKey: 'F8',
        enabled: true,
        editable: true,
        scope: 'chat',
        allowedInInput: true
    },
    {
        id: 'chat.toggleContinuousInputAudio',
        name: '连续录入开关',
        description: '一键开启/关闭连续音频录入',
        defaultKey: 'F9',
        enabled: true,
        editable: true,
        scope: 'chat',
        allowedInInput: true
    },
    {
        id: 'chat.regenerateLast',
        name: '重写最后一条',
        description: '自动重写最后一条助手消息',
        defaultKey: 'CmdOrCtrl+R',
        enabled: true,
        editable: true,
        scope: 'chat',
        allowedInInput: true
    }
]
