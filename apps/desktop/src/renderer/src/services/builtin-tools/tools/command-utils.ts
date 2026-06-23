const isWindows = navigator.platform.toLowerCase().includes('win')

type ExecCommandResult = {
  code: number | null
  stdout: string
  stderr: string
  errorMessage?: string
  errorCode?: string
}

const splitShellPipeline = (command: string): string[] => {
  const segments: string[] = []
  let start = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (quote === "'") {
      if (char === "'") {
        quote = null
      }
      continue
    }

    if (quote === '"') {
      if ((!isWindows && char === '\\') || (isWindows && char === '`')) {
        escaped = true
        continue
      }
      if (char === '"') {
        quote = null
      }
      continue
    }

    if ((!isWindows && char === '\\') || (isWindows && char === '`')) {
      escaped = true
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === '|') {
      segments.push(command.slice(start, i))
      start = i + 1
    }
  }

  segments.push(command.slice(start))
  return segments
}

export const injectBundledRipgrepPath = (command: string): string => {
  const ripgrepPath = window.api.getBundledRipgrepPath()
  if (!ripgrepPath) {
    return command
  }

  const escapedRipgrepPath = ripgrepPath.replaceAll('"', '""')
  const quotedRipgrepPath = isWindows ? `& "${escapedRipgrepPath}"` : `"${ripgrepPath}"`

  const replaceRg = (cmd: string): string => {
    const trimmedStart = cmd.trimStart()
    if (!/^rg(?:\s|$)/.test(trimmedStart)) {
      return cmd
    }
    const leadingWhitespace = cmd.slice(0, cmd.length - trimmedStart.length)
    const rest = trimmedStart.slice(2)
    return `${leadingWhitespace}${quotedRipgrepPath}${rest}`
  }

  const segments = splitShellPipeline(command)
  if (segments.length === 1) {
    return replaceRg(command)
  }

  const replaced = segments.map((segment) => replaceRg(segment.trimStart()))
  const leadingWhitespace = command.slice(0, command.length - command.trimStart().length)

  if (isWindows) {
    const piped = replaced.map((segment, index) => {
      if (index < replaced.length - 1) {
        return `(${segment.trimStart()}) -join [char]10`
      }
      return segment.trimStart()
    })
    return `${leadingWhitespace}${piped.join(' | ')}`
  }

  return `${leadingWhitespace}${replaced.join(' | ')}`
}

type DedicatedFileToolNames = {
  searchTool?: string
  readTool?: string
  listTool?: string
  editTool?: string
}

const SEARCH_COMMANDS = new Set(['ag', 'ack', 'awk', 'grep', 'rg', 'ripgrep'])
const READ_COMMANDS = new Set(['cat', 'head', 'less', 'more', 'nl', 'sed', 'tail'])
const LIST_COMMANDS = new Set(['fd', 'find', 'ls', 'tree'])

const WRITE_COMMANDS = new Set([
  'rm', 'cp', 'mv', 'mkdir', 'touch', 'chmod', 'chown',
  'ln', 'mkfifo', 'mknod', 'dd', 'truncate', 'install',
  'tee',
])

const WRITE_COMMAND_PATTERNS: RegExp[] = [
  /sed\s+-(?:i|in-place)\b/,
  /\b(?:npm|bun|pnpm|yarn)\s+(?:install|add|remove|uninstall|update|publish|link|unlink|init|run\s+(?:build|dev|start|test)|exec\s+\S+\s+(?:install|add))/,
  /\bpip(?:3)?\s+(?:install|uninstall|download)\b/,
  /\bgit\s+(?:add|commit|push|pull|merge|rebase|reset|checkout|restore\s+-[sS]|branch\s+-[dDmM]|tag\s+-[adf]|stash\s+(?:drop|pop|push|apply)|rm|mv|update-index|submodule\s+update|worktree\s+(?:add|prune|remove|lock|unlock)|clean|cherry-pick|revert)\b/,
  /\b(?:apt|apt-get|aptitude|dpkg|brew|yum|dnf|rpm|pacman|zypper|snap|port)\s+(?:install|remove|update|upgrade|purge|autoremove|clean)\b/,
  /\b(?:docker|podman)\s+(?:build|commit|push|pull|tag|rmi|rm|network\s+create|volume\s+create|save|load|import|export|login|logout)\b/,
  /\b(?:cargo|go|rustup)\s+(?:install|uninstall|publish|build|run|test|update|add|remove)\b/,
  /\b(?:make|cmake\s+--build|ninja)\s+(?:install|uninstall)?/,
  /\b(?:terraform|pulumi|sst|cdk)\s+(?:apply|destroy|import)\b/,
  /\bkubectl\s+(?:apply|delete|create|edit|patch|replace|rollout|scale|autoscale|label|annotate|taint|cordon|uncordon|drain)\b/,
]

