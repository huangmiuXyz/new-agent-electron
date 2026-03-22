# ComfyUI 工作流出图插件

这个插件把 ComfyUI 的 API 工作流接入 Agent-Qi，让你可以继续使用自己熟悉的工作流，同时在 Agent-Qi 里完成统一的出图操作。

## 这个插件能做什么

- 连接本地或远程的 ComfyUI 服务
- 直接调用现成的 ComfyUI API 工作流
- 把提示词、种子、尺寸、批量数等参数映射到工作流节点
- 通过 Agent-Qi 的图像入口统一发起和查看出图结果

## 适合谁

- 已经在使用 ComfyUI 工作流的用户
- 想保留自定义节点和工作流能力，同时又希望统一到 Agent-Qi 内操作的人
- 需要把固定工作流包装成更易用出图入口的人

## 使用前需要准备

- 一个可访问的 ComfyUI 服务
- 从 ComfyUI 导出的 API 格式工作流 JSON
- 你要映射的节点路径，例如提示词、种子、宽高等字段位置

## 怎么使用

1. 启动 ComfyUI，准备好可访问的服务地址。
2. 从 ComfyUI 导出 API 格式工作流 JSON。
3. 在插件配置中填写 Base URL、Workflow JSON 和各项节点路径。
4. 在 Agent-Qi 图像生成功能中选择 ComfyUI 提供商并开始生成。

## 配置提示

- `Prompt Path` 示例：`6.inputs.text`
- `Overrides JSON` 可用于覆盖工作流里的固定参数

```json
{
  "3.inputs.cfg": 7,
  "3.inputs.steps": 28
}
```

## 适用平台

- 桌面端
- 移动端

## 注意事项

- 工作流必须是 API 格式 JSON
- 如果使用远程 ComfyUI，需要确认服务端允许访问
