import type { MainPlugin, MainPluginContext } from '@agent-qi/types'
import type { BrowserWindow } from 'electron'

const WINDOW_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<title>OpenCode Go 用量</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #1a1a1a;
    color: #e5e5e5;
    padding: 20px;
    min-height: 100vh;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px;
  }
  .title { font-size: 16px; font-weight: 600; }
  .updated { font-size: 12px; color: #888; }
  .card {
    background: #242424;
    border: 1px solid #333;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  .card-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px;
  }
  .card-title { font-size: 13px; font-weight: 600; color: #ccc; }
  .card-value { font-size: 18px; font-weight: 700; }
  .card-value .remain { font-size: 12px; color: #888; font-weight: 400; margin-left: 6px; }
  .progress {
    position: relative; height: 8px; border-radius: 999px;
    background: rgba(127,127,127,0.18); overflow: hidden; margin: 8px 0;
  }
  .progress-bar {
    position: absolute; top: 0; left: 0; height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #1f7ae0 0%, #41b3ff 100%);
    transition: width 0.4s ease;
  }
  .reset { font-size: 12px; color: #888; display: flex; justify-content: space-between; }
  .empty { text-align: center; color: #666; padding: 60px 0; font-size: 13px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600;
  }
  .badge.ok { background: rgba(34,197,94,0.15); color: #4ade80; }
  .badge.warn { background: rgba(234,179,8,0.15); color: #facc15; }
  .badge.exceeded { background: rgba(239,68,68,0.15); color: #f87171; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">OpenCode Go 用量</div>
    <div class="updated" id="updated">等待数据…</div>
  </div>
  <div id="content">
    <div class="empty">点击状态栏图标，或等待渲染端推送数据。</div>
  </div>
  <script>
    window.__updateUsage = function (data) {
      var el = document.getElementById('content');
      var updated = document.getElementById('updated');
      if (!data) { el.innerHTML = '<div class="empty">暂无数据</div>'; return; }
      var entries = [
        { key: 'rolling', label: '5 小时 (Rolling)' },
        { key: 'weekly', label: '1 周 (Weekly)' },
        { key: 'monthly', label: '1 月 (Monthly)' }
      ];
      var html = '';
      entries.forEach(function (e) {
        var item = data[e.key];
        if (!item) return;
        var pct = Math.max(0, Math.min(100, item.percentage));
        var remain = 100 - pct;
        var cls = 'ok';
        if (item.status === 'exceeded') cls = 'exceeded';
        else if (pct >= 80) cls = 'warn';
        html += '<div class="card">' +
          '<div class="card-head">' +
            '<span class="card-title">' + e.label + '</span>' +
            '<span class="badge ' + cls + '">' + item.status + '</span>' +
          '</div>' +
          '<div class="card-value">' + pct + '%<span class="remain">剩余 ' + remain + '%</span></div>' +
          '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="reset"><span>重置</span><span>' + (item.resetsIn || '--') + '</span></div>' +
        '</div>';
      });
      if (!html) html = '<div class="empty">暂无用量数据</div>';
      el.innerHTML = html;
      var d = new Date(data.lastUpdated || Date.now());
      updated.textContent = '更新于 ' + d.toLocaleTimeString();
    };
  </script>
</body>
</html>`

let win: BrowserWindow | null = null
/** 缓存最近一次推送的数据，新窗口 ready 后回放，避免打开瞬间空白 */
let lastData: Record<string, unknown> | null = null
let isWindowReady = false

const pushUsageToWindow = (w: BrowserWindow, data: Record<string, unknown> | null): void => {
  if (!data) return
  if (w.isDestroyed()) return
  void w.webContents.executeJavaScript(`window.__updateUsage(${JSON.stringify(data)})`)
    .catch((err) => console.error('[opencode-usage-monitor] update-usage failed:', err))
}

const mainPlugin: MainPlugin = {
  name: 'opencode-usage-monitor',
  version: '1.0.0',
  description: 'OpenCode usage monitor main-process window',

  install: (ctx: MainPluginContext) => {
    const { BrowserWindow } = ctx.electron

    const ensureWindow = (): Promise<BrowserWindow> => {
      if (win && !win.isDestroyed()) return Promise.resolve(win)
      isWindowReady = false
      win = new BrowserWindow({
        width: 480,
        height: 620,
        minWidth: 360,
        title: 'OpenCode Go 用量',
        backgroundColor: '#1a1a1a',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })

      const readyPromise = new Promise<void>((resolve) => {
        win!.webContents.once('did-finish-load', () => {
          isWindowReady = true
          resolve()
        })
        win!.webContents.once('dom-ready', () => {
          isWindowReady = true
          resolve()
        })
      })

      void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(WINDOW_HTML))

      win.on('closed', () => {
        win = null
        isWindowReady = false
      })

      return readyPromise.then(() => win as BrowserWindow)
    }

    ctx.ipc.handle('show-window', async () => {
      const w = await ensureWindow()
      w.show()
      w.focus()
      if (lastData) pushUsageToWindow(w, lastData)
      return { ok: true }
    })

    ctx.ipc.handle('hide-window', () => {
      if (win && !win.isDestroyed()) win.hide()
      return { ok: true }
    })

    ctx.ipc.handle('update-usage', (_event, data) => {
      lastData = data || null
      if (!win || win.isDestroyed() || !isWindowReady) return { ok: false, error: 'window not ready' }
      pushUsageToWindow(win, lastData)
      return { ok: true }
    })

    ctx.onUnload(() => {
      if (win && !win.isDestroyed()) {
        win.destroy()
      }
      win = null
      isWindowReady = false
      lastData = null
    })

    ctx.logger.info('main-process window plugin installed')
  },

  uninstall: (ctx: MainPluginContext) => {
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
    win = null
    isWindowReady = false
    lastData = null
    ctx.logger.info('main-process window plugin uninstalled')
  }
}

export default mainPlugin
