import { ref } from 'vue'

export type PreviewLogItem = {
  id: string
  kind: 'console' | 'error' | 'ready'
  level?: string
  text: string
}

export function useCanvasPreview() {
  const previewLogs = ref<PreviewLogItem[]>([])

  const appendPreviewLog = (item: Omit<PreviewLogItem, 'id'>) => {
    previewLogs.value = [
      ...previewLogs.value.slice(-79),
      { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
    ]
  }

  const handleSandboxEvent = (payload: any) => {
    if (payload.kind === 'ready') {
      appendPreviewLog({ kind: 'ready', text: payload.entryPath ? `Preview ready: ${payload.entryPath}` : 'Preview ready' })
      return
    }
    if (payload.kind === 'console') {
      appendPreviewLog({ kind: 'console', level: payload.level, text: payload.text || '' })
      return
    }
    if (payload.kind === 'error') {
      appendPreviewLog({ kind: 'error', text: payload.text || 'Unknown sandbox error' })
    }
  }

  return { previewLogs, appendPreviewLog, handleSandboxEvent }
}
