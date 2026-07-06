<template>
  <Teleport to="body">
    <div v-if="visible" class="memory-monitor"
      :class="{ 'memory-monitor--collapsed': collapsed }"
      :style="panelPos.x >= 0 && panelPos.y >= 0 ? { left: panelPos.x + 'px', top: panelPos.y + 'px', bottom: 'auto', right: 'auto' } : {}">
      <div class="memory-monitor-header"
        :class="{ 'sampling-paused': !sampling }"
        @mousedown="startDrag"
        @dblclick="collapsed = !collapsed">
        <span class="memory-monitor-title">
          <div style="margin-right: 10px;">内存监测</div>
          <span v-if="!sampling" class="sampling-badge">已暂停</span>
        </span>
        <div class="memory-monitor-actions">
          <button class="memory-monitor-btn" @click.stop="copyReport" title="复制完整报告">
            {{ copyBtnText }}
          </button>
          <button class="memory-monitor-btn" @click.stop="toggleSampling" :title="sampling ? '暂停采样' : '继续采样'">
            {{ sampling ? '⏸' : '▶' }}
          </button>
          <button class="memory-monitor-btn" @click.stop="restartSampling" title="重新开始采样（清空历史并立即采样）">
            ⟳
          </button>
          <button class="memory-monitor-btn" @click.stop="forceGc" title="强制 GC（仅 Chrome）">
            GC
          </button>
          <button class="memory-monitor-btn" @click.stop="collapsed = !collapsed" :title="collapsed ? '展开' : '收起'">
            {{ collapsed ? '▾' : '▴' }}
          </button>
          <button class="memory-monitor-btn" @click.stop="visible = false" title="关闭">
            ×
          </button>
        </div>
      </div>

      <div v-if="!collapsed" class="memory-monitor-body">
        <!-- 实时数字 -->
        <div class="memory-stat" :class="statClass(jsHeapUsed)">
          <div class="memory-stat-label">
            JS 堆<span v-if="jsHeapSource === 'process'" class="source-mark" title="数据来源于 app.getAppMetrics（进程级 privateBytes），非 V8 堆"> *</span>
            <span class="source-label">{{ jsHeapSource === 'process' ? '（进程内存）' : '（已用）' }}</span>
          </div>
          <div class="memory-stat-value">{{ formatMb(jsHeapUsed) }}</div>
          <div class="memory-stat-bar">
            <div class="memory-stat-bar-fill" :style="{ width: barWidth(jsHeapUsed, jsHeapLimit) }"></div>
          </div>
        </div>

        <div class="memory-stat">
        <div class="memory-stat-label">
          JS 堆<span v-if="jsHeapSource === 'process'" class="source-mark" title="Working Set Size（进程级）"> *</span>
          <span class="source-label">{{ jsHeapSource === 'process' ? '（WSS）' : '（总量）' }}</span>
        </div>
        <div class="memory-stat-value">{{ formatMb(jsHeapTotal) }}</div>
      </div>

        <div v-if="jsHeapSource === 'v8'" class="memory-stat">
          <div class="memory-stat-label">JS 堆 (上限)</div>
          <div class="memory-stat-value">{{ formatMb(jsHeapLimit) }}</div>
        </div>

        <div class="memory-stat" :class="statClass(domNodes * 0.0001)">
          <div class="memory-stat-label">DOM 节点</div>
          <div class="memory-stat-value">{{ domNodes.toLocaleString() }}</div>
        </div>

        <div class="memory-stat">
          <div class="memory-stat-label">Detached DOM</div>
          <div class="memory-stat-value">{{ detachedDom }}</div>
        </div>

        <div class="memory-stat">
          <div class="memory-stat-label">Canvas</div>
          <div class="memory-stat-value">{{ canvasCount }}</div>
        </div>

        <div class="memory-stat">
          <div class="memory-stat-label">IMG</div>
          <div class="memory-stat-value">{{ imgCount }}</div>
        </div>

        <div class="memory-stat">
          <div class="memory-stat-label">Video / Audio</div>
          <div class="memory-stat-value">{{ videoCount }} / {{ audioCount }}</div>
        </div>

        <!-- 分隔线 -->
        <div class="memory-divider"></div>

        <!-- 进程内存详情：按类型分组，每个进程单独显示 -->
        <div class="memory-section-title">进程内存（按类型分组）</div>

        <div v-for="g in groupedProcesses" :key="g.type" class="process-group">
          <div class="process-group-header" :class="groupClass(g)">
            <span class="process-group-name">{{ g.label }}</span>
            <span class="process-group-count" v-if="g.items.length > 1">×{{ g.items.length }}</span>
            <span class="process-group-sum">{{ formatMb(g.sum * 1024) }}</span>
          </div>
          <div v-for="p in g.items" :key="p.pid" class="process-row" :class="processClass(p)">
            <span class="process-row-pid">PID {{ p.pid }}</span>
            <span class="process-row-name">{{ processDetail(p) }}</span>
            <span class="process-row-mem">{{ formatProcessMem(p) }}</span>
          </div>
        </div>

        <div class="memory-stat memory-stat-total">
          <div class="memory-stat-label">进程总计</div>
          <div class="memory-stat-value">{{ formatMb(totalProcessMem * 1024) }}</div>
        </div>

        <!-- 趋势图 -->
        <div class="memory-chart">
          <div class="memory-chart-title">
            {{ jsHeapSource === 'process' ? '渲染进程内存趋势' : 'JS 堆趋势' }}（最近 {{ history.length }} 个采样点）
          </div>
          <svg class="memory-chart-svg" :viewBox="`0 0 ${chartWidth} ${chartHeight}`" preserveAspectRatio="none">
            <!-- 网格线 -->
            <line v-for="i in 4" :key="'grid-' + i"
              :x1="0" :x2="chartWidth"
              :y1="(chartHeight / 4) * (i - 1)" :y2="(chartHeight / 4) * (i - 1)"
              class="chart-gridline" stroke-width="1" />
            <!-- 上限线 -->
            <line v-if="jsHeapLimit > 0"
              :x1="0" :x2="chartWidth"
              :y1="chartHeight - (jsHeapLimit / maxChartValue) * chartHeight"
              :y2="chartHeight - (jsHeapLimit / maxChartValue) * chartHeight"
              class="chart-limitline" stroke-width="1" stroke-dasharray="4,2" />
            <!-- 已用堆曲线 -->
            <polyline
              :points="chartPoints"
              fill="none"
              :stroke="chartColor"
              stroke-width="1.5" />
            <!-- 已用堆填充 -->
            <polygon
              :points="`0,${chartHeight} ${chartPoints} ${chartWidth},${chartHeight}`"
              :fill="chartColor"
              fill-opacity="0.15" />
          </svg>
          <div class="memory-chart-legend">
            <span>0</span>
            <span>{{ formatMb(maxChartValue) }}</span>
          </div>
        </div>

        <!-- 提示 -->
        <div class="memory-monitor-tip">
          快捷键 Ctrl+Shift+P 切换显示
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'

