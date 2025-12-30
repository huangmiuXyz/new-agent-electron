<script setup lang="ts">
</script>

<template>
    <div class="mobile-chat-list">
        <ChatSidebar />
    </div>
</template>

<style scoped>
.mobile-chat-list {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: var(--bg-card);
}

:deep(.sidebar) {
    width: 100% !important;
}
</style>
