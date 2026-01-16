<script setup lang="ts">
const router = useRouter()
const { customTitle } = useAppHeader()

const handleTabChange = (tabName: string, tabItem: any) => {
    router.push(`/mobile/settings/${tabName}?name=${tabItem.name}`)
}
</script>

<template>
    <div class="mobile-settings-list">
        <AppHeader :custom-title="customTitle" current-view="settings" mode="list" />
        <div class="list-content">
            <SettingsSidebar active-tab="" @tab-change="handleTabChange" />
        </div>
        <MobileTabBar />
    </div>
</template>

<style scoped>
.mobile-settings-list {
    width: 100%;
    height: var(--vh, 100dvh);
    background-color: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
}

.list-content {
    flex: 1;
    overflow: hidden;
}
</style>
