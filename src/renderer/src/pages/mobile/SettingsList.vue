<script setup lang="ts">
const router = useRouter()

const handleTabChange = (tabName: string, tabItem: any) => {
    router.push(`/mobile/settings/${tabName}?name=${tabItem.name}`)
}
</script>

<template>
    <div class="mobile-settings-list">
        <!-- Pass a dummy activeTab or manage it if needed, mainly we just want the list -->
        <SettingsSidebar active-tab="" @tab-change="handleTabChange" />
    </div>
</template>

<style scoped>
.mobile-settings-list {
    width: 100%;
    height: 100%;
    background-color: var(--bg-sidebar);
}
</style>
