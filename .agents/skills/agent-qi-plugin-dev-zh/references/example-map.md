# Example Plugin Map

先找最接近的示例，不要一上来发明新结构。只读和任务匹配的示例。

## 最小与入门

- `packages/qi-cli/example/moonshot-plugin`
  - 最小 provider factory 注册
  - 适合只需要 `registerRegistry()` 的 provider

- `packages/qi-cli/src/commands/init.ts`
  - 生成 hello-world 骨架
  - 适合第一目标只是“让插件能加载”
  - 通过 `qi code init <name> -t hello-world ... -y` 使用

## 文本、图像、视频、语音 Provider

- `packages/qi-cli/example/minimax-plugin`
  - 简单语音/provider 插件
  - 适合直接接 API 的 provider

- `packages/qi-cli/example/modelscope-plugin`
  - provider 加配置封装
  - 带桌面/移动端兼容元数据

- `packages/qi-cli/example/siliconflow-plugin`
  - 语音/provider API 集成
  - 适合带模型列表的 API provider

- `packages/qi-cli/example/ark-plugin`
  - 图像和视频模型 provider
  - 适合 providerOptions schema 与非文本生成

- `packages/qi-cli/example/skyreels-plugin`
  - 带参考媒体选项的视频模型 provider
  - 适合文生视频或图/视频条件生成

- `packages/qi-cli/example/comfyui-plugin`
  - 由 ComfyUI workflow 驱动的图像 provider
  - 适合 workflow JSON 与 providerOptions 调用

## TTS 与语音

- `packages/qi-cli/example/qwen-tts-plugin`
  - 带 `useForm()` 配置的 TTS provider
  - 适合远程 TTS 服务

- `packages/qi-cli/example/kokoro-plugin`
  - 本地 Python TTS 服务，桌面专属元数据
  - 适合本地服务启动和配置模式

- `packages/qi-cli/example/macos-tts-plugin`
  - macOS `say` 命令 provider
  - 适合平台专属桌面集成

- `packages/qi-cli/example/vosk-speech-recognition`
  - 语音识别 hooks、模型下载、状态图标、复杂交互
  - 最适合离线模型资产和语音生命周期 hooks

## 本地服务与长期运行态

- `packages/qi-cli/example/llama-cpp-plugin`
  - 本地服务 provider、模型扫描、状态条、表单、加载/停止、持久化配置
  - 最适合复杂本地模型或守护进程类插件

- `packages/qi-cli/example/codex-proxy-plugin`
  - 大型配置/状态面、本地代理进程、账号、状态展示
  - 适合多账号、多状态、后台服务插件

- `packages/qi-cli/example/agent-qi-openai-server-plugin`
  - `execNodejs()`、本地 Node.js server、`registerSettings()`
  - 最适合插件自带后端脚本和插件设置标签

## 设置较重与复杂 UI

- `packages/qi-cli/example/civitai-plugin`
  - `useTable()` + `useModal()` + TSX 组件
  - 适合列表浏览、详情弹窗、激活流程和交互式设置

- `packages/qi-cli/example/llama-cpp-plugin`
  - TSX 设置组件、状态指示器、模型 gallery
  - 适合复杂 provider 设置

- `packages/qi-cli/example/codex-proxy-plugin`
  - 大型设置面板和状态展示
  - 适合高状态量配置 UI

## 自动化、Hooks 与工具

- `packages/qi-cli/example/ollama-starter`
  - `registerHook('provider:form-fields', ...)`
  - `registerHook('ai:before-use', ...)`
  - 适合真正调用模型前先准备环境

- `packages/qi-cli/example/smart-api-key-filler`
  - `registerBuiltinTool()`
  - 适合工具型或批处理型插件

## 选型建议

- 只注册 provider factory：从 `moonshot-plugin` 开始。
- 新项目骨架：运行 `qi code init <name> -t <template> -d "<description>" -a "<author>" -v "1.0.0" -y`。
- 简单 API provider：从 `minimax-plugin`、`modelscope-plugin` 或 `siliconflow-plugin` 开始。
- 图像/视频 provider：从 `ark-plugin`、`skyreels-plugin` 或 `comfyui-plugin` 开始。
- 远程 TTS：从 `qwen-tts-plugin` 开始。
- 本地 TTS 或平台命令：从 `kokoro-plugin` 或 `macos-tts-plugin` 开始。
- 本地服务加状态条：从 `llama-cpp-plugin` 开始。
- 插件自带 Node server：从 `agent-qi-openai-server-plugin` 开始。
- 表格、模态框、详情、复杂 UI：从 `civitai-plugin` 开始。
- 下载或本地模型文件：从 `vosk-speech-recognition` 开始。
- 内置工具：从 `smart-api-key-filler` 开始。
- 调用前自动准备环境：从 `ollama-starter` 开始。
- 多账号或代理状态：从 `codex-proxy-plugin` 开始。

## 平台提示

- 桌面专属示例通常使用本地文件、本地进程、PTY、桌面对话框或桥接服务。
- 桌面/移动端兼容示例会避免本地进程假设，并包含 `platforms: ["desktop", "mobile"]`。
- 复制示例时，只有当新插件有相同运行时依赖，才复制它的平台立场。
