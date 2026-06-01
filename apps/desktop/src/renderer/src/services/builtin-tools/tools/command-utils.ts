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
