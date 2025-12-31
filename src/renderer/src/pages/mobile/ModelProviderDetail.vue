<script setup lang="ts">
const route = useRoute()
const { setTitle } = useAppHeader()
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
        <SettingsProvider />
    </div>
</template>

<style scoped>
.mobile-provider-detail {
    width: 100%;
    height: 100%;
    background: var(--bg-card);
}
</style>
