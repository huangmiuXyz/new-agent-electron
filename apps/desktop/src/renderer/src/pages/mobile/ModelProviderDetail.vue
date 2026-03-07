<script setup lang="ts">
const route = useRoute()
const { setTitle, customTitle } = useAppHeader()
const settingsStore = useSettingsStore()

watch(() => route.params.id, (newId) => {
    if (newId) {
        localStorage.setItem('activeProviderId', newId as string)
        const provider = settingsStore.getProviderById(newId as string)
        if (provider && setTitle) {
            setTitle(provider.name)
        }
    }
}, { immediate: true })

</script>

<template>
    <div class="mobile-provider-detail">
        <AppHeader :custom-title="customTitle" current-view="settings" mode="detail" />
        <div class="detail-content">
            <SettingsProvider />
        </div>
    </div>
</template>

<style scoped>
.mobile-provider-detail {
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
