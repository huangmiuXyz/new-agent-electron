# ModelScope 图像生成插件

该插件用于将魔搭 ModelScope 的图像生成能力接入 Agent-Qi。

## 主要功能

- 注册 `modelscope` 类型的图像提供商能力
- 接入 ModelScope 图像生成接口
- 统一纳入 Agent-Qi 的图像模型配置与调用流程

## 使用前准备

- ModelScope 账号
- 可用的访问凭证

## 使用方式

1. 启用插件。
2. 在 Agent-Qi 的模型提供商设置中手动新增 `modelscope` 类型提供商。
3. 填写访问凭证并保存配置。
4. 刷新模型后，在图像生成功能中选择相应模型。

## 适用平台

- 桌面端
- 移动端
