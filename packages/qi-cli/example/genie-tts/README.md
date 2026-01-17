# ollama-starter

ollama-starter 插件

## 安装

将 .qi 文件拖拽到 Qi 应用的插件管理界面进行安装。

## 开发

```bash
# 构建
qi code build

# 测试
# 将构建后的 .qi 文件安装到 Qi 应用进行测试
```

## 插件 API

### PluginContext

插件通过 `install` 函数接收 `PluginContext` 对象，包含以下属性：

- `app`: 应用实例
- `pinia`: Pinia 实例
- `registerCommand(name, handler)`: 注册命令
- `registerHook(name, handler)`: 注册钩子
- `getStore(storeName)`: 获取 store
- `registerBuiltinTool(name, tool)`: 注册内置工具
- `unregisterBuiltinTool(name)`: 注销内置工具（返回是否成功）

### 可用的 Store

- `notes`: 笔记 store
- `chats`: 聊天 store
- `settings`: 设置 store
- `knowledge`: 知识库 store
- `agent`: Agent store

### 可用的钩子

- `before.chat`: 聊天前触发
- `after.chat`: 聊天后触发
- `before.message`: 消息前触发
- `after.message`: 消息后触发

### 语音识别钩子 (可选)

如果你的插件实现了语音识别功能，可以使用以下钩子：

- `speech.stream.start`: 语音识别开始
- `speech.stream.data`: 音频数据流 (Float32Array)
- `speech.stream.stop`: 语音识别停止
- `speech.recognize`: 单次语音识别