const splitShellCommandSegments = (command: string): string[] => {
  const segments: string[] = []
  let start = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]
    const next = command[i + 1]

    if (escaped) {
      escaped = false
      continue
    }

    if (quote === "'") {
      if (char === "'") quote = null
      continue
    }

    if (quote === '"') {
      if ((!isWindows && char === '\\') || (isWindows && char === '`')) {
        escaped = true
        continue
      }
      if (char === '"') quote = null
      continue
    }

    if ((!isWindows && char === '\\') || (isWindows && char === '`')) {
      escaped = true
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === ';' || char === '|' || char === '&') {
      if ((char === '|' && next === '|') || (char === '&' && next === '&')) {
        segments.push(command.slice(start, i))
        i += 1
        start = i + 1
        continue
      }
      if (char === '|' || char === ';') {
        segments.push(command.slice(start, i))
        start = i + 1
      }
    }
  }

  segments.push(command.slice(start))
  return segments.map((segment) => segment.trim()).filter(Boolean)
}

export const getDedicatedFileToolHint = (
  command: string,
  tools: DedicatedFileToolNames
): string | null => {
  const relatedToolHint = [
    tools.readTool ? `${tools.readTool} 用于读取定位后的文件` : '',
    tools.listTool ? `${tools.listTool} 用于列目录` : ''
  ]
    .filter(Boolean)
    .join('，')

  for (const segment of splitShellCommandSegments(command)) {
    const cleaned = segment.replace(/^!+/, '').replace(/^\(+/, '').trim()
    const baseCommand = cleaned.match(/^([A-Za-z0-9._-]+)/)?.[1]
    if (!baseCommand) continue

    if (
      tools.searchTool &&
      (SEARCH_COMMANDS.has(baseCommand) || /^git\s+grep(?:\s|$)/.test(cleaned))
    ) {
      const lines = [
        `检测到 shell 文件搜索命令: ${baseCommand === 'git' ? 'git grep' : baseCommand}`,
        `请改用 ${tools.searchTool}。搜索工具内部会使用 bundled ripgrep，不依赖 shell PATH 中是否存在 rg。`,
        relatedToolHint
          ? `${relatedToolHint}；exec_command 仅用于测试、构建、包管理、git 等真正需要终端的命令。`
          : 'exec_command 仅用于测试、构建、包管理、git 等真正需要终端的命令。'
      ]
      return lines.join('\n')
    }

    if (tools.readTool && READ_COMMANDS.has(baseCommand)) {
      return [
        `检测到 shell 文件读取命令: ${baseCommand}`,
        `请改用 ${tools.readTool} 读取文件和行号范围。`,
        [
          tools.searchTool ? `需要先搜索内容或文件名时，请使用 ${tools.searchTool}` : '',
          tools.listTool ? `需要列目录时，请使用 ${tools.listTool}` : ''
        ]
          .filter(Boolean)
          .join('；') || 'exec_command 仅用于真正需要终端的命令。'
      ].join('\n')
    }

    if (tools.listTool && LIST_COMMANDS.has(baseCommand)) {
      return [
        `检测到 shell 文件列表命令: ${baseCommand}`,
        `请改用 ${tools.listTool} 列目录${tools.searchTool ? `；需要搜索内容或文件名时，请使用 ${tools.searchTool}` : ''}。`,
        'exec_command 仅用于测试、构建、包管理、git 等真正需要终端的命令。'
      ].join('\n')
    }
  }

  if (WRITE_COMMAND_PATTERNS.some((p) => p.test(command))) {
    return [
      'exec_command 是只读 shell，禁止执行写操作。',
      '如果想创建或修改文件，应该使用 edit_file 工具而不是 exec_command。',
      '如果想搜索文件内容，应该使用 search_project 工具而不是 exec_command。',
      '',
      '注意：不允许通过 exec_command 间接执行写操作（如 sed -i、重定向、git commit、npm install 等）。'
    ].join('\n')
  }

  if (/(?:^|[^a-zA-Z0-9_])>(>?)(?!\s*[|&(])/.test(command)) {
    return [
      'exec_command 是只读 shell，禁止通过重定向写入文件。',
      '请改用 edit_file 工具创建或编辑文件。'
    ].join('\n')
  }

  for (const segment of splitShellCommandSegments(command)) {
    const cleaned = segment.replace(/^!+/, '').replace(/^\(+/, '').trim()
    const baseCommand = cleaned.match(/^([A-Za-z0-9._-]+)/)?.[1]
    if (!baseCommand) continue
    if (WRITE_COMMANDS.has(baseCommand)) {
      return [
        `exec_command 是只读 shell，不支持 \`${baseCommand}\` 命令。`,
        '文件操作应使用 edit_file 工具完成。',
        'exec_command 仅用于查看状态、运行测试、启动开发服务器等只读命令。'
      ].join('\n')
    }
  }

  return null
}

export const execRipgrepSearch = async (
  query: string,
  options: {
    cwd?: string
    caseSensitive?: boolean
    maxBuffer?: number
  } = {}
): Promise<{ result: ExecCommandResult; resolvedCmd: string }> => {
  const ripgrepPath = window.api.getBundledRipgrepPath() || 'rg'
  const args = [
    '--no-heading',
    '--line-number',
    '--color',
    'never',
    '--fixed-strings',
    options.caseSensitive ? '--case-sensitive' : '--ignore-case',
    query,
    '.'
  ]

  const resolvedCmd = [ripgrepPath, ...args]
    .map((part) => (/\s/.test(part) ? `"${part.replaceAll('"', '""')}"` : part))
    .join(' ')

  const result = await window.api.execFileCommand(ripgrepPath, args, {
    cwd: options.cwd,
    maxBuffer: options.maxBuffer
  })

  return { result, resolvedCmd }
}
