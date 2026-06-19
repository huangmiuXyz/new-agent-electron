import type { Plugin, PluginContext } from '@agent-qi/types'
import { createStatusRender, type UsageData, type UsageEntry } from './status-indicator'

const PLUGIN_NAME = 'opencode-usage-monitor'
const STATUS_ID = 'opencode-usage-status'
const STORAGE_KEY = 'opencode_usage_monitor_config'

interface PluginConfig {
  workspaceId: string
  authCookie: string
  refreshInterval: number
}

const DEFAULT_CONFIG: PluginConfig = {
  workspaceId: '',
  authCookie: '',
  refreshInterval: 60000
}

const USAGE_JS_PATTERN = /(rollingUsage|weeklyUsage|monthlyUsage):\s*\$R\[\d+\]\s*=\s*\{\s*status:\s*"([^"]+)",\s*resetInSec:\s*(\d+),\s*usagePercent:\s*(\d+)\s*\}/g

const formatResetTime = (seconds: number): string => {
  if (seconds <= 0) return '已重置'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}天${hours}小时后`)
  else if (hours > 0) parts.push(`${hours}小时${minutes}分后`)
  else if (minutes > 0) parts.push(`${minutes}分${secs}秒后`)
  else parts.push(`${secs}秒后`)
  return parts.join('')
}

const parseUsageHtml = (html: string): UsageData => {
  const data: UsageData = {
    rolling: null,
    weekly: null,
    monthly: null,
    lastUpdated: Date.now()
  }

  const matches = html.matchAll(USAGE_JS_PATTERN)
  for (const match of matches) {
    const field = match[1]
    const status = match[2]
    const resetInSec = parseInt(match[3], 10)
    const percentage = parseInt(match[4], 10)

    const type = field.replace('Usage', '') as 'rolling' | 'weekly' | 'monthly'
    const entry: UsageEntry = {
      type,
      percentage,
      resetsIn: formatResetTime(resetInSec),
      resetInSec,
      status
    }
    data[type] = entry
  }

  return data
}

const plugin: Plugin = {
  name: PLUGIN_NAME,
  version: '1.0.0',
  description: '实时查看 OpenCode Go 用量',
  install: async (context: PluginContext) => {
    let config: PluginConfig = { ...DEFAULT_CONFIG }
    let usageData: UsageData | null = null
    let refreshTimer: ReturnType<typeof setInterval> | null = null
    let isStatusRegistered = false
    const usageDataState = context.vue.ref<UsageData | null>(null)
    const isPanelOpenState = context.vue.ref(false)
    const isBusyState = context.vue.ref(false)
    const isConfiguredState = context.vue.ref(false)
    const statusTooltipState = context.vue.ref('OpenCode Go 用量')

    const loadConfig = async () => {
      try {
        const stored = await context.localforage.getItem<PluginConfig>(STORAGE_KEY)
        if (stored) {
          config = { ...DEFAULT_CONFIG, ...stored }
        }
      } catch (e) {
        console.error('Load config error:', e)
      }
      isConfiguredState.value = Boolean(config.workspaceId && config.authCookie)
    }

    const saveConfig = async (data?: Partial<PluginConfig>) => {
      try {
        if (data) config = { ...config, ...data }
        await context.localforage.setItem(STORAGE_KEY, config)
      } catch (e) {
        console.error('Save config error:', e)
      }
      isConfiguredState.value = Boolean(config.workspaceId && config.authCookie)
    }

    const queryUsage = async (): Promise<UsageData | null> => {
      if (!config.workspaceId || !config.authCookie) {
        return null
      }

      try {
        const url = `https://opencode.ai/workspace/${config.workspaceId}/go`
        const response = await context.api.net.fetch(url, {
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'cookie': `auth=${config.authCookie}; oc_locale=en`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        if (!response.ok) {
          console.error('Failed to fetch OpenCode Go usage:', response.status)
          return null
        }

        const html: string = response.text
        return parseUsageHtml(html)
      } catch (error) {
        console.error('Error fetching OpenCode Go usage:', error)
        return null
      }
    }

    const updateStatusIndicator = () => {
      usageDataState.value = usageData
      const tooltip = usageData
        ? `OpenCode Go: Rolling ${usageData.rolling?.percentage ?? '--'}% | Weekly ${usageData.weekly?.percentage ?? '--'}% | Monthly ${usageData.monthly?.percentage ?? '--'}%`
        : isConfiguredState.value
          ? 'OpenCode Go: 点击查看用量'
          : 'OpenCode Go: 未配置'
      statusTooltipState.value = tooltip

      if (isStatusRegistered) return

      const statusRender = createStatusRender({
        context,
        usageDataRef: usageDataState,
        isPanelOpenRef: isPanelOpenState,
        tooltipRef: statusTooltipState,
        isBusyRef: isBusyState,
        isConfiguredRef: isConfiguredState,
        onRefreshUsage: async () => {
          await refreshUsage(true)
        }
      })

        ; (context.notification.status as unknown as (
          id: string,
          text: string,
          options?: Record<string, unknown>
        ) => void)(STATUS_ID, '', {
          render: statusRender,
          tooltip,
          color: '#fff'
        })
      isStatusRegistered = true
    }

    const refreshUsage = async (notify = false) => {
      if (isBusyState.value) return
      isBusyState.value = true
      try {
        usageData = await queryUsage()
        updateStatusIndicator()
        if (notify && usageData) {
          context.notification.success('已刷新 OpenCode Go 用量。', PLUGIN_NAME)
        } else if (notify && !usageData && isConfiguredState.value) {
          context.notification.error('获取用量失败，请检查配置。', PLUGIN_NAME)
        }
      } catch (error) {
        console.error('Refresh usage error:', error)
        if (notify) {
          context.notification.error(
            error instanceof Error ? error.message : String(error),
            PLUGIN_NAME
          )
        }
      } finally {
        isBusyState.value = false
      }
    }

    const startAutoRefresh = () => {
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
      if (config.refreshInterval > 0) {
        refreshTimer = setInterval(() => {
          void refreshUsage(false).catch(() => undefined)
        }, config.refreshInterval)
      }
    }

    await loadConfig()
    await refreshUsage(false)
    startAutoRefresh()
    updateStatusIndicator()

    context.registerHook('ai:after-use', async () => {
      await refreshUsage(false)
    })

    const [ConfigForm] = context.useForm<PluginConfig>({
      title: 'OpenCode Go 用量监控',
      fields: [
        {
          name: 'workspaceId',
          label: 'Workspace ID',
          type: 'text',
          placeholder: 'wrk_xxx...'
        },
        {
          name: 'authCookie',
          label: 'Auth Cookie',
          type: 'password',
          placeholder: '从浏览器 Cookie 中获取 auth 值'
        },
        {
          name: 'refreshInterval',
          label: '刷新间隔 (毫秒)',
          type: 'number',
          placeholder: '60000'
        }
      ],
      initialData: config,
      onChange: async (_field, _value, data) => {
        await saveConfig(data)
        await refreshUsage(false)
        startAutoRefresh()
        updateStatusIndicator()
      }
    })

    context.registerSettings(ConfigForm)

    context.notification.success('OpenCode Go 用量监控插件已加载', PLUGIN_NAME)
  },

  uninstall: async (context: PluginContext) => {
    context.notification.removeStatus(STATUS_ID)
    context.unregisterSettings()
  }
}

export default plugin
