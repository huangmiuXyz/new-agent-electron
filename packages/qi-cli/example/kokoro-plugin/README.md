# Kokoro 语音合成插件

集成 [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) 开源 TTS 模型，支持中英文语音合成，提供 100+ 种本地音色。

## 主要功能

- **本地语音合成**：基于 Kokoro v1.1 中文模型，完全本地运行，无需联网
- **多语言支持**：支持中文和英文语音合成
- **丰富音色**：提供 100+ 种中文和英文音色
- **语速调节**：支持 0.5-2.0 倍语速调节
- **高品质音频**：输出 24kHz 采样率 WAV 音频

## 系统要求

- Python 3.8+
- 4GB+ 内存
- (可选) NVIDIA GPU 支持 CUDA 加速

## 安装步骤

### 1. 安装插件

在 Agent-Qi 应用中安装此插件。

### 2. 确保 Python 已安装

确保系统已安装 Python 3.8+：
```bash
python3 --version  # macOS/Linux
python --version   # Windows
```

如果没有安装，请从 [python.org](https://python.org) 下载安装。

### 3. 配置插件

在 Agent-Qi 应用中添加 `kokoro` 类型的提供商：

1. 进入设置 → 语音提供商
2. 点击"添加提供商"
3. 选择类型为 `kokoro`
4. 配置基础 URL（默认 `http://localhost:8000`）
5. 开启"自动启动后端服务"选项（推荐）
6. 保存并测试

### 自动启动功能

插件支持在调用 TTS (doGenerate) 时自动启动后端服务：

- 在提供商设置中开启"自动启动后端服务"开关
- 每次调用 TTS 时，插件会自动检测服务状态
- 如果服务未运行，插件会自动启动 Python 服务
- 支持并发控制，多个请求同时触发只会启动一次服务
- 支持 macOS、Linux 和 Windows 平台

如需手动启动服务：

```bash
cd server
./start.sh          # macOS/Linux (自动创建虚拟环境并安装依赖)
# 或
start.bat           # Windows (自动创建虚拟环境并安装依赖)
```

首次启动会自动创建虚拟环境并安装依赖，无需手动操作。

### 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `KOKORO_MODEL_PATH` | `/Users/Zhuanz/obj/private/agent-qi/Kokoro-82M-v1___1-zh` | 模型文件路径 |
| `KOKORO_HOST` | `0.0.0.0` | 服务监听地址 |
| `KOKORO_PORT` | `8000` | 服务端口 |
| `KOKORO_DEVICE` | `cpu` | 运行设备 (`cpu` 或 `cuda`) |

## 可用音色

### 中文女声 (zf_xxx)
- `zf_001` - 标准中文女声
- `zf_002` - 温柔中文女声
- `zf_003` - 活泼中文女声
- ... (共 90+ 种)

### 中文男声 (zm_xxx)
- `zm_009` - 标准中文男声
- `zm_010` - 磁性中文男声
- `zm_011` - 成熟中文男声
- ... (共 50+ 种)

### 英文女声
- `af_maple` - American female
- `af_sol` - American female
- `bf_vale` - British female

## API 接口

### POST /tts
文本转语音

```json
{
  "text": "你好，这是测试文本",
  "voice": "zf_001",
  "speed": 1.0,
  "format": "wav",
  "lang": "auto"
}
```

### GET /voices
列出可用音色

### GET /health
健康检查

## 开发构建

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 项目结构

```
kokoro-plugin/
├── src/
│   ├── index.ts              # 插件入口
│   ├── types.ts              # 类型定义
│   └── kokoro/
│       ├── index.ts
│       ├── kokoro-provider.ts    # Provider 实现
│       ├── kokoro-speech-model.ts # Speech Model 实现
│       ├── kokoro-config.ts       # 配置
│       └── kokoro-api-types.ts    # API 类型
├── server/
│   ├── main.py               # Python 后端服务
│   ├── requirements.txt      # Python 依赖
│   ├── start.sh             # macOS/Linux 启动脚本
│   └── start.bat            # Windows 启动脚本
├── info.json                # 插件信息
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 模型信息

- **模型**: hexgrad/Kokoro-82M-v1.1-zh
- **参数量**: 8200万
- **采样率**: 24kHz
- **架构**: StyleTTS 2 + ISTFTNet
- **许可证**: Apache-2.0

## 鸣谢

- 模型训练: [@rzvzn](https://github.com/rzvzn)
- 中文数据: [龙猫数据](https://www.longmaosoft.com/)
- 开源项目: [Kokoro](https://github.com/hexgrad/kokoro)
