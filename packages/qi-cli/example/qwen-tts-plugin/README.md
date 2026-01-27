# Qwen TTS 创空间适配插件

通过 Gradio 客户端接入 ModelScope (魔搭) 创空间上的 Qwen TTS 模型。

## 主要功能

- **创空间接入**：利用 `@gradio/client` 直接连接 ModelScope 创空间托管的 Qwen TTS 实例。
- **自定义语音生成**：支持通过 `generate_custom_voice` 接口进行精细化的语音合成。
- **Studio Token 鉴权**：支持使用 ModelScope Studio Token 进行身份验证。
- **灵活配置**：支持自定义 Base URL 以连接不同的创空间实例。

## 配置项

- **Base URL**：ModelScope 创空间的 Gradio 地址（例如：`https://xxx.modelscope.cn`）。
- **API Key**：您的 ModelScope Studio Token（通过 `x-studio-token` 请求头传递）。

## 使用说明

1. 启用插件。
2. 在“提供商设置”中配置 Qwen TTS 创空间的访问地址和您的 Studio Token。
3. 插件会自动注册 `qwen` 语音合成提供商。
4. 在应用的语音设置中选择该提供商即可开始使用。
