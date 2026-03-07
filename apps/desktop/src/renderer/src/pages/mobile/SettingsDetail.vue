<script setup lang="ts">
const route = useRoute()
const activeTab = computed(() => route.params.tab as string)
const { setTitle, customTitle } = useAppHeader()
setTitle(route.query.name as string)
</script>

<template>
    <div class="mobile-settings-detail">
        <AppHeader :custom-title="customTitle" current-view="settings" mode="detail" />
        <div class="detail-content">
            <SettingsAgents v-if="activeTab === 'agents'" />
            <SettingsProvider v-else-if="activeTab === 'models'" />
            <SettingsDefaultModels v-else-if="activeTab === 'defaultModels'" />
            <SettingsKnowledge v-else-if="activeTab === 'knowledge'" />
            <SettingsPlugins v-else-if="activeTab === 'plugins'" />
            <SettingsTerminal v-else-if="activeTab === 'terminal'" />
            <SettingsDisplay v-else-if="activeTab === 'display'" />
            <SettingsMcp v-else-if="activeTab === 'mcp'" />
            <SettingsUserData v-else-if="activeTab === 'userData'" />
            <SettingsBackup v-else-if="activeTab === 'backup'" />
            <SettingsAbout v-else-if="activeTab === 'about'" />
        </div>
    </div>
</template>

<style scoped>
.mobile-settings-detail {
    width: 100%;
    height: 100%;
    background: var(--bg-card);
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.detail-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
}

/* Ensure inner components take full height if needed */
:deep(.detail-content > *) {
    min-height: 0;
}

:deep(.setting-form-container) {
    height: auto !important;
    min-height: 100%;
}

:deep(.setting-content) {
    overflow: visible !important;
    height: auto !important;
    min-height: 0;
}
</style>
