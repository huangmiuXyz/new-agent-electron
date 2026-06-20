---
name: mcp-search
description: 搜索和发现 MCP（Model Context Protocol）相关开源项目、服务器和工具。当用户想查找 MCP 服务、AI 工具集成、或通过 GitHub API 搜索特定技术栈的开源项目时使用。支持通过 curl 调用 GitHub REST API 搜索、筛选和评估开源项目。也适用于任何需要通过 GitHub 搜索 API 查找开源项目的场景。
---

# MCP Search

搜索和发现 MCP（Model Context Protocol）相关开源项目、服务器和工具，通过 GitHub API 使用 curl 进行搜索。

## 何时使用

- 用户想查找某个领域的 MCP 服务或 AI 工具
- 需要了解特定技术生态中的 MCP 项目
- 搜索与某个平台/框架集成的 MCP 服务器
- 评估 MCP 项目的流行度、活跃度和质量
- 对比不同的 MCP 实现方案（如不同语言、不同协议版本）
- 用户提到 "MCP server"、"Model Context Protocol"、"AI 工具集成" 等关键词
- 需要通过 GitHub API 搜索任何类型的开源项目
- 需要从命令行/终端使用 curl 查询 GitHub 仓库信息

## 搜索流程

### 第一步：理解用户需求

先确认用户具体想找什么：
- 搜索什么领域/平台的 MCP 项目？（如 Godot、浏览器、数据库、设计工具...）
- 需要 MCP 服务端（Server）还是客户端（Client）？
- 需要免费开源方案还是可以接受付费商业产品？
- 关注什么编程语言实现（JavaScript / Python / Go / Rust 等）？
- 需要什么功能特性（文件操作、代码生成、数据分析等）？

### 第二步：通过 GitHub API 搜索

使用 `curl.exe`（Windows PowerShell 下需用 `curl.exe` 而非 `curl`，因为 `curl` 是 `Invoke-WebRequest` 的别名）调用 GitHub 搜索 API：

```powershell
# 基础搜索：按 Stars 排序
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+mcp&sort=stars&order=desc&per_page=10"

# 按语言过滤
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+mcp+language:python&sort=stars&order=desc&per_page=10"

# 按话题标签搜索
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=topic:mcp+topic:KEYWORD&sort=stars&order=desc&per_page=10"

# 高 Star 过滤（>100）
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+mcp+stars:>100&sort=stars&order=desc&per_page=10"

# 按最后更新日期筛选
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+mcp+pushed:>2025-01-01&sort=updated&order=desc&per_page=10"
```

> 将所有 `KEYWORD` 替换为用户感兴趣的领域关键词，例如 `godot`、`browser`、`database`、`docker`、`claude`、`openai` 等。

**关键参数说明：**
- `-s`：静默模式，不显示进度条
- `-H "User-Agent: curl"`：GitHub API 要求必须设置 User-Agent
- `sort=stars&order=desc`：按 Star 数降序排列
- `sort=updated&order=desc`：按最近更新时间排列
- `per_page=N`：每页返回结果数（最大 100）
- `q=`：搜索查询，支持 GitHub 搜索语法

### 第三步：解析搜索结果

GitHub API 返回 JSON 格式，关注以下关键字段：

| 字段 | 含义 | 评估要点 |
|------|------|---------|
| `full_name` | 仓库全名（owner/repo） | 识别项目身份 |
| `description` | 项目描述 | 判断功能是否匹配需求 |
| `stargazers_count` | Star 数 | 社区认可度 |
| `forks_count` | Fork 数 | 活跃度指标 |
| `open_issues_count` | 开放 Issue 数 | 维护状况（过高可能有问题） |
| `language` | 主要编程语言 | 技术栈匹配 |
| `pushed_at` | 最后推送时间 | 项目活跃度（越新越好） |
| `created_at` | 创建时间 | 项目成熟度 |
| `topics` | 话题标签 | 功能分类 |
| `license` | 开源协议（`license.key`） | 商业使用限制 |

### 第四步：扩展搜索

根据初步结果，可以进一步深入：

