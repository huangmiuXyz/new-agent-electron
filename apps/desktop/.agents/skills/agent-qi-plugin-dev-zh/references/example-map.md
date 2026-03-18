# Example Plugin Map

按需求优先参考最接近的示例。

## 最小与入门

- `packages/qi-cli/example/moonshot-plugin`
  - 最小 provider 注册
  - 适合“我只想接一个兼容 provider 工厂”

- `packages/qi-cli/src/commands/init.ts` 中生成的 hello-world
  - 最小插件骨架
  - 适合“先把插件加载起来再逐步加功能”

## Provider 类

- `packages/qi-cli/example/minimax-plugin`
  - 简单 provider 插件

- `packages/qi-cli/example/modelscope-plugin`
  - 典型 provider + 配置封装

- `packages/qi-cli/example/llama-cpp-plugin`
  - 本地服务型 provider
  - 模型扫描、状态条、表单、加载/停止、持久化
  - 适合复杂本地模型或守护进程型插件

## UI / 设置页较重

- `packages/qi-cli/example/civitai-plugin`
  - `useTable()` + `useModal()` + TSX 组件
  - 适合列表浏览、详情弹窗、激活模型

- `packages/qi-cli/example/vosk-speech-recognition`
  - 下载管理、状态图标、复杂交互
  - 适合模型文件管理、离线能力、下载场景

- `packages/qi-cli/example/codex-proxy-plugin`
  - 大型配置面板、账号管理、状态展示
  - 适合多账号、多状态、多动作的插件

## 自动化 / Hook / 工具

- `packages/qi-cli/example/ollama-starter`
  - `registerHook('ai:before-use', ...)`
  - 适合“真正调用模型前先做启动或检查”

- `packages/qi-cli/example/smart-api-key-filler`
  - `registerBuiltinTool()`
  - 适合工具型、批处理型插件

## 选型建议

- 只要 provider：从 `moonshot-plugin` 或 `minimax-plugin` 开始
- 要本地服务和状态条：从 `llama-cpp-plugin` 开始
- 要表格/模态框/详情面板：从 `civitai-plugin` 开始
- 要下载和模型文件管理：从 `vosk-speech-recognition` 开始
- 要内置工具：从 `smart-api-key-filler` 开始
- 要调用前自动准备环境：从 `ollama-starter` 开始
