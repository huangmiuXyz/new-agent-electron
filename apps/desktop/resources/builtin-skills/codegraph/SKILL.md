---
name: codegraph
description: 使用 CodeGraph CLI 进行代码知识图谱查询——符号搜索、调用链追踪、影响分析、代码结构探索。
---

# CodeGraph

## 安装（仅报错时）

| 错误 | 解决 |
|------|------|
| `command not found` | `curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh \| sh` |
| `not initialized` / 无 `.codegraph/` | `codegraph init` |
| 索引过时 | `codegraph sync` |

## CLI 命令

| 命令 | 用途 | 示例 |
|------|------|------|
| `explore <query>` | 主要查询：源码+调用路径 | `codegraph explore "登录流程"` |
| `search <query>` | 按名称搜符号 | `codegraph search UserService` |
| `node <symbol|file>` | 获取符号源码/读文件 | `codegraph node src/user.ts` |
| `callers <symbol>` | 查找调用者 | `codegraph callers getUsers` |
| `callees <symbol>` | 查找被调用者 | `codegraph callees handleRequest` |
| `impact <symbol>` | 修改影响分析 | `codegraph impact UserService --depth 3` |
| `affected <files>` | 受影响的测试文件 | `git diff --name-only \| codegraph affected --stdin` |
| `files [path]` | 文件结构 | `codegraph files src --format tree` |
| `status` | 索引状态 | `codegraph status` |

## 原则

- 直接用 CodeGraph 回答代码问题，不要 grep/read 循环
- `explore` 是主力命令


