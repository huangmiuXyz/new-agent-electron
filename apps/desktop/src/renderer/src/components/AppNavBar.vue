<script setup lang="ts">
const props = defineProps<{
    currentView: string
    placement?: 'sidebar-left' | 'sidebar-top'
}>()

const emit = defineEmits<{
    (e: 'switch', view: 'chat' | 'notes' | 'settings' | 'image' | 'my-apps'): void
}>()

const ChatIcon = useIcon('Chat')
const EditNoteFilled = useIcon('EditNoteFilled')
const Image = useIcon('Image')
const BoxIcon = useIcon('Box')
const SettingsIcon = useIcon('Settings')
</script>

<template>
    <nav class="app-nav-bar drag" :class="props.placement ?? 'sidebar-left'">
        <!-- Top Section for Main Navigation -->
        <div class="nav-section no-drag">
            <div class="nav-item" :class="{ active: currentView === 'chat' }" @click="emit('switch', 'chat')"
                title="聊天">
                <ChatIcon class="nav-icon" />
            </div>
            <div class="nav-item" :class="{ active: currentView === 'notes' }" @click="emit('switch', 'notes')"
                title="笔记">
                <EditNoteFilled class="nav-icon" />
            </div>
            <div class="nav-item" :class="{ active: currentView === 'image' }" @click="emit('switch', 'image')"
                title="生成">
                <Image class="nav-icon" />
            </div>
            <div class="nav-item" :class="{ active: currentView === 'my-apps' }" @click="emit('switch', 'my-apps')"
                title="我的应用">
                <BoxIcon class="nav-icon" />
            </div>
            <div class="nav-item" :class="{ active: currentView === 'settings' }" @click="emit('switch', 'settings')"
                title="设置">
                <SettingsIcon class="nav-icon" />
            </div>
        </div>
    </nav>
</template>

<style scoped>
.app-nav-bar {
    width: 48px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    height: 100%;
    flex-shrink: 0;
    background: var(--bg-header);
}

.app-nav-bar.sidebar-top {
    width: 100%;
    height: var(--header-h);
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 0 6px 0 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent);
    background: color-mix(in srgb, var(--bg-sidebar-surface) 88%, var(--bg-header) 12%);
}



.nav-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
}

.app-nav-bar.sidebar-top .nav-section {
    width: auto;
    flex-direction: row;
    gap: 2px;
}

.nav-item {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-tertiary);
    position: relative;
    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.app-nav-bar.sidebar-top .nav-item {
    width: 28px;
    height: 28px;
    border-radius: 6px;
}

.nav-item:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
}

.nav-item.active {
    background-color: var(--bg-hover);
    color: var(--text-primary);
}

.nav-icon {
    width: 18px;
    height: 18px;
    transition: transform 0.2s ease;
}

.app-nav-bar.sidebar-top .nav-icon {
    width: 16px;
    height: 16px;
}

.nav-item.active .nav-icon {
    transform: scale(1);
}

.notification-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    background-color: #ef4444;
    color: white;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 10px;
    line-height: 1;
    min-width: 12px;
    text-align: center;
    border: 2px solid var(--bg-header);
    transform: translate(25%, -25%);
}
</style>
