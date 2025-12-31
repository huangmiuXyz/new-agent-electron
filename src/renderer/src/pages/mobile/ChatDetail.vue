<script setup lang="ts">
import AppHeader from '../../components/AppHeader.vue'
const settingsStore = useSettingsStore()
const { setTitle, customTitle } = useAppHeader()
const { currentChat } = storeToRefs(useChatsStores())
setTitle(currentChat.value?.title || '新的对话')
</script>

<template>
    <div class="mobile-chat-detail">
        <AppHeader :custom-title="customTitle" current-view="chat" mode="detail" />
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
    height: var(--vh, 100dvh);
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    position: relative;
    overflow: hidden;
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
