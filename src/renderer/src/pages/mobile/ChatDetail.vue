<script setup lang="ts">
const settingsStore = useSettingsStore()
const { setTitle } = useAppHeader()
const { currentChat } = storeToRefs(useChatsStores())
setTitle(currentChat.value?.title || '新的对话')
</script>

<template>
    <div class="mobile-chat-detail">
        <main class="main-chat">
            <ChatMessageList />
            <Term v-show="settingsStore.display.showTerminal" />
            <ChatMessageInput />
        </main>
    </div>
</template>

<style scoped>
.mobile-chat-detail {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    padding-top: calc(56px + env(safe-area-inset-top));
}

.main-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    position: relative;
    overflow: hidden;
}
</style>