const visible = ref(false)
const collapsed = ref(false)

// 拖拽相关
const panelPos = ref({ x: -1, y: -1 }) // -1 表示使用默认位置（右下角）
let dragging = false
let dragOffset = { x: 0, y: 0 }

const startDrag = (e: MouseEvent) => {
  // 点击按钮时不拖拽
  if ((e.target as HTMLElement).closest('.memory-monitor-btn')) return
  // 左键才拖拽
  if (e.button !== 0) return

  const panel = (e.currentTarget as HTMLElement).closest('.memory-monitor') as HTMLElement
  if (!panel) return

  const rect = panel.getBoundingClientRect()
  // 首次拖拽时，固定当前位置为起点
  if (panelPos.value.x < 0 || panelPos.value.y < 0) {
    panelPos.value = { x: rect.left, y: rect.top }
  }
  dragging = true
  dragOffset = { x: e.clientX - panelPos.value.x, y: e.clientY - panelPos.value.y }

  const onMove = (ev: MouseEvent) => {
    if (!dragging) return
    panelPos.value = {
      x: Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - dragOffset.x)),
      y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dragOffset.y))
    }
  }
  const onUp = () => {
    dragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const jsHeapUsed = ref(0)
const jsHeapTotal = ref(0)
const jsHeapLimit = ref(0)
const jsHeapSource = ref<'v8' | 'process'>('v8')
const domNodes = ref(0)
const detachedDom = ref('—')
const canvasCount = ref(0)
const imgCount = ref(0)
const videoCount = ref(0)
const audioCount = ref(0)

// 进程内存数据（来自主进程 app.getAppMetrics）
interface ProcessMetric {
  type: string // 'Browser' | 'Renderer' | 'GPU' | 'Utility' | ...
  pid: number
  memory?: {
    workingSetSize?: number // KB
    privateBytes?: number // KB
    sharedBytes?: number // KB
  }
  url?: string
  name?: string
}
const processMetrics = ref<ProcessMetric[]>([])

const totalProcessMem = computed(() => {
  return processMetrics.value.reduce((sum, p) => sum + (p.memory?.workingSetSize || 0), 0)
})

const formatProcessMem = (p: ProcessMetric) => {
  const kb = p.memory?.workingSetSize || 0
  return formatMb(kb * 1024)
}

const processClass = (p: ProcessMetric) => {
  const mb = (p.memory?.workingSetSize || 0) / 1024
  if (mb > 800) return 'stat-danger'
  if (mb > 400) return 'stat-warning'
  return ''
}

// 进程类型 -> 中文标签 + 排序权重
const PROCESS_TYPE_META: Record<string, { label: string; order: number }> = {
  Browser:        { label: '主进程 (Browser)',     order: 0 },
  Renderer:       { label: '渲染进程 (Renderer)',  order: 1 },
  GPU:            { label: 'GPU 进程',             order: 2 },
  Utility:        { label: 'Utility 进程',         order: 3 },
  Worker:         { label: 'Worker 进程',          order: 4 },
  Zygote:         { label: 'Zygote',               order: 5 },
  SandboxHelper:  { label: 'Sandbox Helper',       order: 6 },
  PumpHook:       { label: 'PumpHook',             order: 7 },
  Unknown:        { label: '未知进程',             order: 8 }
}

interface ProcessGroup {
  type: string
  label: string
  order: number
  items: ProcessMetric[]
  sum: number // KB
}

// 按类型分组，组内按内存降序
const groupedProcesses = computed<ProcessGroup[]>(() => {
  const map = new Map<string, ProcessGroup>()
  for (const p of processMetrics.value) {
    const meta = PROCESS_TYPE_META[p.type] || { label: p.type, order: 99 }
    if (!map.has(p.type)) {
      map.set(p.type, {
        type: p.type,
        label: meta.label,
        order: meta.order,
        items: [],
        sum: 0
      })
    }
    const g = map.get(p.type)!
    g.items.push(p)
    g.sum += p.memory?.workingSetSize || 0
  }
  // 组内按内存降序
  for (const g of map.values()) {
    g.items.sort((a, b) => (b.memory?.workingSetSize || 0) - (a.memory?.workingSetSize || 0))
  }
  // 组间按 order 升序
  return Array.from(map.values()).sort((a, b) => a.order - b.order)
})

const groupClass = (g: ProcessGroup) => {
  const mb = g.sum / 1024
  if (mb > 1000) return 'stat-danger'
  if (mb > 500) return 'stat-warning'
  return ''
}

// 进程的详细描述（URL/名称/CPU 占用）
const processDetail = (p: ProcessMetric) => {
  if (p.type === 'Renderer' && p.url) {
    try {
      const u = new URL(p.url)
      const path = u.pathname.length > 1 ? u.pathname : ''
      return (u.hostname || 'renderer') + path
    } catch {
      return p.url
    }
  }
  if (p.type === 'Utility' && p.name) {
    return p.name
  }
  if (p.type === 'Worker' && p.url) {
    return p.url.split('/').pop() || p.url
  }
  return ''
}

interface HistoryPoint {
  t: number
  used: number
}
const history = ref<HistoryPoint[]>([])
const MAX_HISTORY = 120

let timer: ReturnType<typeof setInterval> | null = null

const formatMb = (bytes: number) => {
  if (!bytes) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const statClass = (val: number) => {
  if (val > 800 * 1024 * 1024) return 'stat-danger'
  if (val > 500 * 1024 * 1024) return 'stat-warning'
  return ''
}

const barWidth = (used: number, limit: number) => {
  if (!limit) return '0%'
  return `${Math.min(100, (used / limit) * 100)}%`
}

const chartWidth = 280
const chartHeight = 80

const maxChartValue = computed(() => {
  if (!history.value.length) return 1024 * 1024 * 1024
  const maxUsed = Math.max(...history.value.map(p => p.used))
  const limit = jsHeapLimit.value || maxUsed
  return Math.max(maxUsed * 1.2, limit)
})

const chartPoints = computed(() => {
  if (history.value.length < 2) return ''
  const max = maxChartValue.value
  return history.value
    .map((p, i) => {
      const x = (i / (MAX_HISTORY - 1)) * chartWidth
      const y = chartHeight - (p.used / max) * chartHeight
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const chartColor = computed(() => {
  if (jsHeapUsed.value > 800 * 1024 * 1024) return '#ff6b6b'
  if (jsHeapUsed.value > 500 * 1024 * 1024) return '#ffa940'
  return '#52c41a'
})

const sample = () => {
  // JS 堆内存：优先使用 performance.memory（V8 堆），回退到当前渲染进程的 OS 级内存
  const mem = (performance as any).memory
  const hasJSHeap = mem && typeof mem.usedJSHeapSize === 'number' && mem.usedJSHeapSize > 0
  if (hasJSHeap) {
    jsHeapUsed.value = mem.usedJSHeapSize
    jsHeapTotal.value = mem.totalJSHeapSize
    jsHeapLimit.value = mem.jsHeapSizeLimit
    jsHeapSource.value = 'v8'
  }

  // DOM 节点（浏览器内部计数器，O(1)）
  domNodes.value = document.getElementsByTagName('*').length

  // Detached DOM：DevTools 才能统计，这里显示 —
  // 如需检测，用 DevTools Memory 面板的 "Detached elements" 选项

  canvasCount.value = document.getElementsByTagName('canvas').length
  imgCount.value = document.getElementsByTagName('img').length
  videoCount.value = document.getElementsByTagName('video').length
  audioCount.value = document.getElementsByTagName('audio').length

  // 获取所有进程内存指标（主进程/渲染进程/GPU/Utility）
  if (window.api?.getProcessMetrics) {
    window.api.getProcessMetrics().then((metrics: ProcessMetric[]) => {
      // 按 workingSetSize 降序，最大的渲染进程排最前
      processMetrics.value = (metrics || [])
        .filter(p => p.memory?.workingSetSize)
        .sort((a, b) => (b.memory?.workingSetSize || 0) - (a.memory?.workingSetSize || 0))

      // 回退：若 V8 堆 API 不可用，用当前渲染进程的 privateBytes 作为近似
      // 使用 PID 匹配（通过 preload 桥接）而非 URL 匹配，避免生产环境下 URL 格式不一致导致匹配失败
      if (!hasJSHeap) {
        try {
          const currentPid = window.api?.process?.pid
          const currentProcess = metrics.find(
            p => p.type === 'Renderer' && p.pid === currentPid && (p.memory?.privateBytes ?? 0) > 0
          )
          if (currentProcess?.memory?.privateBytes) {
            jsHeapUsed.value = currentProcess.memory.privateBytes * 1024   // KB → bytes
            jsHeapTotal.value = (currentProcess.memory.workingSetSize ?? 0) * 1024
            jsHeapSource.value = 'process'
          }
        } catch {
          // 匹配失败时忽略
        }
      }
    }).catch(() => {
      // 主进程未注册时忽略
    })
  }

  // 历史记录
  history.value.push({
    t: Date.now(),
    used: jsHeapUsed.value
  })
  if (history.value.length > MAX_HISTORY) {
    history.value.shift()
  }
}

const forceGc = () => {
  if (typeof (window as any).gc === 'function') {
    ;(window as any).gc()
    setTimeout(sample, 100)
  } else {
    console.warn('强制 GC 需要 --js-flags="--expose-gc" 启动参数')
  }
}

// —— 采样控制 ——
// sampling: 当前是否在采样（true=采样中，false=已暂停）
// paused:   暂停期间不更新数据，但保留历史
const sampling = ref(true)

const toggleSampling = () => {
  if (sampling.value) {
    // 暂停
    sampling.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  } else {
    // 继续
    sampling.value = true
    start()
  }
}

// 重新开始采样：清空历史 + 立即采样一次 + 重启定时器
const restartSampling = () => {
  history.value = []
  sampling.value = true
  // 重启定时器
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  start()
}

// —— 一键复制报告 ——
const copyBtnText = ref('复制')

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const buildReport = () => {
  const now = new Date()
  const ts = now.toLocaleString('zh-CN', { hour12: false })
  const uptimeSec = Math.floor((Date.now() - (performance.timeOrigin)) / 1000)
  const uptimeStr = `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`

  const lines: string[] = []
  lines.push('========================================')
  lines.push('  内存监测报告 - agent-qi-electron')
  lines.push('========================================')
  lines.push(`生成时间: ${ts}`)
  lines.push(`页面运行: ${uptimeStr}`)
  lines.push('')
  lines.push('【渲染进程 - V8 堆】')
  lines.push(`  JS 堆已用:   ${formatBytes(jsHeapUsed.value)}`)
  lines.push(`  JS 堆总量:   ${formatBytes(jsHeapTotal.value)}`)
  lines.push(`  JS 堆上限:   ${formatBytes(jsHeapLimit.value)}`)
  lines.push(`  堆使用率:    ${jsHeapLimit.value > 0 ? (jsHeapUsed.value / jsHeapLimit.value * 100).toFixed(1) : '0'}%`)
  lines.push('')
  lines.push('【渲染进程 - DOM】')
  lines.push(`  DOM 节点数:  ${domNodes.value}`)
  lines.push(`  Canvas:      ${canvasCount.value}`)
  lines.push(`  IMG:         ${imgCount.value}`)
  lines.push(`  Video:       ${videoCount.value}`)
  lines.push(`  Audio:       ${audioCount.value}`)
  lines.push('')

  lines.push('【进程内存 - Chromium】')
  for (const g of groupedProcesses.value) {
    lines.push('')
    lines.push(`■ ${g.label}${g.items.length > 1 ? ` (×${g.items.length})` : ''} — 合计 ${formatBytes(g.sum * 1024)}`)
    for (const p of g.items) {
      const detail = processDetail(p)
      const mem = formatBytes((p.memory?.workingSetSize || 0) * 1024)
      const privateBytes = p.memory?.privateBytes ? ` / private ${formatBytes(p.memory.privateBytes * 1024)}` : ''
      lines.push(`  PID ${p.pid}${detail ? `  ${detail}` : ''}  ${mem}${privateBytes}`)
    }
  }
  lines.push('')
  lines.push(`□ 进程总计: ${formatBytes(totalProcessMem.value * 1024)}`)

  if (history.value.length > 1) {
    lines.push('')
    lines.push('【JS 堆趋势（最近采样点）】')
    const recent = history.value.slice(-10)
    for (const p of recent) {
      const time = new Date(p.t).toLocaleTimeString('zh-CN', { hour12: false })
      lines.push(`  ${time}  ${formatBytes(p.used)}`)
    }
    const max = Math.max(...recent.map(p => p.used))
    const min = Math.min(...recent.map(p => p.used))
    lines.push(`  最近 ${recent.length} 点: 最小 ${formatBytes(min)} / 最大 ${formatBytes(max)}`)
  }

  lines.push('')
  lines.push('========================================')
  return lines.join('\n')
}

const copyReport = async () => {
  const report = buildReport()
  try {
    await navigator.clipboard.writeText(report)
    copyBtnText.value = '已复制'
  } catch {
    // 降级方案
    const ta = document.createElement('textarea')
    ta.value = report
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      copyBtnText.value = '已复制'
    } catch {
      copyBtnText.value = '失败'
    }
    document.body.removeChild(ta)
  }
  setTimeout(() => {
    copyBtnText.value = '复制'
  }, 1500)
}

const start = () => {
  if (timer) return
  sample()
  timer = setInterval(sample, 1000)
}

const stop = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

watch(visible, (v) => {
  if (v) start()
  else stop()
})

// 快捷键 Ctrl+Shift+P（避开与「切换模型」Ctrl+Shift+M 及 DevTools Ctrl+Shift+I 的冲突）
const keys = useMagicKeys()
const toggleKey = keys['Ctrl+Shift+P']
watch(toggleKey, (v) => {
  if (v) visible.value = !visible.value
})

onMounted(() => {
  if (visible.value) start()
})

onBeforeUnmount(() => {
  stop()
})
</script>

<style scoped>

.memory-monitor {
  position: fixed;
  z-index: 99999;
  width: 320px;
  background: var(--modal-bg);
  color: var(--text-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-color);
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  backdrop-filter: blur(12px);
  user-select: none;
}

/* 未拖拽过时使用默认位置（右下角） */
.memory-monitor:not([style*="left"]) {
  bottom: 12px;
  right: 12px;
}

.memory-monitor--collapsed {
  width: auto;
}

.memory-monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: move;
  border-bottom: 1px solid var(--border-color-light);
  user-select: none;
}

.memory-monitor-header:active {
  cursor: moving;
}

.memory-monitor--collapsed .memory-monitor-header {
  border-bottom: none;
}

.memory-monitor-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sampling-badge {
  font-size: 9px;
  font-weight: 500;
  padding: 1px 5px;
  background: rgba(255, 169, 64, 0.2);
  color: #ffa940;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 暂停时标题区背景变淡 */
.memory-monitor-header.sampling-paused {
  background: var(--bg-hover);
}

.memory-monitor-actions {
  display: flex;
  gap: 4px;
}

.memory-monitor-btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.memory-monitor-btn:hover {
  background: var(--bg-active);
}

.memory-monitor-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 70vh;
  overflow-y: auto;
}

.memory-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.memory-stat-label {
  flex: 0 0 100px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.memory-stat-value {
  flex: 1;
  text-align: right;
  font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
}

.memory-stat.stat-warning .memory-stat-value {
  color: var(--color-warning);
}

.memory-stat.stat-danger .memory-stat-value {
  color: var(--color-danger);
}

.memory-divider {
  height: 1px;
  background: var(--border-color-light);
  margin: 6px 0;
}

.memory-section-title {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.memory-stat-total {
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
  padding-top: 6px;
}

.memory-stat-total .memory-stat-label,
.memory-stat-total .memory-stat-value {
  color: var(--text-primary);
  font-weight: 600;
}

/* 进程分组样式 */
.process-group {
  margin-bottom: 6px;
}

.process-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: var(--bg-hover);
  border-radius: 4px;
  margin-bottom: 2px;
}

.process-group-name {
  flex: 1;
  color: var(--text-primary);
  font-weight: 600;
  font-size: 11px;
}

.process-group-count {
  color: var(--text-tertiary);
  font-size: 10px;
  background: var(--bg-active);
  padding: 1px 5px;
  border-radius: 8px;
}

.process-group-sum {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.process-group-header.stat-warning .process-group-sum { color: var(--color-warning); }
.process-group-header.stat-danger .process-group-sum { color: var(--color-danger); }

/* 单个进程行 */
.process-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 3px 14px;
  font-size: 11px;
  border-left: 1px solid var(--border-color-light);
  margin-left: 4px;
}

.process-row-pid {
  flex: 0 0 60px;
  color: var(--text-tertiary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.process-row-name {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-row-mem {
  flex: 0 0 auto;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.process-row.stat-warning .process-row-mem { color: var(--color-warning); }
.process-row.stat-danger .process-row-mem { color: var(--color-danger); }

.memory-stat-bar {
  flex: 0 0 60px;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}

.memory-stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-success), var(--color-warning), var(--color-danger));
  transition: width 0.3s;
}

.memory-chart {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color-light);
}

.memory-chart-title {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.memory-chart-svg {
  width: 100%;
  height: 80px;
  display: block;
}

.memory-chart-legend {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--text-disabled);
  margin-top: 2px;
}

/* SVG 内网格线和上限线 — 通过 CSS class 设置颜色，适配主题 */
:global(.chart-gridline) {
  stroke: var(--border-color);
}
:global(.chart-limitline) {
  stroke: rgba(var(--color-danger-rgb), 0.35);
}

/* JS 堆数据来源标记 */
.source-mark {
  font-size: 10px;
  color: var(--color-warning);
  cursor: help;
}
.source-label {
  font-size: 10px;
  color: var(--text-tertiary);
}

.memory-monitor-tip {
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-disabled);
  text-align: center;
}

/* 滚动条 */
.memory-monitor-body::-webkit-scrollbar {
  width: 6px;
}
.memory-monitor-body::-webkit-scrollbar-track {
  background: transparent;
}
.memory-monitor-body::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
</style>
