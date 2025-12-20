#!/bin/bash

# 一键更新所有ai-sdk相关包到最新beta版本
echo "正在更新所有ai-sdk相关包到最新beta版本..."

# 更新主要的ai包
pnpm add ai@beta

# 更新所有@ai-sdk包
pnpm add @ai-sdk/anthropic@beta
pnpm add @ai-sdk/deepseek@beta
pnpm add @ai-sdk/google@beta
pnpm add @ai-sdk/mcp@beta
pnpm add @ai-sdk/openai@beta
pnpm add @ai-sdk/openai-compatible@beta
pnpm add @ai-sdk/vue@beta
pnpm add @ai-sdk/xai@beta

# 更新zhipu-ai-provider
pnpm add zhipu-ai-provider@beta

echo "所有ai-sdk相关包已更新到最新beta版本!"