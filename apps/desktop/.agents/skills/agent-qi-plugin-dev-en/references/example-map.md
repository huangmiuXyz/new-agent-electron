# Example Plugin Map

Use the nearest example before inventing a structure. Read only the examples that match the task.

## Minimal And Starter

- `packages/qi-cli/example/moonshot-plugin`
  - minimal provider factory registration
  - good for a provider that only needs `registerRegistry()`

- `packages/qi-cli/src/commands/init.ts`
  - generated hello-world skeleton
  - good when the first goal is simply "make a plugin load"

## Text, Image, Video, Speech Providers

- `packages/qi-cli/example/minimax-plugin`
  - simple speech/provider plugin
  - useful for straightforward API-backed providers

- `packages/qi-cli/example/modelscope-plugin`
  - provider plus configuration encapsulation
  - desktop/mobile compatible metadata

- `packages/qi-cli/example/siliconflow-plugin`
  - speech/provider API integration
  - good for API-backed providers with model listing

- `packages/qi-cli/example/ark-plugin`
  - image and video model provider
  - good for providerOptions schemas and non-text generation

- `packages/qi-cli/example/skyreels-plugin`
  - video model provider with reference media options
  - good for text-to-video or image/video-conditioned generation

- `packages/qi-cli/example/comfyui-plugin`
  - image provider driven by a ComfyUI workflow
  - good for workflow JSON and providerOptions-driven calls

## TTS And Speech

- `packages/qi-cli/example/qwen-tts-plugin`
  - TTS provider with `useForm()` configuration
  - good for remote TTS services

- `packages/qi-cli/example/kokoro-plugin`
  - local Python TTS service, desktop-only metadata
  - good for local service launch/config patterns

- `packages/qi-cli/example/macos-tts-plugin`
  - macOS `say` command provider
  - good for platform-specific desktop integrations

- `packages/qi-cli/example/vosk-speech-recognition`
  - speech recognition hooks, model downloads, status icons, richer interaction
  - best for offline model assets and speech lifecycle hooks

## Local Services And Long-Running Runtime

- `packages/qi-cli/example/llama-cpp-plugin`
  - local service provider, model scanning, status badge, forms, load/stop actions, persisted config
  - best fit for complex local-model or daemon-like plugins

- `packages/qi-cli/example/codex-proxy-plugin`
  - large config/state surface, local proxy process, accounts, status display
  - good for multi-account, multi-state, and background service plugins

- `packages/qi-cli/example/agent-qi-openai-server-plugin`
  - `execNodejs()`, local Node.js server, `registerSettings()`
  - best for plugin-bundled backend scripts and plugin settings tabs

## Settings-Heavy And Rich UI

- `packages/qi-cli/example/civitai-plugin`
  - `useTable()` + `useModal()` + TSX components
  - good for browsing, details, activation flows, and interactive settings

- `packages/qi-cli/example/llama-cpp-plugin`
  - TSX settings components, status indicator, model gallery
  - good for complex provider settings

- `packages/qi-cli/example/codex-proxy-plugin`
  - large settings panel and status display
  - good for high-state configuration UI

## Automation, Hooks, And Tools

- `packages/qi-cli/example/ollama-starter`
  - `registerHook('provider:form-fields', ...)`
  - `registerHook('ai:before-use', ...)`
  - best when work must happen right before model usage

- `packages/qi-cli/example/smart-api-key-filler`
  - `registerBuiltinTool()`
  - best for utility or batch-processing plugins

## Selection Guide

- Provider factory only: start from `moonshot-plugin`.
- Simple API provider: start from `minimax-plugin`, `modelscope-plugin`, or `siliconflow-plugin`.
- Image/video provider: start from `ark-plugin`, `skyreels-plugin`, or `comfyui-plugin`.
- Remote TTS: start from `qwen-tts-plugin`.
- Local TTS or platform command: start from `kokoro-plugin` or `macos-tts-plugin`.
- Local service + status badge: start from `llama-cpp-plugin`.
- Plugin-bundled Node server: start from `agent-qi-openai-server-plugin`.
- Table, modal, details, richer UI: start from `civitai-plugin`.
- Downloads or local model files: start from `vosk-speech-recognition`.
- Built-in tool: start from `smart-api-key-filler`.
- Pre-use environment setup: start from `ollama-starter`.
- Multi-account or proxy state: start from `codex-proxy-plugin`.

## Platform Hints

- Desktop-only examples usually use local files, local processes, PTY, desktop dialogs, or bridge servers.
- Desktop/mobile examples avoid local process assumptions and include `platforms: ["desktop", "mobile"]`.
- When copying an example, copy its platform stance only if the new plugin has the same runtime dependencies.
