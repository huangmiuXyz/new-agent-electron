<script setup lang="ts">
const props = defineProps<{
    currentView: string
}>()

const emit = defineEmits<{
    (e: 'switch', view: 'chat' | 'notes' | 'settings'): void
}>()

const ChatIcon = useIcon('Chat')
const NotesIcon = useIcon('Document')
const SettingsIcon = useIcon('Settings')
</script>

<template>
    <nav class="app-nav-bar drag">
        <!-- Top Section for Main Navigation -->
        <div class="nav-section no-drag">
            <div class="nav-item" :class="{ active: currentView === 'chat' }" @click="emit('switch', 'chat')"
                title="聊天">
                <ChatIcon class="nav-icon" />
            </div>
            <div class="nav-item" :class="{ active: currentView === 'notes' }" @click="emit('switch', 'notes')"
                title="笔记">
                <NotesIcon class="nav-icon" />
            </div>
        </div>

        <!-- Bottom Section for Settings/System -->
        <div class="nav-section   bottom no-drag">
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



.nav-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
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

.nav-item:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
}

.nav-item.active {
    background-color: rgba(0, 0, 0, 0.06);
    color: var(--text-primary);
}

.nav-icon {
    width: 18px;
    height: 18px;
    transition: transform 0.2s ease;
}

.nav-item.active .nav-icon {
    transform: scale(1);
}
</style>
