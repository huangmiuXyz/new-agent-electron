<script setup lang="ts">
const { customTitle } = useAppHeader()
</script>

<template>
    <div class="mobile-note-list">
        <AppHeader :custom-title="customTitle" current-view="notes" mode="list" />
        <div class="list-content">
            <NotesSidebar />
        </div>
        <MobileTabBar />
    </div>
</template>

<style scoped>
.mobile-note-list {
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

:deep(.notes-sidebar) {
    width: 100% !important;
}
</style>
