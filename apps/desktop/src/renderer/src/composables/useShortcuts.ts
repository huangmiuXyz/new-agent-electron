import { useMagicKeys, useEventListener } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

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
}

export interface ShortcutAction {
    /** 快捷键ID */
    id: string
    /** 执行条件 */
    when?: () => boolean
    /** 执行函数 */
    handler: () => void | Promise<void>
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
        scope: 'global'
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
        scope: 'chat'
    },
    {
        id: 'navigation.switchToChat',
        name: '切换到对话',
        description: '切换到对话页面',
        defaultKey: 'CmdOrCtrl+1',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'navigation.switchToNotes',
        name: '切换到笔记',
        description: '切换到笔记页面',
        defaultKey: 'CmdOrCtrl+2',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'navigation.switchToImage',
        name: '切换到生图',
        description: '切换到图像生成页面',
        defaultKey: 'CmdOrCtrl+3',
        enabled: true,
        editable: true,
        scope: 'global'
    },
    {
        id: 'navigation.switchToSettings',
        name: '切换到设置',
        description: '切换到设置页面',
        defaultKey: 'CmdOrCtrl+4',
        enabled: true,
        editable: true,
        scope: 'global'
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
        scope: 'chat'
    }
]

// 格式化快捷键显示
export function formatShortcut(keyString: string, platform?: 'mac' | 'win' | 'linux'): string {
    const isMac = platform === 'mac' || (!platform && navigator.platform.toLowerCase().includes('mac'))

    return keyString
        .replace(/CmdOrCtrl/gi, isMac ? '⌘' : 'Ctrl')
        .replace(/Cmd/gi, '⌘')
        .replace(/Ctrl/gi, 'Ctrl')
        .replace(/Shift/gi, isMac ? '⇧' : 'Shift')
        .replace(/Alt/gi, isMac ? '⌥' : 'Alt')
        .replace(/Option/gi, '⌥')
        .replace(/\+/g, isMac ? ' ' : '+')
}

// 将快捷键转换为内部匹配格式
function toMagicKeysFormat(keyString: string): string {
    // 规范化顺序: ctrl/meta > shift > alt > key
    const parts = keyString.split('+').map(p => p.trim())
    const modifiers: string[] = []
    let mainKey = ''

    for (const part of parts) {
        const lower = part.toLowerCase()
        if (lower === 'cmdorctrl' || lower === 'cmd') {
            modifiers.push('meta')
        } else if (lower === 'ctrl') {
            modifiers.push('ctrl')
        } else if (lower === 'shift') {
            modifiers.push('shift')
        } else if (lower === 'alt' || lower === 'option') {
            modifiers.push('alt')
        } else {
            mainKey = lower
        }
    }

    // 按固定顺序排列修饰符
    const order = ['ctrl', 'meta', 'shift', 'alt']
    modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b))

    return mainKey ? [...modifiers, mainKey].join('+') : modifiers.join('+')
}

// 全局快捷键管理器
class ShortcutManager {
    private actions = new Map<string, ShortcutAction>()
    private configs = new Map<string, ShortcutConfig>()
    private disposables: (() => void)[] = []
    private currentScope = ref('global')
    private magicKeys: ReturnType<typeof useMagicKeys> | null = null

    constructor() {
        // 初始化内置快捷键配置
        BUILTIN_SHORTCUTS.forEach(config => {
            this.configs.set(config.id, { ...config })
        })
    }

    // 初始化 magic keys
    init() {
        if (this.magicKeys) return

        // 只使用 useMagicKeys 来追踪按键状态，不用它的监听功能
        this.magicKeys = useMagicKeys({ passive: true })

        // 使用自定义键盘事件监听，精确匹配
        const handleKeyDown = (e: KeyboardEvent) => {
            const keyCombo = this.getKeyCombo(e)
            console.log('[Shortcut] Key pressed:', keyCombo, 'event:', e.key, e.code, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'shift:', e.shiftKey)
            const action = this.findActionByKey(keyCombo)
            console.log('[Shortcut] Action found:', action?.id)

            if (action && this.shouldTrigger(action)) {
                console.log('[Shortcut] Triggering:', action.id)
                e.preventDefault()
                e.stopPropagation()
                this.execute(action.id)
            }
        }

        window.addEventListener('keydown', handleKeyDown, true)
        this.disposables.push(() => window.removeEventListener('keydown', handleKeyDown, true))
    }

    // 获取按键组合字符串
    private getKeyCombo(e: KeyboardEvent): string {
        const parts: string[] = []
        if (e.ctrlKey) parts.push('ctrl')
        if (e.metaKey) parts.push('meta')
        if (e.altKey) parts.push('alt')
        if (e.shiftKey) parts.push('shift')
        // 使用 code 获取物理按键（如 KeyK），去掉 "Key" 前缀并转小写
        // 避免 Shift 导致的大小写问题
        const code = e.code
        let key: string
        if (code.startsWith('Key')) {
            key = code.slice(3).toLowerCase()
        } else if (code.startsWith('Digit')) {
            key = code.slice(5)
        } else {
            key = e.key.toLowerCase()
        }
        parts.push(key)
        return parts.join('+')
    }

