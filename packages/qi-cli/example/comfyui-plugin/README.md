# ComfyUI 工作流出图插件

这个插件为 Agent-Qi 扩展 ComfyUI 工作流图像生成能力，可以把已有的 ComfyUI API 工作流直接接入应用，用统一的图像生成入口完成出图。

## 扩展了什么功能

- 注册 `comfyui` 提供商类型，接入应用的图像生成面板
- 通过 ComfyUI 的 `/prompt` 提交工作流任务
- 通过 `/history/{prompt_id}` 轮询任务执行状态
- 通过 `/view` 获取最终生成图片并回传给应用
- 支持将提示词、随机种子、尺寸、批量数等参数映射到指定节点路径
- 支持用 `Overrides JSON` 覆盖工作流里的固定参数

## 使用方式

1. 启动 ComfyUI，默认地址通常为 `http://127.0.0.1:8000`。
2. 从 ComfyUI 导出 API 格式的工作流 JSON。
3. 在插件配置中填写：
   - `Base URL`
   - `Workflow JSON`
   - 提示词、种子、尺寸、批量等字段的节点路径
4. 在 Agent-Qi 图像生成功能中选择 `ComfyUI` 提供商并开始生成。

## 配置提示

- `Prompt Path` 示例：`6.inputs.text`
- `Overrides JSON` 示例：

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

- 如果使用远程 ComfyUI，需确认服务端允许跨域访问
- 工作流必须是 API 格式 JSON，普通界面导出文件不能直接使用
