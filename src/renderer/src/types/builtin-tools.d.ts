declare global {
  // 内置工具参数接口
  interface BuiltinToolParameter {
    name: string
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    description: string
    required: boolean
    default?: any
  }

  // 内置工具定义接口
  interface BuiltinTool {
    name: string
    description: string
    parameters: BuiltinToolParameter[]
    execute: (args: Record<string, any>) => Promise<any>
  }

  // 内置工具类别
  interface BuiltinToolCategory {
    name: string
    description: string
    tools: BuiltinTool[]
  }

  // 内置工具注册表
  interface BuiltinToolsRegistry {
    [categoryName: string]: BuiltinToolCategory
  }

  interface Suggestion {
    id: string
    text: string
    action?: string
  }

  interface SuggestionsData {
    title: string
    suggestions: Suggestion[]
  }
}

export {}
