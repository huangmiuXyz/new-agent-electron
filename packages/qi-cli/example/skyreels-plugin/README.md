# SkyReels V4 视频插件

该插件用于在 Agent-Qi 中接入 SkyReels V4 视频生成能力。

## 启用后会增加什么

- 一个自动写入设置的 `SkyReels` 提供商
- 一个默认视频模型：`skyreels-v4-video`
- 视频生成面板中的动态参数表单

## 支持的能力

- 文生视频
- 图生视频
- 全能参考

插件通过“生成方式”字段切换不同能力，底部表单项会随之变化。

## 默认配置

- 默认接口地址：`https://api-gateway.skyreels.ai`
- 提供商名称：`SkyReels`
- 默认生成方式：`text2video`
- 默认宽高比：`16:9`
- 默认音效开关：`false`
- 默认生成模式：`std`
- 默认提示词优化：`true`

## 参数说明

通用参数：

- 生成方式
- 生成音效
- 生成模式

文生视频：

- 视频宽高比

图生视频：

- 首帧图片 URL

全能参考：

- 视频宽高比
- 提示词优化
- 图片引用
- 视频引用

## 使用前准备

- SkyReels 账号
- 可用的 API Key
- 可被 SkyReels 服务端访问的公网素材地址

注意：

- `first_frame_image` 需要填写图片 URL
- `ref_images[].image_urls` 需要填写图片 URL 列表
- `ref_videos[].video_url` 需要填写视频 URL
- 不支持本地文件路径直接传给 SkyReels

## 使用方式

1. 启用插件。
2. 打开模型提供商设置。
3. 编辑自动写入的 `SkyReels` 提供商。
4. 填写 API Key。
5. 在视频生成功能中选择 `SkyReels V4 Video` 模型。
6. 通过“生成方式”切换到文生视频、图生视频或全能参考。

## 适用平台

- 桌面端
- 移动端
