<script setup lang="ts">
import AppHeader from '../../components/AppHeader.vue'
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
}

.detail-content {
    flex: 1;
    overflow-y: auto;
}

/* Ensure inner components take full height if needed */
:deep(.detail-content > *) {
    flex: 1;
    overflow: hidden;
}
</style>