```powershell
# 查看仓库详情
curl.exe -s -H "User-Agent: curl" "https://api.github.com/repos/{owner}/{repo}"

# 查看 README（获取项目介绍）
curl.exe -s -H "User-Agent: curl" "https://api.github.com/repos/{owner}/{repo}/readme"

# 查看最近发布的版本
curl.exe -s -H "User-Agent: curl" "https://api.github.com/repos/{owner}/{repo}/releases?per_page=5"

# 搜索其他相关关键词组合
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+mcp+server&sort=stars&order=desc&per_page=10"
curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+ai+plugin&sort=stars&order=desc&per_page=10"
```

### 第五步：结果整理与推荐

向用户呈现结果时，使用清晰易读的表格格式：

```
| # | 项目 | ⭐ Stars | 描述 | 语言 | 活跃度 |
|---|------|---------|------|------|--------|
| 1 | [owner/repo](https://github.com/owner/repo) | ⭐ N | 描述文本 | 语言 | 最后推送日期 |
```

评估推荐优先级：
1. **Star 数高 + 近期活跃** → 优先推荐
2. **Star 数高但长期未更新** → 功能稳定但注意兼容性
3. **Star 数低但近期活跃** → 潜力项目，值得关注
4. **付费产品** → 明确标注费用和许可

如果用户需要，可以进一步查看项目 README 获取详细功能说明。

## Windows curl 注意事项

Windows 系统下 `curl` 命令的使用要点：

1. **使用 `curl.exe` 而非 `curl`** — PowerShell 中 `curl` 是 `Invoke-WebRequest` 的别名
2. **URL 包含 `&` 时用引号包裹** — PowerShell 会解释 `&` 为调用操作符
3. **推荐写法**：
   ```powershell
   curl.exe -s -H "User-Agent: curl" "https://api.github.com/search/repositories?q=KEYWORD+mcp&sort=stars&order=desc"
   ```
4. **GitHub API 速率限制**：未认证时每小时 60 次请求，加 `-H "Authorization: Bearer YOUR_TOKEN"` 可提高到 5000 次/小时

## GitHub 搜索语法参考

### 常用搜索限定符

| 限定符 | 示例 | 说明 |
|--------|------|------|
| `language:` | `language:javascript` | 按编程语言筛选 |
| `topic:` | `topic:mcp` | 按话题标签筛选 |
| `stars:` | `stars:>100` 或 `stars:500..1000` | 按 Star 数范围筛选 |
| `pushed:` | `pushed:>2025-01-01` | 按最后推送日期筛选 |
| `created:` | `created:>2025-01-01` | 按创建日期筛选 |
| `license:` | `license:mit` | 按开源协议筛选 |
| `fork:` | `fork:true` | 是否包含 Fork（默认排除） |
| `repo:` | `repo:owner/name` | 限定特定仓库 |
| `user:` | `user:owner` | 限定特定用户/组织 |
| `org:` | `org:github` | 限定特定组织 |

### 排序选项

- `sort=stars` — 按 Star 数（默认）
- `sort=forks` — 按 Fork 数
- `sort=updated` — 按更新时间
- 省略则按最佳匹配排序

### 分页

- `per_page=N` — 每页结果数（最大 100，默认 30）
- `page=N` — 页码（默认 1）

### API 响应结构

```json
{
  "total_count": 319,
  "incomplete_results": false,
  "items": [
    {
      "full_name": "owner/repo",
      "description": "...",
      "stargazers_count": 4286,
      "forks_count": 403,
      "open_issues_count": 56,
      "language": "JavaScript",
      "pushed_at": "2026-04-16T23:37:00Z",
      "created_at": "2025-02-26T21:58:45Z",
      "topics": ["ai", "godot", "mcp"],
      "license": { "key": "mit", "name": "MIT License" },
      "html_url": "https://github.com/owner/repo"
    }
  ]
}
```

### 常见 HTTP 错误

| 状态码 | 含义 | 处理方式 |
|--------|------|---------|
| 200 | 成功 | 正常解析 JSON |
| 403 | 速率限制 | 等待或添加认证 Token |
| 422 | 查询语法错误 | 检查查询字符串 |
| 429 | 请求过于频繁 | 降低频率 |

### 认证（提高速率限制）

```powershell
curl.exe -s -H "User-Agent: curl" -H "Authorization: Bearer ghp_你的Token" "https://api.github.com/search/repositories?q=mcp+server&sort=stars&order=desc"
```

Token 获取：GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens

## 参考链接

- [GitHub REST API 文档](https://docs.github.com/en/rest/search/search#search-repositories)
- [Model Context Protocol 官方文档](https://modelcontextprotocol.io)
