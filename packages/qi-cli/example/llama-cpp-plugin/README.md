# llama.cpp 本地模型服务插件

这个插件为 Agent-Qi 扩展本地 llama.cpp Provider，适合把本机的 GGUF 模型直接接入聊天、向量化和 RAG 场景。

## 扩展了什么功能

- 注册 `llama-cpp` 提供商，并兼容 OpenAI 风格 `/v1` 接口
- 支持本地 `text` 和 `embedding` 两类模型
- 支持配置 `llama-server` 可执行文件路径
- 支持为每个模型单独配置 `.gguf`、`mmproj`、`ctx-size`、额外启动参数
- 支持 embedding pooling 模式配置
- 支持在调用前自动启动 `llama-server`
- 支持扫描模型目录，辅助发现本地 GGUF 文件

## 使用方式

1. 构建并加载插件。
2. 在 Agent-Qi 中选择 `llama.cpp 本地模型服务` 提供商。
3. 配置 `llama-server` 路径和一个或多个模型条目。
4. 如需多模态模型，可额外填写 `mmproj` 路径。
5. 如需自动托管服务，开启 `Auto start llama-server`。

## 适合的场景

- 本地聊天模型接入
- 本地 embedding 与知识库向量化
- 不依赖云端 API 的离线推理

## 适用平台

- 桌面端

## 注意事项

- 插件依赖本地文件系统和 `llama-server`，移动端不支持
- embedding 模型会追加 `--embedding --pooling <mode>` 参数启动
