<script setup lang="ts">
import { defineComponent, h } from 'vue'
import SpeechSidebar from '@renderer/components/SpeechSidebar.vue'
import { useModal } from '@renderer/composables/useModal'

const agentStore = useAgentStore()
const settingsStore = useSettingsStore()
const { setTitle, customTitle } = useAppHeader()
const { currentChat } = storeToRefs(useChatsStores())
const speechSidebarModal = useModal()
const isSpeechPlaylistOpen = ref(false)

const currentAgent = computed(() => {
    const agentId = currentChat.value?.agentId || 'default'
    return agentStore.getAgentById(agentId) || null
})
setTitle(currentChat.value?.title || '新的对话')

const MobileSpeechSidebarContent = defineComponent({
    name: 'MobileSpeechSidebarContent',
    setup() {
        return () =>
            h('div', { class: 'mobile-speech-modal-content' }, [
                h(SpeechSidebar, {
                    collapsed: false,
                    class: 'mobile-speech-modal-sidebar'
                })
            ])
    }
})

const closeSpeechPlaylist = () => {
    const wasOpen = isSpeechPlaylistOpen.value
    isSpeechPlaylistOpen.value = false
    settingsStore.display.speechSidebarCollapsed = true
    if (wasOpen) {
        speechSidebarModal.remove()
    }
}

const openSpeechPlaylist = () => {
    if (isSpeechPlaylistOpen.value) return

    isSpeechPlaylistOpen.value = true
    settingsStore.display.assistantSidebarTab = 'playlist'
    settingsStore.display.speechSidebarCollapsed = false

    speechSidebarModal.confirm({
        title: '播放列表',
        content: MobileSpeechSidebarContent,
        variant: 'drawer',
        showFooter: false,
        showCancel: false,
        maxHeight: 'min(78vh, calc(var(--vh, 100vh) - 12px))',
        modalBodyStyle: {
            padding: '0',
            minHeight: '320px',
            height: 'min(78vh, calc(var(--vh, 100vh) - 12px))',
            overflow: 'hidden'
        },
        onClose: closeSpeechPlaylist
    })
}

watch(
    () => settingsStore.display.speechSidebarCollapsed,
    (collapsed) => {
        if (collapsed) {
            if (isSpeechPlaylistOpen.value) {
                isSpeechPlaylistOpen.value = false
                speechSidebarModal.remove()
            }
            return
        }

        openSpeechPlaylist()
    }
)

onBeforeUnmount(() => {
    if (isSpeechPlaylistOpen.value) {
        isSpeechPlaylistOpen.value = false
        speechSidebarModal.remove()
    }
})
</script>

<template>
    <div class="mobile-chat-detail">
        <AgentBackground :backgrounds="currentAgent?.backgrounds" />
        <AppHeader :custom-title="customTitle" current-view="chat" mode="detail" />
        <main class="main-chat">
            <ChatMessageList />
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
    background: transparent;
    position: relative;
    overflow: hidden;
}

.main-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: transparent;
    position: relative;
    overflow: hidden;
}

:deep(.mobile-speech-modal-content) {
    height: 100%;
    min-height: 320px;
    display: flex;
    flex-direction: column;
}

:deep(.mobile-speech-modal-sidebar) {
    flex: 1;
    min-height: 0;
    border-left: none;
    border-radius: 20px 20px 0 0;
}
</style>
