<script setup lang="ts">
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
    background: var(--bg-card);
    display: flex;
    flex-direction: column;
}

.list-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    padding: 0;
}

:deep(.sidebar) {
    width: 100% !important;
    background: transparent !important;
}

:deep(.sidebar.is-mobile .nav-list) {
    padding: 0;
    overflow-y: auto;
    padding-bottom: calc(86px + env(safe-area-inset-bottom));
}

:deep(.sidebar.is-mobile .chat-tree-list) {
    gap: 0;
}

:deep(.sidebar.is-mobile .chat-group) {
    gap: 0;
}

:deep(.sidebar.is-mobile .chat-tree-item) {
    min-height: 64px;
    padding: 16px;
    border-radius: 0;
    background: var(--bg-sidebar, #ffffff);
    border: none;
    border-bottom: 1px solid var(--border-subtle);
    box-shadow: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    margin-bottom: 0;
}

:deep(.sidebar.is-mobile .root-item) {
    margin-bottom: 0;
}

:deep(.sidebar.is-mobile .sub-item) {
    min-height: 56px;
    margin-top: 0;
    background: var(--bg-subtle);
    box-shadow: none;
    border-radius: 0;
    padding-left: 24px;
    border-bottom: 1px solid var(--border-subtle);
}

:deep(.sidebar.is-mobile .chat-tree-item:active) {
    transform: none;
    background: var(--bg-active, #f3f4f6);
}

:deep(.sidebar.is-mobile .chat-tree-item:hover) {
    background: var(--bg-hover, #f9fafb);
}

:deep(.sidebar.is-mobile .chat-tree-item.active) {
    background: transparent;
    box-shadow: none;
}

:deep(.sidebar.is-mobile .chat-tree-item.active .chat-title) {
    color: var(--text-primary);
}

:deep(.sidebar.is-mobile .chat-title) {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.3px;
    color: var(--text-primary);
    line-height: 1.4;
}

:deep(.sidebar.is-mobile .sub-item .chat-title) {
    font-size: 15px;
    font-weight: 400;
    color: var(--text-secondary);
}

:deep(.sidebar.is-mobile .item-time) {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
}

:deep(.sidebar.is-mobile .expand-btn),
:deep(.sidebar.is-mobile .expand-placeholder) {
    width: 28px;
    height: 28px;
    margin-right: 8px;
}

:deep(.sidebar.is-mobile .expand-btn) {
    border-radius: 50%;
    background: transparent;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
}

:deep(.sidebar.is-mobile .expand-btn:active) {
    background: var(--bg-active);
}

:deep(.sidebar.is-mobile .subchat-list) {
    margin-left: 0;
    padding-left: 0;
    border-left: none;
    gap: 0;
    margin-bottom: 0;
    margin-top: 0;
}

:deep(.sidebar.is-mobile .task-status) {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg-active);
}

:deep(.sidebar.is-mobile .empty-state) {
    padding: 64px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
}

:deep(.sidebar.is-mobile .empty-text) {
    font-size: 15px;
    color: var(--text-secondary);
    margin-top: 16px;
    font-weight: 500;
}
</style>
