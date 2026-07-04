import { h, VNode } from 'vue'
// material-icon-theme 提供完整的 VS Code 文件图标集（1250 个 SVG + 扩展名/文件名映射）
// 详见: https://github.com/material-extensions/vscode-material-icon-theme
import manifest from 'material-icon-theme/dist/material-icons.json'

// 用 import.meta.glob 在构建期收集所有 SVG，得到 图标名 → URL 的映射
// 相对路径从当前文件 src/renderer/src/utils/ 出发，回退 4 层到 apps/desktop/
const svgModules = import.meta.glob(
  '../../../../node_modules/material-icon-theme/icons/*.svg',
  {
    query: '?url',
    import: 'default',
    eager: true
  }
) as Record<string, string>

// 图标名 → URL
const iconUrlCache = new Map<string, string>()
for (const [path, url] of Object.entries(svgModules)) {
  const match = path.match(/\/icons\/(.+)\.svg$/)
  if (match) iconUrlCache.set(match[1], url)
}

if (import.meta.env.DEV && iconUrlCache.size === 0) {
  console.warn(
    '[fileIcons] import.meta.glob 未匹配到 SVG，glob keys:',
    Object.keys(svgModules).length
  )
}

// manifest 的字段结构
interface MaterialIconsManifest {
  iconDefinitions: Record<string, { iconPath: string }>
  fileExtensions: Record<string, string>
  fileNames: Record<string, string>
  file: string
  folder: string
  folderExpanded: string
}

const typedManifest = manifest as unknown as MaterialIconsManifest

export interface FileIconResult {
  /** Vue VNode，可直接作为组件渲染 */
  vnode: VNode
  /** 图标名（material-icon-theme 中的命名，如 "typescript"、"vue"） */
  iconName: string
}

/** 根据图标名查 URL，未命中则用默认 file 图标 */
const resolveUrl = (iconName: string): string => {
  const url = iconUrlCache.get(iconName)
  if (url) return url
  return iconUrlCache.get(typedManifest.file) ?? ''
}

/** 把 URL 包装为可渲染的 <img> VNode */
const urlToVNode = (url: string): VNode => {
  return h('img', {
    src: url,
    class: 'material-file-icon',
    alt: '',
    draggable: false,
    style: 'display:block;width:16px;height:16px;object-fit:contain;pointer-events:none'
  })
}

/** 提取文件名（去掉路径） */
const getFilename = (path: string): string => {
  const normalized = path.replaceAll('\\', '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || ''
}

/** 提取小写扩展名（不带点） */
const getExtension = (filename: string): string => {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return ''
  return filename.slice(dotIndex + 1).toLowerCase()
}

/**
 * 根据文件名/路径返回对应的 Material Icon Theme 图标
 * 查找规则（与 VS Code 一致）：
 *   1. 完整文件名匹配（不区分大小写）→ fileNames
 *   2. 扩展名匹配（不区分大小写）→ fileExtensions
 *   3. 兜底默认 file 图标
 */
export const getFileIcon = (filenameOrPath: string): FileIconResult => {
  const filename = getFilename(filenameOrPath)

  let iconName = ''
  if (filename) {
    const lowerFilename = filename.toLowerCase()
    iconName = typedManifest.fileNames[lowerFilename] || ''
    if (!iconName) {
      const ext = getExtension(filename)
      if (ext) iconName = typedManifest.fileExtensions[ext] || ''
    }
  }
  if (!iconName) iconName = typedManifest.file

  return {
    vnode: urlToVNode(resolveUrl(iconName)),
    iconName
  }
}

/**
 * 根据图标名直接返回图标（用于已知图标名的场景，如文件夹）
 * @param iconName material-icon-theme 中的图标名，如 "folder"、"folder-open"
 */
export const getFileIconByName = (iconName: string): FileIconResult => {
  return {
    vnode: urlToVNode(resolveUrl(iconName)),
    iconName
  }
}