    // 根据按键查找动作
    private findActionByKey(keyCombo: string): ShortcutAction | null {
        for (const [id, config] of this.configs) {
            if (!config.enabled) continue
            const configKey = toMagicKeysFormat(config.currentKey || config.defaultKey)
            if (configKey === keyCombo) {
                const action = this.actions.get(id)
                if (action) return action
            }
        }
        return null
    }

    // 判断是否应该触发
    private shouldTrigger(action: ShortcutAction): boolean {
        const config = this.configs.get(action.id)
        if (!config || !config.enabled) return false
        if (action.when && !action.when()) return false

        // 检查作用域
        if (config.scope !== 'global' && config.scope !== this.currentScope.value) {
            return false
        }

        // 检查当前焦点是否在输入框
        const activeElement = document.activeElement
        const isInputFocused = activeElement?.tagName === 'INPUT' ||
            activeElement?.tagName === 'TEXTAREA' ||
            (activeElement as HTMLElement)?.isContentEditable

        // 如果输入框聚焦，只允许特定快捷键
        if (isInputFocused) {
            const allowedInInput = ['global.search', 'global.settings', 'navigation.switchToChat',
                'navigation.switchToNotes', 'navigation.switchToImage',
                'navigation.switchToSettings', 'chat.clearContext', 'chat.toggleTerminal']
            if (!allowedInInput.includes(action.id)) return false
        }

        return true
    }

    // 注册动作
    register(action: ShortcutAction) {
        this.actions.set(action.id, action)
    }

    // 注销动作
    unregister(id: string) {
        this.actions.delete(id)
    }

    // 执行动作
    execute(id: string) {
        const action = this.actions.get(id)
        if (action && this.shouldTrigger(action)) {
            action.handler()
        }
    }

    // 更新快捷键配置
    updateConfig(id: string, updates: Partial<ShortcutConfig>) {
        const config = this.configs.get(id)
        if (config) {
            Object.assign(config, updates)
            // 重新初始化以应用新快捷键
            this.dispose()
            this.init()
        }
    }

    // 设置当前作用域
    setScope(scope: string) {
        this.currentScope.value = scope
    }

    // 获取所有配置
    getConfigs(): ShortcutConfig[] {
        return Array.from(this.configs.values())
    }

    // 获取单个配置
    getConfig(id: string): ShortcutConfig | undefined {
        return this.configs.get(id)
    }

    // 清理
    dispose() {
        this.disposables.forEach(dispose => dispose())
        this.disposables = []
    }
}

// 全局单例
const manager = new ShortcutManager()

// Composable
export function useShortcuts() {
    onMounted(() => {
        manager.init()
    })

    onUnmounted(() => {
        // 不在这里 dispose，因为是全局的
    })

    return {
        /**
         * 注册快捷键动作
         */
        register: (action: ShortcutAction) => manager.register(action),

        /**
         * 注销快捷键动作
         */
        unregister: (id: string) => manager.unregister(id),

        /**
         * 执行快捷键动作
         */
        execute: (id: string) => manager.execute(id),

        /**
         * 更新快捷键配置
         */
        updateConfig: (id: string, updates: Partial<ShortcutConfig>) => manager.updateConfig(id, updates),

        /**
         * 设置当前作用域
         */
        setScope: (scope: string) => manager.setScope(scope),

        /**
         * 获取所有快捷键配置
         */
        getConfigs: () => manager.getConfigs(),

        /**
         * 获取单个快捷键配置
         */
        getConfig: (id: string) => manager.getConfig(id),

        /**
         * 格式化快捷键显示
         */
        format: formatShortcut
    }
}

// 用于组件内监听特定快捷键
export function useShortcut(
    key: MaybeRefOrGetter<string>,
    handler: (e: KeyboardEvent) => void,
    options: {
        prevent?: boolean
        stop?: boolean
        when?: MaybeRefOrGetter<boolean>
    } = {}
) {
    const { prevent = true, stop = false, when = true } = options

    useEventListener('keydown', (e: KeyboardEvent) => {
        const keyValue = toValue(key)
        const whenValue = toValue(when)

        if (!whenValue) return

        const magicFormat = toMagicKeysFormat(keyValue)
        const parts = magicFormat.split('+')

        const ctrlRequired = parts.includes('ctrl')
        const metaRequired = parts.includes('meta')
        const shiftRequired = parts.includes('shift')
        const altRequired = parts.includes('alt')
        const mainKey = parts.filter(p => !['ctrl', 'meta', 'shift', 'alt'].includes(p)).pop()

        if (
            e.ctrlKey === ctrlRequired &&
            e.metaKey === metaRequired &&
            e.shiftKey === shiftRequired &&
            e.altKey === altRequired &&
            e.key.toLowerCase() === mainKey
        ) {
            if (prevent) e.preventDefault()
            if (stop) e.stopPropagation()
            handler(e)
        }
    })
}
