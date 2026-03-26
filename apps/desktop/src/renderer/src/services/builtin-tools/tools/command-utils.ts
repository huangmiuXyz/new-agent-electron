const isWindows = navigator.platform.toLowerCase().includes('win')

type ExecCommandResult = {
  code: number | null
  stdout: string
  stderr: string
  errorMessage?: string
  errorCode?: string
}

export const injectBundledRipgrepPath = (command: string): string => {
  const trimmedStart = command.trimStart()
  if (!/^rg(?:\s|$)/.test(trimmedStart)) {
    return command
  }

  const ripgrepPath = window.api.getBundledRipgrepPath()
  if (!ripgrepPath) {
    return command
  }

  const leadingWhitespace = command.slice(0, command.length - trimmedStart.length)
  const rest = trimmedStart.slice(2)
  const escapedRipgrepPath = ripgrepPath.replaceAll('"', '""')
  const quotedRipgrepPath = isWindows ? `& "${escapedRipgrepPath}"` : `"${ripgrepPath}"`

  return `${leadingWhitespace}${quotedRipgrepPath}${rest}`
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
