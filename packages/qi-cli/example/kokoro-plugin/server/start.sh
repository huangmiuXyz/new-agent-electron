#!/bin/bash

# Kokoro TTS Server 启动脚本

# 设置环境变量
export KOKORO_MODEL_PATH="${KOKORO_MODEL_PATH:-/Users/Zhuanz/obj/private/agent-qi/Kokoro-82M-v1___1-zh}"
export KOKORO_HOST="${KOKORO_HOST:-0.0.0.0}"
export KOKORO_PORT="${KOKORO_PORT:-18889}"
export KOKORO_DEVICE="${KOKORO_DEVICE:-cpu}"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Python 版本 (需要 3.10-3.12，3.13 不支持)
PYTHON_CMD=""
for cmd in python3.12 python3.11 python3.10; do
    if command -v $cmd &> /dev/null; then
        version=$($cmd --version 2>&1 | awk '{print $2}')
        major=$(echo $version | cut -d. -f1)
        minor=$(echo $version | cut -d. -f2)
        if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ] && [ "$minor" -le 12 ]; then
            PYTHON_CMD=$cmd
            echo "找到 Python $version"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "错误: 需要 Python 3.10-3.12，请先安装"
    echo "当前 Python 版本:"
    python3 --version 2>/dev/null || python --version 2>/dev/null || echo "未找到"
    echo ""
    echo "建议安装 Python 3.11:"
    echo "  brew install python@3.11"
    exit 1
fi

# 检查 pip
if command -v pip3 &> /dev/null; then
    PIP_CMD="pip3"
elif command -v pip &> /dev/null; then
    PIP_CMD="pip"
else
    echo "错误: 未找到 pip"
    exit 1
fi

# 创建虚拟环境（如果不存在）
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "创建虚拟环境..."
    $PYTHON_CMD -m venv "$VENV_DIR"
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"

# 升级 pip
echo "升级 pip..."
python -m pip install --upgrade pip

# 检查并安装依赖（使用虚拟环境的 pip）
echo "检查依赖..."
pip install -r requirements.txt

# 启动服务
echo "启动 Kokoro TTS 服务..."
python main.py "$@"
