# llama-cpp-plugin

Local llama.cpp provider plugin for Agent-Qi.

## Features

- Register `llama-cpp` provider compatible with OpenAI API style (`/v1`).
- Configure `llama-server` executable path.
- Configure model list with per-model:
  - model `.gguf` path
  - optional `mmproj` path
  - `ctx-size`
  - extra startup args
- Optional auto start before chat request.
- Optional GGUF scan from a models folder.

## Quick start

1. Build plugin:

```bash
npm install
npm run build
```

2. Load plugin in Agent-Qi plugin settings.
3. Open Provider settings and choose `llama.cpp Local`.
4. Fill:
   - `llama-server path`
   - one or more model entries (`Model .gguf path`)
   - optional `mmproj path`
   - `ctx-size` (e.g. 4096)
5. Enable `Auto start llama-server`.

## Equivalent startup command examples

```powershell
E:\llama.cpp\build\bin\Release\llama-server.exe \
  --model "E:\llama.cpp\models\Qwen3.5-35B-A3B-GGUF\Qwen3.5-35B-A3B-Q4_K_M.gguf" \
  --mmproj "E:\llama.cpp\models\Qwen3.5-35B-A3B-GGUF\mmproj-Qwen3.5-35B-A3B-BF16.gguf" \
  --ctx-size 4096
```

```bash
/usr/local/bin/llama-server \
  --model "/Users/you/llama.cpp/models/Qwen3.5-35B-A3B-Q4_K_M.gguf" \
  --mmproj "/Users/you/llama.cpp/models/mmproj-Qwen3.5-35B-A3B-BF16.gguf" \
  --ctx-size 4096
```

This plugin generates the same core args from your selected model entry.
