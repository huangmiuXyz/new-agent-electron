# Kokoro 本地语音合成插件 (kokoro-js)

基于 `kokoro-js` 的本地语音合成插件，无需 Python 环境。

## 架构

- **主进程插件** (`main.js`): 使用 `kokoro-js` + `onnxruntime-node` 加载模型并推理
- **渲染进程插件** (`index.js`): 通过 IPC 调用主进程 TTS 服务

## 使用前准备

- Node.js 环境（已满足）

## 构建

```bash
pnpm build
```

## 启用后会增加什么

- 一个 `Kokoro TTS` 提供商
- 一个默认模型：`Kokoro v1.1 中文`
- 多种本地音色（英文女声/男声、英式女声/男声）

## 适用平台

- 桌面端
