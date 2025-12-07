<script setup lang="ts">
import ChatPage from './pages/chat/index.vue'
import SettingsPage from './pages/settings/index.vue'
import AppNavBar from './components/AppNavBar.vue'
import AppHeader from './components/AppHeader.vue'

const currentView = ref('chat')

const switchView = (view: 'chat' | 'settings') => {
  currentView.value = view
}

provide('switchView', switchView)

</script>

<template>
  <div class="app-layout">
    <AppHeader :current-view="currentView" />
    <div class="app-body">
      <AppNavBar :current-view="currentView" @switch="switchView" />
      <main class="app-content">
        <ChatPage v-if="currentView === 'chat'" />
        <SettingsPage v-else-if="currentView === 'settings'" />
      </main>
    </div>
  </div>
  <ContextMenu />
</template>

<style>
:root {
  --bg-app: #ffffff;
  --bg-sidebar: #fff;
  --bg-header: #fbfbfb;
  --bg-hover: rgba(0, 0, 0, 0.05);
  --bg-active: rgba(0, 0, 0, 0.08);
  --border-subtle: #eaeaea;
  --border-focus: #d1d1d6;

  --accent-color: #000000;
  --accent-text: #ffffff;

  --text-primary: #1d1d1f;
  --text-secondary: #86868b;
  --text-tertiary: #a1a1a6;

  --bubble-me: #2c2c2e;
  --bubble-them: #f2f2f7;

  --header-h: 40px;
  --radius-md: 10px;
  --radius-sm: 6px;

  --font-stack: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;

  /* GlobalSearch 组件所需的变量 */
  --modal-bg: rgba(255, 255, 255, 0.85);
  --modal-backdrop: blur(16px);
  --border-color: rgba(0, 0, 0, 0.05);
  --text-main: #1f2937;
  --text-sub: #6b7280;
  --accent: #3b82f6;
  --active-bg: rgba(59, 130, 246, 0.08);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-stack);
  background-color: var(--bg-app);
  height: 100vh;
  width: 100vw;
  display: flex;
  color: var(--text-primary);
  overflow: hidden;
  font-size: 13px;
  /* 保持精细的字体大小 */
  -webkit-font-smoothing: antialiased;
}

#app {
  width: 100%;
  height: 100%;
}

/* 隐藏滚动条但保持滚动功能 */
::-webkit-scrollbar {
  width: 0px;
  display: none;
}

::-webkit-scrollbar-thumb {
  display: none;
}

::-webkit-scrollbar-track {
  display: none;
}

/* Firefox 隐藏滚动条 */
* {
  scrollbar-width: none;
}

/* IE 和 Edge 隐藏滚动条 */
* {
  -ms-overflow-style: none;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.drag {
  -webkit-app-region: drag;
}

.xicon {
  align-items: center;
}

.app-layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-app);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  width: 100%;
}

.app-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
}
</style>
