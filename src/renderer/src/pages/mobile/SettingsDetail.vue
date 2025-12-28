<script setup lang="ts">
const route = useRoute()
const activeTab = computed(() => route.params.tab as string)
useAppHeader().setTitle(route.query.name as string)
</script>

<template>
    <div class="mobile-settings-detail">
        <SettingsAgents v-if="activeTab === 'agents'" />
        <SettingsProvider v-else-if="activeTab === 'models'" />
        <SettingsDefaultModels v-else-if="activeTab === 'defaultModels'" />
        <SettingsKnowledge v-else-if="activeTab === 'knowledge'" />
        <SettingsTerminal v-else-if="activeTab === 'terminal'" />
        <SettingsDisplay v-else-if="activeTab === 'display'" />
        <SettingsMcp v-else-if="activeTab === 'mcp'" />
        <SettingsUserData v-else-if="activeTab === 'userData'" />
        <SettingsAbout v-else-if="activeTab === 'about'" />
    </div>
</template>

<style scoped>
.mobile-settings-detail {
    width: 100%;
    height: 100%;
    background: #fff;
    display: flex;
    flex-direction: column;
    padding-top: calc(56px + env(safe-area-inset-top));
}

/* Ensure inner components take full height if needed */
:deep(> *) {
    flex: 1;
    overflow: hidden;
}
</style>
