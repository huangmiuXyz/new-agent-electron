import { type ComputedRef } from 'vue'
import type { TreeRow } from './useCanvasFileTree'
import type { MenuItem } from './useContextMenu'

export function useCanvasMenus(options: {
  showContextMenu: <T>(event: MouseEvent, items: MenuItem<T>[], data?: T) => void
  showTabContextMenu: (event: MouseEvent, items: MenuItem<{ filePath: string }>[], data: { filePath: string }) => void
  activeFilePath: { value: string }
  openFileTabs: { value: string[] }
  getPersistedFile: (path: string, opts?: { force?: boolean }) => { content: string } | null
  getDraftContent: (path: string) => string
  closeFileTab: (path: string) => void
  closeFileTabs: (paths: string[]) => void
  uploadCanvasFiles: (dir?: string) => void
  uploadCanvasFolder: (dir?: string) => void
  createFile: (dir?: string) => void
  createFolder: (dir?: string) => void
  renameTreeRow: (row: TreeRow) => void
  deleteTreeRow: (row: TreeRow) => void
  downloadCurrentFile: (path?: string) => void
  downloadDirectoryAsZip: (row: TreeRow) => void
  downloadAppAsZip: () => void
  openSaveAppModal: () => void
  openCanvasInTerminal: () => void
  openCanvasInLocalFolder: () => void
  syncLocalFolderToCanvas: () => void
  chooseLocalWorkspaceFolder: () => void
  toggleCanvasWorkspaceRoot: () => void
  clearCanvas: () => void
  hasCanvasFiles: ComputedRef<boolean>
  isUsingTempWorkspace: ComputedRef<boolean>
  currentChatAgentWorkspaceDir: ComputedRef<string>
}) {
  const icons = useIcon(['Download', 'FileZip', 'Plus', 'Folder', 'Refresh', 'Trash', 'Edit', 'Upload', 'Box', 'Terminal', 'Close', 'Check'])
  const DownloadIcon = icons.Download
  const FileZipIcon = icons.FileZip
  const AddIcon = icons.Plus
  const FolderIcon = icons.Folder
  const RefreshIcon = icons.Refresh
  const TrashIcon = icons.Trash
  const EditIcon = icons.Edit
  const UploadIcon = icons.Upload
  const BoxIcon = icons.Box
  const TerminalIcon = icons.Terminal
  const CloseIcon = icons.Close
  const CheckIcon = icons.Check

  const openTreeRowMenu = (event: MouseEvent, row: TreeRow) => {
    if (row.type === 'file') {
      options.activeFilePath.value = row.path
    }
    const items: MenuItem<TreeRow>[] = [
      ...(row.type === 'directory'
        ? [
            { label: '上传', icon: UploadIcon, children: [
              { label: '上传文件', icon: UploadIcon, onClick: (r: TreeRow) => { options.uploadCanvasFiles(r.path) } },
              { label: '上传文件夹', icon: FolderIcon, onClick: (r: TreeRow) => { options.uploadCanvasFolder(r.path) } },
            ]},
            { type: 'divider' as const },
            { label: '新建文件', icon: AddIcon, onClick: (r: TreeRow) => options.createFile(r.path) },
            { label: '新建文件夹', icon: FolderIcon, onClick: (r: TreeRow) => options.createFolder(r.path) },
            { type: 'divider' as const },
          ]
        : []),
      { label: row.type === 'directory' ? '重命名目录' : '重命名', icon: EditIcon, onClick: (r: TreeRow) => options.renameTreeRow(r) },
      ...(row.type === 'file'
        ? [{ label: '下载文件', icon: DownloadIcon, onClick: (r: TreeRow) => options.downloadCurrentFile(r.path) }]
        : [{ label: '下载目录', icon: DownloadIcon, onClick: (r: TreeRow) => { options.downloadDirectoryAsZip(r) } }]
      ),
      { label: row.type === 'directory' ? '删除目录' : '删除', icon: TrashIcon, danger: true, onClick: (r: TreeRow) => { options.deleteTreeRow(r) } },
    ]
    options.showContextMenu(event, items, row)
  }

  const openTreeBlankMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.sandbox-tree-row')) return
    const items: MenuItem<TreeRow>[] = [
      { label: '新建文件', icon: AddIcon, onClick: () => options.createFile('/') },
      { label: '新建文件夹', icon: FolderIcon, onClick: () => options.createFolder('/') },
      { type: 'divider' as const },
      { label: '上传', icon: UploadIcon, children: [
        { label: '上传文件', icon: UploadIcon, onClick: () => { options.uploadCanvasFiles('/') } },
        { label: '上传文件夹', icon: FolderIcon, onClick: () => { options.uploadCanvasFolder('/') } },
      ]},
    ]
    options.showContextMenu(event, items)
  }

  const openTabContextMenu = (event: MouseEvent, filePath: string) => {
    const currentIndex = options.openFileTabs.value.indexOf(filePath)
    const rightSideTabs = currentIndex >= 0 ? options.openFileTabs.value.slice(currentIndex + 1) : []
    const otherTabs = options.openFileTabs.value.filter((p) => p !== filePath)
    const savedTabs = options.openFileTabs.value.filter((p) => {
      const f = options.getPersistedFile(p)
      return !f || options.getDraftContent(p) === f.content
    })
    const items: MenuItem<{ filePath: string }>[] = [
      { label: '关闭', icon: CloseIcon, onClick: (d: { filePath: string }) => { options.closeFileTab(d.filePath) } },
      { label: '关闭其他', icon: CloseIcon, disabled: otherTabs.length === 0, onClick: () => { options.closeFileTabs(otherTabs) } },
      { label: '关闭右侧标签页', icon: CloseIcon, disabled: rightSideTabs.length === 0, onClick: () => { options.closeFileTabs(rightSideTabs) } },
      { label: '关闭已保存', icon: CheckIcon, disabled: savedTabs.length === 0, onClick: () => { options.closeFileTabs(savedTabs) } },
      { label: '全部关闭', icon: CloseIcon, disabled: options.openFileTabs.value.length === 0, onClick: () => { options.closeFileTabs([...options.openFileTabs.value]) } },
    ]
    options.showTabContextMenu(event, items, { filePath })
  }

  const openActionsMenu = (event: MouseEvent, hideLocalFolderActions: boolean) => {
    const items: MenuItem<TreeRow>[] = [
      { label: '新建文件', icon: AddIcon, onClick: () => options.createFile() },
      { label: '下载应用', icon: FileZipIcon, disabled: !options.hasCanvasFiles.value || !options.isUsingTempWorkspace.value, onClick: () => { options.downloadAppAsZip() } },
      { label: '保存应用', icon: BoxIcon, disabled: !options.hasCanvasFiles.value || !options.isUsingTempWorkspace.value, onClick: () => options.openSaveAppModal() },
      { label: '在终端打开', icon: TerminalIcon, disabled: !options.hasCanvasFiles.value, onClick: () => { options.openCanvasInTerminal() } },
      { type: 'divider' },
      { label: '重置', icon: RefreshIcon, onClick: () => options.clearCanvas() },
    ]
    if (!hideLocalFolderActions) {
      items.splice(4, 0,
        { label: '打开本地文件夹', icon: FolderIcon, onClick: () => { options.openCanvasInLocalFolder() } },
        { label: '选择本地文件夹', icon: FolderIcon, onClick: () => { options.chooseLocalWorkspaceFolder() } },
        {
          label: options.isUsingTempWorkspace.value ? '切换为当前智能体的工作路径' : '切回临时工作区',
          icon: RefreshIcon,
          disabled: options.isUsingTempWorkspace.value && !options.currentChatAgentWorkspaceDir.value,
          onClick: () => options.toggleCanvasWorkspaceRoot()
        },
        { label: '同步本地文件夹', icon: RefreshIcon, onClick: () => { options.syncLocalFolderToCanvas() } },
      )
    }
    options.showContextMenu(event, items)
  }

  return { openTreeRowMenu, openTreeBlankMenu, openTabContextMenu, openActionsMenu }
}
