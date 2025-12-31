<script setup lang="ts">
import AppHeader from '../../components/AppHeader.vue'
import MobileTabBar from '../../components/MobileTabBar.vue'
const { customTitle } = useAppHeader()
</script>

<template>
    <div class="mobile-chat-list">
        <AppHeader :custom-title="customTitle" current-view="chat" mode="list" />
        <div class="list-content">
            <ChatSidebar />
        </div>
        <MobileTabBar />
    </div>
</template>

<style scoped>
.mobile-chat-list {
    width: 100%;
    height: var(--vh, 100dvh);
    overflow: hidden;
    background-color: var(--bg-card);
    display: flex;
    flex-direction: column;
}

.list-content {
    flex: 1;
    overflow: hidden;
}

:deep(.sidebar) {
    width: 100% !important;
}
</style>
