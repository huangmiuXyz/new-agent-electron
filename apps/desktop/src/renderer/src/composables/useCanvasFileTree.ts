import { ref, computed, type ComputedRef } from 'vue'
import { useVirtualList } from '@vueuse/core'
import {
  normalizeSandboxPath,
  type SandboxWorkspaceEntry,
} from '@renderer/services/sandbox'

export type TreeRow = {
  id: string
  name: string
  path: string
  type: 'directory' | 'file'
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}

export function useCanvasFileTree(options: {
  currentChatId: ComputedRef<string | undefined>
}) {
  const expandedDirectoryPaths = ref<string[]>([])
  const directoryEntries = ref<Record<string, SandboxWorkspaceEntry[]>>({})
  const SANDBOX_TREE_ROW_HEIGHT = 22

  const expandedDirectoryPathSet = computed(() => new Set(expandedDirectoryPaths.value))

  const sandboxTreeRows = computed<TreeRow[]>(() => {
    const rows: TreeRow[] = []
    const walk = (directoryPath: string, depth = 0) => {
      const entries = directoryEntries.value[directoryPath] || []
      for (const entry of entries) {
        const isExpanded =
          entry.type === 'directory' && expandedDirectoryPathSet.value.has(entry.path)
        rows.push({
          id: entry.path,
          name: entry.name,
          path: entry.path,
          type: entry.type,
          depth,
          hasChildren: entry.hasChildren,
          isExpanded
        })
        if (entry.type === 'directory' && isExpanded) {
          walk(entry.path, depth + 1)
        }
      }
    }
    walk('/')
    return rows
  })

  const {
    list: virtualSandboxTreeRows,
    containerProps: sandboxTreeContainerProps,
    wrapperProps: sandboxTreeWrapperProps
  } = useVirtualList(sandboxTreeRows, {
    itemHeight: SANDBOX_TREE_ROW_HEIGHT,
    overscan: 10
  })

  const availableDirectoryPathSet = computed(() => {
    const paths = new Set<string>()
    Object.entries(directoryEntries.value).forEach(([directoryPath, entries]) => {
      if (directoryPath !== '/') {
        paths.add(directoryPath)
      }
      entries.forEach((entry) => {
        if (entry.type === 'directory') {
          paths.add(entry.path)
        }
      })
    })
    return paths
  })

  const loadDirectory = (directoryPath = '/') => {
    const canvasStore = useCanvasStore()
    directoryEntries.value = {
      ...directoryEntries.value,
      [directoryPath]: canvasStore.listDirectory(directoryPath, options.currentChatId.value)
    }
  }

  const toggleDirectory = (path: string) => {
    const next = new Set(expandedDirectoryPaths.value)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    expandedDirectoryPaths.value = [...next]
  }

  const expandDirectory = (path: string) => {
    const next = new Set(expandedDirectoryPaths.value)
    next.add(path)
    expandedDirectoryPaths.value = [...next]
  }

  const getAncestorDirectoryPaths = (path?: string) => {
    if (!path) return []
    const parts = path.split('/').filter(Boolean)
    const ancestors: string[] = []
    let current = ''
    parts.slice(0, -1).forEach((part) => {
      current += `/${part}`
      ancestors.push(current)
    })
    return ancestors
  }

  const revealFileAncestors = (filePath?: string) => {
    if (!filePath) return
    const nextExpandedPaths = new Set(expandedDirectoryPaths.value)
    let changed = false
    getAncestorDirectoryPaths(filePath).forEach((path) => {
      if (!availableDirectoryPathSet.value.has(path) || nextExpandedPaths.has(path)) return
      nextExpandedPaths.add(path)
      changed = true
    })
    if (!changed) return
    expandedDirectoryPaths.value = [...nextExpandedPaths]
  }

  const handleTreeRowClick = (row: TreeRow) => {
    if (row.type === 'directory') {
      if (row.hasChildren) {
        if (expandedDirectoryPathSet.value.has(row.path)) {
          toggleDirectory(row.path)
        } else {
          loadDirectory(row.path)
          expandDirectory(row.path)
        }
      }
      return
    }
    const canvasStore = useCanvasStore()
    canvasStore.setActiveFilePath(row.path, options.currentChatId.value)
  }

  const getParentPath = (path: string) => {
    const normalizedPath = normalizeSandboxPath(path)
    const segments = normalizedPath.split('/').filter(Boolean)
    if (segments.length <= 1) return ''
    return `/${segments.slice(0, -1).join('/')}`
  }

  const refreshTreeDirectories = (paths: string[] = []) => {
    const directoriesToReload = new Set<string>(['/'])
    expandedDirectoryPaths.value.forEach((path) => {
      directoriesToReload.add(path)
    })
    paths.forEach((path) => {
      if (!path) return
      const normalizedPath = path === '/' ? '/' : normalizeSandboxPath(path)
      directoriesToReload.add(normalizedPath)
      const parentPath = getParentPath(normalizedPath)
      directoriesToReload.add(parentPath || '/')
    })
    directoriesToReload.forEach((path) => {
      loadDirectory(path)
    })
  }

  const resetTree = () => {
    directoryEntries.value = {}
    expandedDirectoryPaths.value = []
  }

  return {
    expandedDirectoryPaths,
    directoryEntries,
    sandboxTreeRows,
    virtualSandboxTreeRows,
    sandboxTreeContainerProps,
    sandboxTreeWrapperProps,
    availableDirectoryPathSet,
    loadDirectory,
    toggleDirectory,
    expandDirectory,
    revealFileAncestors,
    handleTreeRowClick,
    refreshTreeDirectories,
    resetTree,
  }
}
