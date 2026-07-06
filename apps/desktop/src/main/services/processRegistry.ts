import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { AsyncLocalStorage } from 'async_hooks'
import os from 'os'

/**
 * 跨平台递归终止进程树
 */
async function treeKill(pid: number, signal: string = 'SIGTERM'): Promise<void> {
  if (os.platform() === 'win32') {
    // Windows: 用 taskkill 递归终止进程树
    try {
      await new Promise<void>((resolve, reject) => {
        execFile('taskkill', ['/T', '/F', '/PID', String(pid)], (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch {
      // 进程可能已不存在
    }
    return
  }

  // Unix (macOS/Linux): 递归获取子进程 PID 再逐个 kill
  const children = await getChildPids(pid)
  const allPids = [pid, ...children]
  for (const p of allPids) {
    try {
      process.kill(p, signal as unknown as number)
    } catch {
      // 进程可能已不存在
    }
  }
}

/**
 * 递归获取指定进程的所有子进程 PID
 */
async function getChildPids(pid: number): Promise<number[]> {
  const result: number[] = []
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile('pgrep', ['-P', String(pid)], { timeout: 3000 }, (err, stdout) => {
        if (err) {
          // pgrep 返回 1 = 没有匹配，不是真正的错误
          if ((err as any)?.code === 1) resolve('')
          else reject(err)
        } else {
          resolve(stdout)
        }
      })
    })
    const lines = output.trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const childPid = parseInt(line.trim(), 10)
      if (!isNaN(childPid) && childPid > 0) {
        result.push(childPid)
        // 递归获取孙子进程
        const grandChildren = await getChildPids(childPid)
        result.push(...grandChildren)
      }
    }
  } catch {
    // pgrep 不可用或超时
  }
  return result
}

/**
 * 插件子进程注册表
 *
 * 追踪所有插件 spawn/fork/exec 创建的子进程，
 * 在插件卸载或 app 退出时递归终止整个进程树，
 * 防止产生孤儿进程。
 */
class PluginProcessRegistry {
  // pluginName -> Set<pid>
  private processMap = new Map<string, Set<number>>()
  // pid -> pluginName（反向查找，用于快速注销）
  private pidToPlugin = new Map<number, string>()

  /**
   * 注册一个子进程
   */
  register(pluginName: string, pid: number): void {
    if (!pid || pid <= 0) return
    if (!this.processMap.has(pluginName)) {
      this.processMap.set(pluginName, new Set())
    }
    this.processMap.get(pluginName)!.add(pid)
    this.pidToPlugin.set(pid, pluginName)
  }

  /**
   * 注销一个子进程（进程自然退出时调用）
   */
  unregister(pid: number): void {
    const pluginName = this.pidToPlugin.get(pid)
    if (pluginName) {
      this.processMap.get(pluginName)?.delete(pid)
      if (this.processMap.get(pluginName)?.size === 0) {
        this.processMap.delete(pluginName)
      }
      this.pidToPlugin.delete(pid)
    }
  }

  /**
   * 杀掉指定插件的所有子进程（递归终止进程树）
   */
  async killAll(pluginName: string): Promise<void> {
    const pids = this.processMap.get(pluginName)
    if (!pids || pids.size === 0) return

    const pidArray = [...pids]
    // 先清除记录，防止重复 kill
    this.processMap.delete(pluginName)
    for (const pid of pidArray) {
      this.pidToPlugin.delete(pid)
    }

    // 递归终止每个进程树
    await Promise.allSettled(pidArray.map((pid) => treeKill(pid)))
  }

  /**
   * 杀掉所有插件子进程（app 退出时调用）
   */
  async killAllPlugins(): Promise<void> {
    const pluginNames = [...this.processMap.keys()]
    await Promise.allSettled(pluginNames.map((name) => this.killAll(name)))
  }

  /**
   * 获取进程数量统计
   */
  getStats(): { pluginCount: number; processCount: number } {
    let processCount = 0
    for (const pids of this.processMap.values()) {
      processCount += pids.size
    }
    return {
      pluginCount: this.processMap.size,
      processCount
    }
  }

  /**
   * 设置 IPC handlers
   */
  setupIpcHandlers(): void {
    ipcMain.on('plugin:process:register', (_event, { pluginName, pid }: { pluginName: string; pid: number }) => {
      this.register(pluginName, pid)
    })

    ipcMain.on('plugin:process:unregister', (_event, { pid }: { pid: number }) => {
      this.unregister(pid)
    })

    // 渲染进程主动请求杀掉某个插件的所有子进程
    ipcMain.handle('plugin:process:kill-all', async (_event, pluginName: string) => {
      await this.killAll(pluginName)
    })

    // 渲染进程请求注册表统计
    ipcMain.handle('plugin:process:stats', () => {
      return this.getStats()
    })
  }

  /**
   * 监听 app 退出事件，清理所有子进程
   */
  setupAppHooks(): void {
    const cleanup = () => {
      this.killAllPlugins().catch((err) => {
        console.error('[processRegistry] cleanup error:', err)
      })
    }

    app.on('before-quit', cleanup)
    app.on('will-quit', cleanup)

    // 捕获未处理异常时也尝试清理
    process.on('uncaughtException', (error) => {
      console.error('[processRegistry] uncaughtException, cleaning up:', error)
      cleanup()
    })
  }
}

export const pluginProcessRegistry = new PluginProcessRegistry()

// ── 全局 child_process 模块包装 ─────────────────────────────────
// 在 main process 层包装 child_process.spawn/exec/fork，
// 兜住所有通过 require('child_process') 创建的子进程，
// 包括主插件中直接 import { fork } from 'child_process' 的场景。
//
// 与 pluginMainLoader 配合：加载插件时通过 asyncPluginContext.run(pluginName)
// 设置上下文，包装函数自动读取并注册 PID。
// ────────────────────────────────────────────────────────────────

export const asyncPluginContext = new AsyncLocalStorage<string>()

function patchChildProcessModule(): void {
  // 只能用 require 获取模块，因为 import 已经创建了不可变绑定
  const cp = require('child_process')

  const originalSpawn = cp.spawn
  const originalExec = cp.exec
  const originalFork = cp.fork

  if (typeof originalSpawn !== 'function' || typeof originalFork !== 'function') {
    console.warn('[processRegistry] child_process module not available for patching')
    return
  }

  cp.spawn = function patchedSpawn(...args: any[]) {
    const child = originalSpawn.call(cp, ...args)
    const pid = child?.pid
    if (pid) {
      const pluginName = asyncPluginContext.getStore()
      pluginProcessRegistry.register(pluginName || '__main__', pid)
      child.on('exit', () => pluginProcessRegistry.unregister(pid))
      child.on('error', () => pluginProcessRegistry.unregister(pid))
    }
    return child
  }

  cp.exec = function patchedExec(...args: any[]) {
    const child = originalExec.call(cp, ...args)
    const pid = child?.pid
    if (pid) {
      const pluginName = asyncPluginContext.getStore()
      // exec 创建的子进程：child.pid 对应的是 shell 进程而非实际命令
      // 但递归 tree-kill 仍能覆盖整个进程树
      pluginProcessRegistry.register(pluginName || '__main__', pid)
      child.on('exit', () => pluginProcessRegistry.unregister(pid))
      child.on('error', () => pluginProcessRegistry.unregister(pid))
    }
    return child
  }

  cp.fork = function patchedFork(...args: any[]) {
    const child = originalFork.call(cp, ...args)
    const pid = child?.pid
    if (pid) {
      const pluginName = asyncPluginContext.getStore()
      pluginProcessRegistry.register(pluginName || '__main__', pid)
      child.on('exit', () => pluginProcessRegistry.unregister(pid))
      child.on('error', () => pluginProcessRegistry.unregister(pid))
    }
    return child
  }
}

// 在模块加载时立即执行补丁，确保早于任何插件加载
patchChildProcessModule()
