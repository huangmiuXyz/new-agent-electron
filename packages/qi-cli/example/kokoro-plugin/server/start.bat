@echo off
chcp 65001 >nul

:: Kokoro TTS Server 启动脚本 (Windows)

:: 设置环境变量
if not defined KOKORO_MODEL_PATH set "KOKORO_MODEL_PATH=C:\Users\Zhuanz\obj\private\agent-qi\Kokoro-82M-v1___1-zh"
if not defined KOKORO_HOST set "KOKORO_HOST=0.0.0.0"
if not defined KOKORO_PORT set "KOKORO_PORT=8000"
if not defined KOKORO_DEVICE set "KOKORO_DEVICE=cpu"

:: 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未找到 python，请先安装 Python 3.8+
    exit /b 1
)

:: 创建虚拟环境（如果不存在）
set "VENV_DIR=%SCRIPT_DIR%.venv"
if not exist "%VENV_DIR%" (
    echo 创建虚拟环境...
    python -m venv "%VENV_DIR%"
)

:: 激活虚拟环境
call "%VENV_DIR%\Scripts\activate.bat"

:: 升级 pip
echo 升级 pip...
python -m pip install --upgrade pip -q 2>nul

:: 检查并安装依赖（使用虚拟环境的 pip）
echo 检查依赖...
pip install -q -r requirements.txt 2>nul || pip install -r requirements.txt

:: 启动服务
echo 启动 Kokoro TTS 服务...
python main.py %*
