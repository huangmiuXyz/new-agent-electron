# ModelScope 图像生成插件

该插件用于在 Agent-Qi 中接入魔搭 ModelScope 图像生成服务。

## 启用后会增加什么

- 一个可手动添加的 ModelScope 图像提供商
- 支持通过异步任务方式生成图片
- 支持在图片生成时附加额外参数

## 默认配置

- 默认模型：`Tongyi-MAI/Z-Image-Turbo`
- 默认负向提示词：`low quality, bad quality, blurry, distorted`
- 默认尺寸：`1024x1024`
- 默认接口地址：`https://api-inference.modelscope.cn/`

## 使用前准备

- ModelScope 账号
- 可用的访问凭证

## 使用方式

1. 启用插件。
2. 在模型提供商设置中手动新增 ModelScope 提供商。
3. 填写访问凭证并保存配置。
4. 刷新模型。
5. 在图像生成功能中选择 ModelScope 模型。

## 适用平台

- 桌面端
- 移动端
